"""Do the detectors still detect?

A check that reports nothing looks exactly like a codebase with nothing wrong,
and the two stay indistinguishable until somebody deliberately breaks
something. That happened by hand while this harness was being written, and it
immediately found a hole: `frontend_routes` was scanning for `to="/path"`, the
JSX attribute, while Sidebar.jsx writes its entries as `{ to: "/path" }`,
object properties. Both navigation menus -- the exact surface the check exists
to guard -- were invisible to it, and it had been passing confidently.

So the fixtures below are that experiment, kept. Each one is a fault this
harness has to see, paired with the corrected form it must stay quiet about.
A silent detector fails here rather than in production.

    python verify/selftest.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from checks import api_contract, clock_rule, frontend_routes  # noqa: E402

PASSED = []
FAILED = []


def check(label, condition, detail=None):
    if condition:
        PASSED.append(label)
        print("  PASS  %s" % label)
    else:
        FAILED.append((label, detail))
        print("  FAIL  %s" % label)
        if detail is not None:
            print("        %s" % detail)


def section(title):
    print("\n--- %s ---" % title)


def clock_hits(line):
    return [summary for pattern, summary, _why in clock_rule.RULES if pattern.search(line)]


def main():
    # ------------------------------------------------------ clock rule --
    section("the two clocks stay apart")

    # The real defect, from portal/pdf/appointment_slip_generator: a local
    # wall-clock column serialised as though it were UTC.
    bad = "appointment_time = to_utc_iso(appointment.scheduled_at)"
    check("to_utc_iso() on scheduled_at is caught", clock_hits(bad), bad)

    good = "appointment_time = to_local_iso(appointment.scheduled_at)"
    check("to_local_iso() on scheduled_at is accepted", not clock_hits(good), good)

    bad = "if appointment.scheduled_at < datetime.utcnow() + timedelta(minutes=30):"
    check("scheduled_at judged against utcnow() is caught", clock_hits(bad), bad)

    good = "if appointment.scheduled_at < datetime.now() + timedelta(minutes=30):"
    check("scheduled_at judged against now() is accepted", not clock_hits(good), good)

    bad = "start, end = local_day_bounds()\n    q.filter(Appointment.scheduled_at >= start)"
    check("scheduled_at against local_day_bounds() is caught",
          clock_hits(bad.replace("\n", " ")), bad)

    bad = "when = db.func.coalesce(Appointment.scheduled_at, Appointment.created_at)"
    check("coalesce() across the two clocks is caught", clock_hits(bad), bad)

    good = ("when = db.func.coalesce(Appointment.scheduled_at, "
            "local_clock(Appointment.created_at))")
    check("coalesce() with local_clock() is accepted", not clock_hits(good), good)

    bad = 'return {"created_at": to_local_iso(self.created_at)}'
    check("to_local_iso() on a UTC column is caught", clock_hits(bad), bad)

    good = 'return {"created_at": to_utc_iso(self.created_at)}'
    check("to_utc_iso() on a UTC column is accepted", not clock_hits(good), good)

    # ------------------------------------------------- links and routes --
    section("every link lands somewhere")

    def links_in(text):
        found = []
        for pattern in frontend_routes.LINK_RES:
            found += [m.group(1) for m in pattern.finditer(text)]
        return found

    # The form both sidebars actually use. This is the fixture that exists
    # because the check used to miss it entirely.
    nav = '{ to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },'
    check("a nav entry written as an object property is seen",
          "/dashboard/patients" in links_in(nav), nav)

    jsx = '<NavLink to="/dashboard/queue" className="...">Queue</NavLink>'
    check("a NavLink attribute is seen", "/dashboard/queue" in links_in(jsx), jsx)

    braced = '<Link to={"/dashboard/settings"}>Settings</Link>'
    check("a braced attribute is seen", "/dashboard/settings" in links_in(braced), braced)

    imperative = 'navigate("/login", { replace: true });'
    check("navigate() is seen", "/login" in links_in(imperative), imperative)

    # Nested routes: a child's path only means anything with its parent's in
    # front of it, and the tag scanner has to survive an element inside an
    # attribute -- `element={<DashboardLayout />}` -- without reading the
    # first '>' as the end of the tag.
    router = """
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="queue" element={<PatientQueue />} />
            <Route path="patients/:patientId" element={<PatientDetails />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    """
    routes, catch_all = frontend_routes._declared_routes(router)

    check("a nested child route resolves to its full path",
          "/dashboard/queue" in routes, sorted(routes))
    check("an index route resolves to its parent",
          "/dashboard" in routes, sorted(routes))
    check("a parameterised route is flattened",
          "/dashboard/patients/*" in routes, sorted(routes))
    check("a layout route with no path adds no segment",
          "/login" in routes, sorted(routes))
    check("the catch-all is recognised", catch_all)

    without = router.replace('<Route path="*" element={<NotFound />} />', "")
    _routes, none_found = frontend_routes._declared_routes(without)
    check("a missing catch-all is noticed", not none_found)

    check("a link built from data resolves to its parameterised route",
          frontend_routes._resolves("/dashboard/patients/42", routes), sorted(routes))
    check("a link written with a template literal resolves too",
          frontend_routes._resolves("/dashboard/patients/${patient.id}", routes))
    check("a link to a route that does not exist is caught",
          not frontend_routes._resolves("/dashboard/ghost-screen", routes))

    # ----------------------------------------------------- API contract --
    section("the API contract")

    canonical = api_contract._canonical
    check("a template literal and a Flask converter agree",
          canonical("/cases/${caseId}/close") == canonical("/cases/<int:case_id>/close"),
          (canonical("/cases/${caseId}/close"), canonical("/cases/<int:case_id>/close")))

    check("a literal segment is not treated as a parameter",
          canonical("/appointments/history") != canonical("/appointments/<int:id>"),
          "Flask's int converter refuses 'history', so this really would 404.")

    calls = [
        (m.group(1).upper(), m.group(2))
        for m in api_contract.CALL_RE.finditer(
            'api.get("/patients");\n'
            "api.post(`/cases/${id}/close`);\n"
            'axios.post(`${API_BASE_URL}/auth/refresh`, null);\n'
        )
    ]
    check("a plain call is parsed", ("GET", "/patients") in calls, calls)
    check("a template-literal call is parsed",
          ("POST", "/cases/${id}/close") in calls, calls)
    check("a bare-axios call against API_BASE_URL is parsed",
          any(method == "POST" and "auth/refresh" in path for method, path in calls),
          calls)

    # -------------------------------------------------------- the verdict --
    print("\n" + "=" * 60)
    print("%d passed, %d failed" % (len(PASSED), len(FAILED)))
    if FAILED:
        print("\nA detector has stopped detecting:")
        for label, detail in FAILED:
            print("  - %s" % label)
            if detail is not None:
                print("      %s" % (detail,))
    print("=" * 60)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
