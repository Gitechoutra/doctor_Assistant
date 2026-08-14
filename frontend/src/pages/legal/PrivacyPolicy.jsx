import LegalPage from "./LegalPage";

const SECTIONS = [
  {
    heading: "1. Information we hold",
    body: "The platform stores what a consultation produces, and nothing it does not need:",
    items: [
      "Patient registration details: name, date of birth, gender, contact details, blood group, allergies and stated medical history.",
      "Clinical records: consultation transcripts, AI-generated summaries, diagnoses, prescriptions and generated PDF reports.",
      "Account details for the practice's two users: name, email, role and a hashed password. Passwords are never stored in a readable form.",
      "Operational records: an append-only audit log of who created or changed a record, in what role, and when.",
    ],
  },
  {
    heading: "2. Voice recordings and transcription",
    body: "Consultation audio is captured in short segments and transcribed. Audio is used to produce the transcript and is not retained as a separate archive once transcription completes. The resulting transcript forms part of the patient's clinical record.",
  },
  {
    heading: "3. Use of AI processing",
    body: "Transcripts are sent to a third-party AI provider to generate a clinical summary and a suggested prescription. Suggestions are drawn only from the practice's own medicine formulary and have no clinical effect until a doctor reviews and signs them. Confirm the provider's data-handling terms and retention period before deployment, and disclose them here.",
  },
  {
    heading: "4. Who can see a record",
    body: "Access is enforced on the server, not merely hidden in the interface:",
    items: [
      "The doctor sees the patients on their own list, and is the only person who can record a diagnosis, write a prescription or issue a report.",
      "The PA registers patients, manages the appointment book and the queue, and can read the practice's clinical records in order to run the desk — but cannot create or change any of them.",
      "Every access decision is re-checked on the server for each request, so what a browser is willing to display is never what decides it.",
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
    body: "Add the practice's own email address, telephone number and postal address here before publishing this page.",
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="3 August 2026"
      intro="This policy explains what MediAssist AI records about patients and practice staff, why it records it, and who is able to see it."
      sections={SECTIONS}
    />
  );
}
