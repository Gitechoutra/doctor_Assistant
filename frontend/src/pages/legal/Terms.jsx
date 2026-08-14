import LegalPage from "./LegalPage";
import { HOSPITAL } from "../../components/landing/content";

const SECTIONS = [
  {
    heading: "1. Who may use the platform",
    body: "Accounts are issued by the hospital to its own staff. Sharing credentials, or signing in on someone else's behalf, breaks the audit trail that the clinical record depends on and is not permitted.",
  },
  {
    heading: "2. The AI is assistive, never the prescriber",
    body: "This is the most important term on this page:",
    items: [
      "AI-generated summaries, diagnoses and prescriptions are drafts for a qualified clinician to review.",
      "A prescription has no effect until the treating doctor verifies and signs it. Editing a verified prescription clears the signature, so a sign-off always refers to exactly what was reviewed.",
      "Clinical responsibility for every decision remains with the treating clinician. The platform does not practise medicine.",
    ],
  },
  {
    heading: "3. Accuracy of transcription",
    body: "Automatic transcription is imperfect, particularly with background noise, overlapping speech or heavy code-switching. Clinicians are responsible for checking that the record reflects what was actually said before relying on it.",
  },
  {
    heading: "4. Acceptable use",
    items: [
      "Do not enter information about a patient you are not treating.",
      "Do not export or share patient data outside the hospital's approved channels.",
      "Do not attempt to access records outside your role, or to circumvent the access controls.",
      "Report suspected security problems rather than exploring them.",
    ],
  },
  {
    heading: "5. Availability",
    body: "The platform is provided on an as-available basis. Maintenance, third-party AI outages and network failures can interrupt service. Keep a documented fallback procedure for consultations that must proceed during an outage.",
  },
  {
    heading: "6. Records and audit",
    body: "Clinical entries are append-only. Doses, observations, notes, alerts and messages cannot be edited or deleted once recorded; corrections are made by adding a further entry. Every change writes an audit record naming who made it and when.",
  },
  {
    heading: "7. Changes to these terms",
    body: "These terms may be updated as the platform changes. Material changes will be communicated to account holders before they take effect.",
  },
  {
    heading: "8. Contact",
    body: `Questions about these terms can be sent to ${HOSPITAL.email} or ${HOSPITAL.phone}.`,
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="3 August 2026"
      intro="These terms cover use of the Yasodha AI Medical Assistant by hospital staff. The section on AI-assisted prescribing is the one to read carefully."
      sections={SECTIONS}
    />
  );
}
