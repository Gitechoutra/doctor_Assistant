import {
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineHeart,
  HiOutlineShieldCheck,
} from "react-icons/hi2";
import PrescriptionList from "./PrescriptionList";
import {
  EMERGENCY_DECISION_LABELS,
  EMERGENCY_SEVERITY_LABELS,
  formatWhen,
} from "./NursingBadges";

function Section({ icon: Icon, title, children, empty }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">
        {children || <span className="text-slate-400">{empty}</span>}
      </div>
    </div>
  );
}

/** Preserves the line breaks a doctor typed — instructions are usually a list. */
function MultilineText({ value }) {
  if (!value) return null;
  return <p className="whitespace-pre-wrap">{value}</p>;
}

function EmergencyFact({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${value ? "text-red-950" : "text-red-400"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

/**
 * How this patient got here, for a patient who came in through the emergency
 * door.
 *
 * None of this reached the nurse before. An emergency patient has no
 * Consultation to read — the claiming doctor works directly on the emergency
 * case — so the nurse was handed a medication schedule with no admission,
 * no severity, and no record of what had already been given, which is the
 * one thing they must not double up on.
 */
function EmergencyAdmission({ emergency }) {
  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-red-900">
            <HiOutlineExclamationTriangle className="h-5 w-5" />
            Emergency admission
          </h2>
          <p className="mt-1 text-sm font-medium text-red-800">{emergency.reason}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            {EMERGENCY_SEVERITY_LABELS[emergency.severity] || emergency.severity}
          </p>
          <p className="text-xs text-red-500">{emergency.code}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-red-200 pt-4 sm:grid-cols-4">
        <EmergencyFact label="Arrived" value={formatWhen(emergency.arrived_at)} />
        <EmergencyFact
          label="Doctor's decision"
          value={
            emergency.decision
              ? EMERGENCY_DECISION_LABELS[emergency.decision] || emergency.decision
              : "Not decided yet"
          }
        />
        <EmergencyFact label="Seen by" value={emergency.doctor} />
        <EmergencyFact label="Department" value={emergency.department} />
      </div>

      {emergency.assessment_notes && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
            Assessment on arrival
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-red-950">
            {emergency.assessment_notes}
          </p>
        </div>
      )}

      {/* What the patient has already had. Called out on its own, in a box,
          because giving a second dose of something already given in casualty
          is the specific harm this panel exists to prevent. */}
      {emergency.treatment_notes && (
        <div className="mt-3 rounded-xl border border-red-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
            Already given before the ward
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-red-950">
            {emergency.treatment_notes}
          </p>
        </div>
      )}

      {emergency.status === "resolved" && (
        <p className="mt-3 text-xs text-red-600">
          The emergency case was closed {formatWhen(emergency.resolved_at)} — this patient
          stays under your care until they are discharged from the nursing record.
        </p>
      )}
    </div>
  );
}

/**
 * Everything the doctor decided, read-only. The nurse works from this and
 * never edits it: the plan is the doctor's half of the record.
 */
export default function CarePlanPanel({ assignment }) {
  const emergency = assignment.emergency;
  const summary = assignment.consultation?.summary;
  const consultationPrescriptions = assignment.consultation?.prescriptions || [];
  // The medication schedule is the prescription for an emergency patient:
  // there is no consultation for the doctor's prescription to live on, so
  // what they entered at the hand-off went straight onto these orders.
  const orders = assignment.medication_orders || [];

  return (
    <div className="space-y-6">
      {emergency && <EmergencyAdmission emergency={emergency} />}

      <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">Doctor&apos;s care plan</h2>
          <p className="text-right text-xs text-slate-400">
            Set by {assignment.doctor || "the treating doctor"}
          </p>
        </div>

        <Section
          icon={HiOutlineClipboardDocumentList}
          title="Treatment plan"
          empty="No treatment plan was written for this assignment."
        >
          <MultilineText value={assignment.treatment_plan} />
        </Section>

        <Section
          icon={HiOutlineHeart}
          title="Care instructions"
          empty="No standing instructions — follow the medication schedule and record observations each round."
        >
          <MultilineText value={assignment.care_instructions} />
        </Section>

        {summary && (
          <Section icon={HiOutlineDocumentText} title="From the consultation" empty="">
            <div className="space-y-2 rounded-xl bg-slate-50 p-4">
              {summary.possible_diagnosis && (
                <p>
                  <span className="font-semibold text-slate-800">Diagnosis: </span>
                  {summary.possible_diagnosis}
                </p>
              )}
              {summary.symptoms && (
                <p>
                  <span className="font-semibold text-slate-800">Symptoms: </span>
                  {summary.symptoms}
                </p>
              )}
              {summary.follow_up_advice?.length > 0 && (
                <div>
                  <p className="font-semibold text-slate-800">Follow-up advice</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                    {summary.follow_up_advice.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>

      {/* The prescription gets its own card, not a section buried under the
          plan — it is what the nurse opens this tab for. Emergency and
          consultation prescriptions are separate cards even when a patient
          has both, so it is never ambiguous which document a medicine is on. */}
      {emergency ? (
        <div className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-red-900">
                <HiOutlineExclamationTriangle className="h-5 w-5" />
                Emergency prescription
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ordered by {assignment.doctor || "the treating doctor"} on the emergency
                hand-off. Log every dose on the Medications tab.
              </p>
            </div>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              {orders.length} {orders.length === 1 ? "medicine" : "medicines"}
            </span>
          </div>
          <div className="mt-4">
            <PrescriptionList
              items={orders}
              tone="emergency"
              empty="No medicines were prescribed at the hand-off. Message the doctor before the next round if you are expecting some."
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <HiOutlineShieldCheck className="h-5 w-5 text-slate-400" />
            Prescription
          </h2>
          {consultationPrescriptions.length > 0 ? (
            <>
              {assignment.consultation?.prescription_verified ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <HiOutlineShieldCheck className="h-3.5 w-3.5" />
                  Verified by the doctor
                </p>
              ) : (
                <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Not yet verified by the doctor
                </p>
              )}
              <div className="mt-4">
                <PrescriptionList items={consultationPrescriptions} />
              </div>
            </>
          ) : (
            // Falls back to the schedule rather than reporting nothing: a
            // hand-off with no consultation still carries the medicines the
            // doctor typed, and "No prescription is attached" over a schedule
            // full of drugs is worse than saying nothing at all.
            <div className="mt-4">
              <PrescriptionList
                items={orders}
                empty="No prescription is attached to this assignment."
              />
            </div>
          )}
        </div>
      )}

      {/* An emergency patient whose episode later became a normal OP has both
          documents. Shown second and plainly labelled — the emergency orders
          above are the ones being given right now. */}
      {emergency && consultationPrescriptions.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <HiOutlineShieldCheck className="h-5 w-5 text-slate-400" />
            Consultation prescription
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            From the OP raised for this patient — separate from the emergency orders above.
          </p>
          <div className="mt-4">
            <PrescriptionList items={consultationPrescriptions} />
          </div>
        </div>
      )}
    </div>
  );
}
