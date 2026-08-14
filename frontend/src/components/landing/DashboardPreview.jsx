import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineComputerDesktop,
  HiOutlineHeart,
  HiOutlineIdentification,
  HiOutlineSquares2X2,
} from "react-icons/hi2";
import { Reveal, SectionHeading } from "./primitives";

/**
 * Composed mockups rather than screenshots.
 *
 * A PNG of the real app would be stale the first time a button moved, would
 * ship patient data into a public page, and would blur on a retina display.
 * These are built from the same design tokens as the product, so they stay
 * honest about what it looks like without any of that.
 */

const TABS = [
  { key: "doctor", label: "Doctor", icon: HiOutlineSquares2X2 },
  { key: "nurse", label: "Nurse", icon: HiOutlineHeart },
  { key: "reception", label: "Receptionist", icon: HiOutlineIdentification },
  { key: "consult", label: "AI Consultation", icon: HiOutlineChatBubbleLeftRight },
];

function Chrome({ title, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <p className="ml-3 truncate text-xs font-medium text-slate-400">{title}</p>
      </div>
      <div className="bg-slate-50/60 p-4 sm:p-6">{children}</div>
    </div>
  );
}

function StatTile({ label, value, hint, tone = "brand" }) {
  const tones = {
    brand: "text-brand-600 bg-brand-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</p>
      {hint && (
        <span
          className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Row({ name, meta, badge, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-100 text-brand-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-2.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-800">{name}</p>
          <p className="truncate text-[10px] text-slate-400">{meta}</p>
        </div>
      </div>
      {badge && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-800">{title}</p>
        {action && <p className="text-[10px] font-semibold text-brand-600">{action}</p>}
      </div>
      {children}
    </div>
  );
}

const SCREENS = {
  doctor: (
    <Chrome title="yasodha.health/dashboard">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Today's queue" value="8" hint="3 waiting" tone="amber" />
        <StatTile label="In consultation" value="1" hint="live" tone="emerald" />
        <StatTile label="My patients" value="126" />
        <StatTile label="Reports" value="94" hint="6 today" tone="brand" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Appointment queue" action="View all">
          <Row name="Ravi Kumar" meta="PAT0001 · 42y · Orthopedics" badge="Next up" tone="brand" />
          <Row name="Anita Sharma" meta="PAT0002 · 35y · Follow-up" badge="Waiting" />
          <Row name="Vikram Patel" meta="PAT0003 · 58y · Review" badge="Waiting" />
        </Panel>
        <Panel title="Nursing care" action="3 new">
          <Row name="Ramu" meta="Post-surgery · Sr. Lakshmi" badge="75% doses" tone="amber" />
          <Row name="Sahii" meta="Observation · Sr. Fatima" badge="On course" tone="emerald" />
          <Row name="Arun" meta="Recovery · Sr. Joseph" badge="1 alert" tone="red" />
        </Panel>
      </div>
    </Chrome>
  ),
  nurse: (
    <Chrome title="yasodha.health/nurse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In your care" value="3" hint="active" tone="brand" />
        <StatTile label="Doses due" value="6" hint="today" tone="amber" />
        <StatTile label="Missed" value="1" hint="doctor alerted" tone="red" />
        <StatTile label="Open alerts" value="2" tone="red" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Medication round" action="Log dose">
          <Row name="Paracetamol" meta="1 tablet · every 6 hours" badge="3/4 today" tone="amber" />
          <Row name="Normal Saline" meta="500 ml · IV / Saline" badge="Completed" tone="emerald" />
          <Row name="Amoxicillin" meta="500 mg · injection" badge="Due 18:00" />
        </Panel>
        <Panel title="Latest observation" action="Record">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              ["Temp", "38.9°C", true],
              ["Pulse", "112 bpm", false],
              ["BP", "128/82", false],
              ["SpO₂", "97%", false],
            ].map(([k, v, bad]) => (
              <span
                key={k}
                className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                  bad ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {k} {v}
              </span>
            ))}
          </div>
          <p className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
            Temperature out of range — doctor notified automatically
          </p>
        </Panel>
      </div>
    </Chrome>
  ),
  reception: (
    <Chrome title="yasodha.health/dashboard">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Registered" value="1,284" />
        <StatTile label="Today" value="17" hint="new" tone="brand" />
        <StatTile label="In queue" value="8" tone="amber" />
        <StatTile label="Unrouted" value="2" hint="assign doctor" tone="red" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Register patient" action="New OP">
          <div className="space-y-2 pt-1">
            {["Full name", "Phone number", "Assign doctor"].map((f) => (
              <div key={f} className="rounded-lg border border-slate-200 px-2.5 py-2">
                <p className="text-[10px] text-slate-400">{f}</p>
              </div>
            ))}
            <div className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-2.5 py-2 text-center text-[10px] font-bold text-white">
              ADD OP
            </div>
          </div>
        </Panel>
        <Panel title="Today's OP queue">
          <Row name="Ramana" meta="Gynecology · Dr. Sahithi" badge="Waiting" tone="brand" />
          <Row name="Ramu" meta="Orthopedics · Dr. Sandeep" badge="In consultation" tone="emerald" />
          <Row name="Arun" meta="General Medicine" badge="Unrouted" tone="red" />
        </Panel>
      </div>
    </Chrome>
  ),
  consult: (
    <Chrome title="yasodha.health/dashboard/consultations/42">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Panel title="Live transcript" action="● Recording">
          <div className="space-y-2 pt-1">
            <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
              How are you feeling today?
            </div>
            <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-brand-600 px-3 py-2 text-[11px] text-white">
              Fever and headache since yesterday.
            </div>
            <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
              Any cold or body pain along with it?
            </div>
          </div>
        </Panel>
        <Panel title="AI summary" action="Verify">
          <div className="space-y-2 pt-1 text-[11px] leading-relaxed">
            <p className="text-slate-600">
              <span className="font-bold text-slate-800">Diagnosis: </span>
              Suspected viral fever
            </p>
            <p className="text-slate-600">
              <span className="font-bold text-slate-800">Symptoms: </span>
              Fever, headache, fatigue
            </p>
            <div className="rounded-lg border border-slate-100">
              <div className="flex justify-between border-b border-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400">
                <span>Medicine</span>
                <span>Dose</span>
              </div>
              {[
                ["Paracetamol 650mg", "1 tab / 6h"],
                ["Vitamin C 500mg", "1 tab / day"],
                ["ORS", "as needed"],
              ].map(([m, d]) => (
                <div
                  key={m}
                  className="flex justify-between px-2.5 py-1.5 text-[10px] text-slate-600"
                >
                  <span className="font-medium text-slate-800">{m}</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
            <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700">
              All matched to hospital formulary · awaiting doctor signature
            </p>
          </div>
        </Panel>
      </div>
    </Chrome>
  ),
};

export default function DashboardPreview() {
  const [active, setActive] = useState("doctor");
  const reduced = useReducedMotion();

  return (
    <section
      id="dashboards"
      className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-24 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          badge="Product tour"
          badgeIcon={HiOutlineComputerDesktop}
          title="One platform, four"
          highlight="focused workspaces"
          description="Each role sees only its own job. Nothing irrelevant on screen, and nothing reachable that shouldn't be."
        />

        <Reveal className="mt-12">
          <div
            role="tablist"
            aria-label="Dashboard previews"
            className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={active === key}
                onClick={() => setActive(key)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  active === key
                    ? "bg-gradient-to-r from-brand-500 to-brand-700 text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-10">
          <motion.div
            key={active}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {SCREENS[active]}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
