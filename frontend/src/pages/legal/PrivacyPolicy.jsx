import LegalPage from "./LegalPage";
import { HOSPITAL } from "../../components/landing/content";

const SECTIONS = [
  {
    heading: "1. Information we hold",
    body: "The platform stores what a consultation produces, and nothing it does not need:",
    items: [
      "Patient registration details: name, date of birth, gender, contact details, blood group, allergies and stated medical history.",
      "Clinical records: consultation transcripts, AI-generated summaries, prescriptions, nursing observations, medication administration logs and generated PDF reports.",
      "Staff account details: name, work email, role, department and a hashed password. Passwords are never stored in a readable form.",
      "Operational records: an append-only audit log of who created or changed a record, in what role, and when.",
    ],
  },
  {
    heading: "2. Voice recordings and transcription",
    body: "Consultation audio is captured in short segments and transcribed. Audio is used to produce the transcript and is not retained as a separate archive once transcription completes. The resulting transcript forms part of the patient's clinical record.",
  },
  {
    heading: "3. Use of AI processing",
    body: "Transcripts are sent to a third-party AI provider to generate a clinical summary and a suggested prescription. Suggestions are drawn only from the hospital's own medicine formulary and have no clinical effect until a doctor reviews and signs them. Confirm the provider's data-handling terms and retention period before deployment, and disclose them here.",
  },
  {
    heading: "4. Who can see a record",
    body: "Access is enforced on the server, not merely hidden in the interface:",
    items: [
      "A doctor sees only the patients assigned to them.",
      "A nurse sees only the patients they currently hold an active assignment for.",
      "Reception can register patients and manage the appointment queue, and cannot open consultations, prescriptions, reports or the nursing record.",
      "Administrators have oversight access for support and audit purposes.",
    ],
  },
  {
    heading: "5. Retention",
    body: "Clinical records are retained for the period required by the medical-records regulations that apply to your jurisdiction. Set that period here explicitly, along with what happens at the end of it.",
  },
  {
    heading: "6. Security",
    body: "Access requires an authenticated session with a signed, expiring token. Passwords are hashed. Uploaded images are stored under unguessable filenames. All access decisions are re-checked server-side on every request. No system is perfectly secure; report a suspected issue using the contact details below.",
  },
  {
    heading: "7. Patient rights",
    body: "Describe here how a patient requests a copy of their record, asks for a correction, or raises a complaint — including who handles the request and the response time you commit to.",
  },
  {
    heading: "8. Contact",
    body: `Questions about this policy can be sent to ${HOSPITAL.email} or ${HOSPITAL.phone}, or by post to ${HOSPITAL.address}.`,
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="3 August 2026"
      intro="This policy explains what the Yasodha AI Medical Assistant records about patients and staff, why it records it, and who is able to see it."
      sections={SECTIONS}
    />
  );
}
