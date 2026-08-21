/**
 * The browser pass: drive the real interface and report what actually breaks.
 *
 * Everything upstream of this checks the application in pieces -- modules
 * import, paths match, the API answers. None of that catches the failure a
 * user reports, which is "I clicked the thing and the page went white". That
 * only happens in a browser, with a session, against a rendered DOM, so this
 * runs the built frontend against a live API and watches four channels at
 * once on every screen:
 *
 *   - uncaught exceptions        (pageerror)   -- what blanks a screen
 *   - console errors             (console)     -- what precedes it
 *   - requests that never landed (requestfailed)
 *   - API responses that are 4xx/5xx           -- the empty-list bug
 *
 * plus a rendered-content check, because a screen can crash quietly: React
 * unmounts the tree, the boundary catches nothing, and the document is
 * technically fine and visibly empty.
 *
 * It signs in as both roles, because the two see different navigation and
 * different screens, and a route that renders for the doctor can still throw
 * for the PA on data they are not sent.
 *
 * Runs against `doctor_test`, never the practice's own database -- see
 * verify/e2e_setup.py. Signing in writes to the audit trail, so this must
 * never be pointed at live records.
 */

import { chromium } from "playwright";

const WEB = (process.env.WEB_BASE || "http://127.0.0.1:4173").replace(/\/+$/, "");
const API = (process.env.API_BASE || "http://127.0.0.1:5001/api").replace(/\/+$/, "");

const DOCTOR = {
  email: process.env.DOCTOR_EMAIL || "",
  password: process.env.DOCTOR_PASSWORD || "",
};
const PA = {
  email: process.env.PA_EMAIL || "",
  password: process.env.PA_PASSWORD || "",
};

const findings = [];
let checks = 0;
let screens = 0;

function report(severity, summary, where, detail) {
  findings.push({ severity, summary, where: where || "", detail: detail || "" });
}

/**
 * Console noise that is not a defect. Kept deliberately short: every entry
 * here is a thing this pass can no longer see, so a broad pattern buys quiet
 * at the cost of the next real bug.
 */
const BENIGN_CONSOLE = [
  /React DevTools/i,
  /Download the React DevTools/i,
  /favicon\.ico/i,
  // React Router's own advance notices about future major versions.
  /React Router Future Flag Warning/i,
];

function isBenign(text) {
  return BENIGN_CONSOLE.some((re) => re.test(text));
}

/** Attaches the four listeners and returns a collector you can drain. */
function watch(page) {
  const box = { console: [], errors: [], failed: [], bad: [] };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isBenign(text)) return;
    box.console.push(text);
  });

  page.on("pageerror", (err) => {
    box.errors.push(err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : String(err));
  });

  page.on("requestfailed", (req) => {
    const failure = req.failure();
    const reason = failure ? failure.errorText : "unknown";
    // A navigation the test itself aborted is not a defect.
    if (/ERR_ABORTED/.test(reason)) return;
    box.failed.push(`${req.method()} ${req.url()} -- ${reason}`);
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    const status = res.status();
    if (status < 400) return;
    box.bad.push({ status, url, method: res.request().method() });
  });

  box.drain = () => {
    const snapshot = {
      console: [...box.console],
      errors: [...box.errors],
      failed: [...box.failed],
      bad: [...box.bad],
    };
    box.console.length = 0;
    box.errors.length = 0;
    box.failed.length = 0;
    box.bad.length = 0;
    return snapshot;
  };
  return box;
}

/** What is actually on the screen right now. */
async function inspect(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root") || document.body;
    const text = (root.innerText || "").replace(/\s+/g, " ").trim();
    return {
      textLength: text.length,
      elements: root.querySelectorAll("*").length,
      // The app's own crash fallback -- components/ErrorBoundary.
      boundary: text.includes("Something went wrong"),
      notFound: text.includes("404"),
      excerpt: text.slice(0, 120),
      url: location.pathname + location.search,
    };
  });
}

async function settle(page, ms = 700) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    /* a socket that stays open is normal here -- the queue holds one */
  }
  await page.waitForTimeout(ms);
}

/**
 * Visit one screen and judge it.
 *
 * `allowStatus` lists API statuses that are expected on this screen -- the
 * login page probing /auth/me without a token, for instance. Anything else
 * in the 4xx/5xx range is reported, because that is the shape of the bug
 * where the page renders perfectly around data that never arrived.
 */
async function visit(page, box, path, label, opts = {}) {
  const { allowStatus = [], expectPath = null, minText = 40 } = opts;
  screens += 1;
  checks += 1;

  box.drain();
  let navigationError = null;
  try {
    await page.goto(WEB + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    navigationError = err.message;
  }
  await settle(page);

  const where = `${label} ${path}`;
  if (navigationError) {
    report("error", `${label}: navigation to ${path} failed`, where, navigationError);
    return null;
  }

  const seen = box.drain();
  const view = await inspect(page);

  if (view.boundary) {
    report(
      "error",
      `${label}: ${path} rendered the crash boundary`,
      where,
      `The ErrorBoundary fallback is on screen, so a component threw while rendering.\n` +
        (seen.errors[0] || seen.console[0] || "(no exception captured)")
    );
  } else if (view.textLength < minText || view.elements < 8) {
    report(
      "error",
      `${label}: ${path} rendered a blank screen`,
      where,
      `Only ${view.textLength} characters and ${view.elements} elements under #root.\n` +
        `excerpt: ${view.excerpt || "(empty)"}\n` +
        (seen.errors[0] || seen.console[0] || "(no exception captured)")
    );
  }

  if (expectPath && !view.url.startsWith(expectPath)) {
    report(
      "error",
      `${label}: ${path} did not land on ${expectPath}`,
      where,
      `Ended up at ${view.url}.`
    );
  }

  for (const err of seen.errors) {
    report("error", `${label}: uncaught exception on ${path}`, where, err);
  }
  for (const text of seen.console.slice(0, 3)) {
    report("error", `${label}: console error on ${path}`, where, text);
  }
  for (const failure of seen.failed.slice(0, 3)) {
    report("error", `${label}: request failed on ${path}`, where, failure);
  }
  for (const bad of seen.bad) {
    if (allowStatus.includes(bad.status)) continue;
    report(
      "error",
      `${label}: ${bad.method} ${new URL(bad.url).pathname} answered ${bad.status}`,
      where,
      "The screen renders around data that never arrived -- an empty list or a " +
        "blank panel is what the user sees."
    );
  }

  return view;
}

/** Sign in through the real form, as a user would. */
async function signIn(page, box, who, label) {
  checks += 1;
  box.drain();
  await page.goto(WEB + "/login", { waitUntil: "domcontentloaded" });
  await settle(page, 400);

  const user = page.locator('input[autocomplete="username"]');
  const pass = page.locator('input[autocomplete="current-password"]');
  if ((await user.count()) === 0 || (await pass.count()) === 0) {
    report("error", `${label}: the login form is not on /login`, "/login",
      "Expected a username and a password field.");
    return false;
  }

  await user.fill(who.email);
  await pass.fill(who.password);
  box.drain();
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  } catch {
    const view = await inspect(page);
    report(
      "error",
      `${label}: sign-in did not reach the dashboard`,
      "/login",
      `Still at ${view.url}. On screen: ${view.excerpt}`
    );
    return false;
  }
  await settle(page);
  return true;
}

async function signOut(page) {
  await page.evaluate(() => {
    localStorage.removeItem("mediassist_access_token");
    localStorage.removeItem("mediassist_refresh_token");
    localStorage.removeItem("mediassist_user");
  });
}

/** Ask the API directly, with the session's own token, for ids to deep-link. */
async function idsFor(page) {
  return page.evaluate(async (api) => {
    const token = localStorage.getItem("mediassist_access_token");
    const get = async (path) => {
      try {
        const res = await fetch(api + path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body && body.data;
      } catch {
        return null;
      }
    };
    const first = (value) => {
      const list = Array.isArray(value) ? value : value && value.items;
      return Array.isArray(list) && list.length ? list[0] : null;
    };
    const patient = first(await get("/patients"));
    const consultation = first(await get("/consultations"));
    const caseRow = first(await get("/cases"));
    return {
      patient: patient && patient.id,
      consultation: consultation && consultation.id,
      case: caseRow && caseRow.id,
    };
  }, API);
}

/** Click a real sidebar link and confirm the screen behind it renders. */
async function clickThroughNav(page, box, label) {
  const links = await page.locator("aside a, nav a").evaluateAll((nodes) =>
    nodes
      .map((n) => ({ href: n.getAttribute("href"), text: (n.innerText || "").trim() }))
      .filter((l) => l.href && l.href.startsWith("/dashboard"))
  );

  const seenHrefs = new Set();
  for (const link of links) {
    if (seenHrefs.has(link.href)) continue;
    seenHrefs.add(link.href);
    checks += 1;
    box.drain();

    const target = page.locator(`aside a[href="${link.href}"], nav a[href="${link.href}"]`).first();
    if ((await target.count()) === 0) continue;
    try {
      await target.click({ timeout: 8000 });
    } catch (err) {
      report("error", `${label}: sidebar item "${link.text}" is not clickable`,
        link.href, err.message);
      continue;
    }
    await settle(page, 500);

    const view = await inspect(page);
    const seen = box.drain();
    if (view.boundary || view.textLength < 40) {
      report(
        "error",
        `${label}: sidebar item "${link.text}" leads to a blank page`,
        link.href,
        `${view.textLength} characters under #root after the click.\n` +
          (seen.errors[0] || seen.console[0] || "(no exception captured)")
      );
    }
    if (view.notFound && view.textLength < 400) {
      report(
        "error",
        `${label}: sidebar item "${link.text}" lands on the 404 screen`,
        link.href,
        "The nav entry points at a path no route matches."
      );
    }
    for (const err of seen.errors) {
      report("error", `${label}: exception after clicking "${link.text}"`, link.href, err);
    }
  }
}

/** The interactive furniture: the menus that hang off the top bar. */
async function exerciseMenus(page, box, label) {
  const candidates = [
    { name: "profile menu", selector: 'header button:has(img), header button[aria-haspopup], header [role="button"]' },
    { name: "notification menu", selector: 'header button[aria-label*="otification"], button[aria-label*="otification"]' },
  ];

  for (const candidate of candidates) {
    const button = page.locator(candidate.selector).first();
    if ((await button.count()) === 0) continue;
    checks += 1;
    box.drain();

    const before = await page.locator("body *").count();
    try {
      await button.click({ timeout: 6000 });
    } catch {
      continue; // not clickable here -- covered by the nav pass
    }
    await page.waitForTimeout(500);
    const after = await page.locator("body *").count();
    const seen = box.drain();

    if (after <= before) {
      report(
        "warn",
        `${label}: the ${candidate.name} did not open`,
        "topbar",
        "Clicking it added no elements to the document. It may be a static " +
          "control, or the panel may be failing to mount."
      );
    }
    for (const err of seen.errors) {
      report("error", `${label}: exception opening the ${candidate.name}`, "topbar", err);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function main() {
  if (!DOCTOR.email || !PA.email) {
    report("error", "No credentials were supplied to the browser pass", "verify/run.py",
      "DOCTOR_EMAIL / PA_EMAIL were empty, so nothing could be signed into.");
    emit();
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const box = watch(page);

  try {
    // -- public screens, signed out -----------------------------------
    // /auth/me answering 401 here is the app checking a session it does
    // not have; that is the design, not a failure.
    for (const [path, label] of [
      ["/", "public"],
      ["/login", "public"],
      ["/forgot-password", "public"],
      ["/privacy", "public"],
      ["/terms", "public"],
      ["/portal/login", "portal"],
      ["/portal/register", "portal"],
    ]) {
      await visit(page, box, path, label, { allowStatus: [401] });
    }

    // -- the guard: no session, no dashboard --------------------------
    checks += 1;
    await signOut(page);
    await visit(page, box, "/dashboard", "guard", {
      allowStatus: [401],
      expectPath: "/login",
    });

    // -- the catch-all ------------------------------------------------
    const missing = await visit(page, box, "/dashboard/no-such-screen", "guard", {
      allowStatus: [401],
    });
    if (missing && !missing.notFound) {
      report("error", "A path with no route did not render the 404 screen",
        "/dashboard/no-such-screen",
        `On screen: ${missing.excerpt}. Without the catch-all this is a blank document.`);
    }

    // -- form validation: wrong credentials are refused, visibly ------
    checks += 1;
    box.drain();
    await page.goto(WEB + "/login", { waitUntil: "domcontentloaded" });
    await settle(page, 400);
    await page.locator('input[autocomplete="username"]').fill("not.a.real.user@example.test");
    await page.locator('input[autocomplete="current-password"]').fill("definitely-wrong");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);
    {
      const view = await inspect(page);
      const body = (await page.locator("body").innerText()).toLowerCase();
      const refused =
        view.url.startsWith("/login") &&
        /invalid|incorrect|wrong|failed|not found|unable|credential/.test(body);
      if (!refused) {
        report(
          "error",
          "Bad credentials were not visibly refused on the login form",
          "/login",
          `Ended at ${view.url}. The form must stay put and say why -- a silent ` +
            `failure reads as a broken button.\nOn screen: ${view.excerpt}`
        );
      }
      box.drain(); // the deliberate 401 is not a finding
    }

    // -- the doctor ---------------------------------------------------
    if (await signIn(page, box, DOCTOR, "doctor")) {
      const ids = await idsFor(page);
      const routes = [
        "/dashboard",
        "/dashboard/patients",
        "/dashboard/appointments",
        "/dashboard/queue",
        "/dashboard/consultations",
        "/dashboard/prescriptions",
        "/dashboard/cases",
        "/dashboard/reports",
        "/dashboard/assistants",
        "/dashboard/doctors",
        "/dashboard/settings",
        "/dashboard/settings/security",
        "/dashboard/profile",
      ];
      for (const path of routes) await visit(page, box, path, "doctor");

      if (ids.patient) await visit(page, box, `/dashboard/patients/${ids.patient}`, "doctor");
      if (ids.consultation)
        await visit(page, box, `/dashboard/consultations/${ids.consultation}`, "doctor");
      if (ids.case) await visit(page, box, `/dashboard/cases/${ids.case}`, "doctor");

      await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded" });
      await settle(page, 500);
      await clickThroughNav(page, box, "doctor");
      await exerciseMenus(page, box, "doctor");
      await signOut(page);
    }

    // -- the PA -------------------------------------------------------
    if (await signIn(page, box, PA, "pa")) {
      const routes = [
        "/dashboard",
        "/dashboard/patients",
        "/dashboard/appointments",
        "/dashboard/queue",
        "/dashboard/reports",
        "/dashboard/settings",
        "/dashboard/profile",
      ];
      for (const path of routes) await visit(page, box, path, "pa");

      const ids = await idsFor(page);
      if (ids.patient) await visit(page, box, `/dashboard/patients/${ids.patient}`, "pa");

      await page.goto(WEB + "/dashboard", { waitUntil: "domcontentloaded" });
      await settle(page, 500);
      await clickThroughNav(page, box, "pa");
      await exerciseMenus(page, box, "pa");

      // The role boundary, as the browser sees it: a PA asking for the
      // doctor's clinical screens must be turned away, not shown them.
      checks += 1;
      const blocked = await visit(page, box, "/dashboard/consultations", "pa", {
        allowStatus: [401, 403],
      });
      if (blocked && /consultation/i.test(blocked.excerpt) && blocked.textLength > 400) {
        report(
          "warn",
          "The PA may be seeing the doctor's consultations screen",
          "/dashboard/consultations",
          "RoleRoute should redirect. The API refuses the writes regardless, " +
            "so this is a interface leak rather than a privilege one.\n" +
            `On screen: ${blocked.excerpt}`
        );
      }
    }
  } catch (err) {
    report("error", "The browser pass stopped early", "verify/e2e/run_e2e.mjs",
      err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n") : String(err));
  } finally {
    await browser.close().catch(() => {});
  }

  emit();
}

function emit() {
  console.log("---JSON---");
  console.log(JSON.stringify({ findings, screens, checks }));
}

main();
