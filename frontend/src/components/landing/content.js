/**
 * Everything the landing page says, in one place.
 *
 * Copy lives here rather than inline in the sections so it can be reviewed and
 * edited without touching layout code — and so the two blocks that need real
 * data before launch are impossible to miss.
 */

import {
  HiOutlineArrowPath,
  HiOutlineBeaker,
  HiOutlineBolt,
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineCpuChip,
  HiOutlineDocumentChartBar,
  HiOutlineHeart,
  HiOutlineIdentification,
  HiOutlineLockClosed,
  HiOutlineMicrophone,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineUserGroup,
  HiOutlineUsers,
} from "react-icons/hi2";

export const APP_VERSION = "1.0.0";

export const HOSPITAL = {
  name: "Yasodha Hospitals",
  email: "care@yasodhahospitals.com",
  phone: "+91 884 234 5678",
  address: "12-3-456, Beside Bus Stand, Kakinada, Andhra Pradesh 533001",
};

export const FEATURES = [
  {
    icon: HiOutlineChatBubbleLeftRight,
    title: "AI Consultation",
    body: "Doctor and patient just talk. The conversation is captured live and turned into a clinical summary — no typing during the visit.",
  },
  {
    icon: HiOutlineMicrophone,
    title: "Voice to Text",
    body: "Whisper transcribes each segment and auto-detects the spoken language, handling English, Hindi and Telugu code-switching in one visit.",
  },
  {
    icon: HiOutlineSparkles,
    title: "AI Prescription",
    body: "Gemini drafts a prescription drawn only from the hospital's own formulary. The doctor edits and signs it — the AI never prescribes alone.",
  },
  {
    icon: HiOutlineSquares2X2,
    title: "Doctor Dashboard",
    body: "Today's queue, active consultations, medication compliance and every nursing update, scoped to that doctor's own patients.",
  },
  {
    icon: HiOutlineHeart,
    title: "Nurse Dashboard",
    body: "Assigned patients, medication rounds, vitals, shift handovers and one-tap escalation to the treating doctor.",
  },
  {
    icon: HiOutlineUsers,
    title: "Patient Management",
    body: "Registration, demographics, allergies and history — with every record routed to the one doctor responsible for it.",
  },
  {
    icon: HiOutlineIdentification,
    title: "Receptionist Module",
    body: "Register patients, route them to the right specialist and run the OP queue. Deliberately no access to clinical records.",
  },
  {
    icon: HiOutlineDocumentChartBar,
    title: "PDF Reports",
    body: "A hospital-letterhead consultation report with a QR code that opens the record, generated only after the doctor signs off.",
  },
  {
    icon: HiOutlineBolt,
    title: "Real-Time Notifications",
    body: "WebSocket updates the moment a patient joins a queue, a dose is missed or a nurse raises an alert. No refresh required.",
  },
  {
    icon: HiOutlineLockClosed,
    title: "Secure Medical Records",
    body: "JWT auth, strict role-based access and an append-only audit log recording who changed what, and when.",
  },
];

export const WORKFLOW = [
  {
    step: "01",
    icon: HiOutlineIdentification,
    title: "Register & Route",
    body: "Reception registers the patient and assigns the treating specialist. The OP queue updates live for that department.",
  },
  {
    step: "02",
    icon: HiOutlineMicrophone,
    title: "Consult by Voice",
    body: "The doctor starts the consultation and simply talks. Audio is transcribed segment by segment as the conversation happens.",
  },
  {
    step: "03",
    icon: HiOutlineCpuChip,
    title: "AI Summarises",
    body: "On ending the visit, the AI produces symptoms, an assistive diagnosis, follow-up advice and a suggested prescription.",
  },
  {
    step: "04",
    icon: HiOutlineClipboardDocumentCheck,
    title: "Doctor Verifies",
    body: "The doctor reviews and edits the draft, then signs it. Verification locks the prescription so it cannot change underneath the signature.",
  },
  {
    step: "05",
    icon: HiOutlineHeart,
    title: "Nursing Handover",
    body: "For recovery cases the doctor assigns a nurse, who logs every dose, vital sign and note against that patient.",
  },
  {
    step: "06",
    icon: HiOutlineDocumentChartBar,
    title: "Report & Archive",
    body: "A signed PDF report is generated for the patient, and the full timeline stays on the record for audit.",
  },
];

export const REASONS = [
  {
    icon: HiOutlineShieldCheck,
    title: "Secure by design",
    body: "Role-based access enforced on the server, not just hidden in the UI. Reception cannot reach clinical data even by typing the URL.",
  },
  {
    icon: HiOutlineCpuChip,
    title: "AI-powered automation",
    body: "Transcription, summarisation and prescription drafting happen automatically — the clinician reviews rather than retypes.",
  },
  {
    icon: HiOutlineArrowPath,
    title: "Real-time collaboration",
    body: "Doctors and nurses work from the same live record, with two-way messaging tied to the patient it concerns.",
  },
  {
    icon: HiOutlineChartBarSquare,
    title: "Built to scale",
    body: "Departments, doctors, nurses and formulary are all data. Adding a ward is configuration, not a code change.",
  },
  {
    icon: HiOutlineClipboardDocumentList,
    title: "Clinically accurate",
    body: "Prescriptions are matched against the hospital formulary, and abnormal vitals escalate to the doctor automatically.",
  },
  {
    icon: HiOutlineBeaker,
    title: "Easy to adopt",
    body: "Each role sees only its own workflow, so training is short and there is nothing irrelevant on screen.",
  },
];

// PLACEHOLDER FIGURES — replace with real numbers before this page goes public.
// They are presented to visitors as facts about the hospital, so shipping the
// defaults would be a claim nobody has checked. See README.
export const STATS = [
  { label: "Doctors Onboard", value: 45, suffix: "+", icon: HiOutlineUserGroup },
  { label: "Patients Managed", value: 12500, suffix: "+", icon: HiOutlineUsers },
  { label: "AI Consultations", value: 8600, suffix: "+", icon: HiOutlineChatBubbleLeftRight },
  { label: "Prescriptions Generated", value: 7400, suffix: "+", icon: HiOutlineSparkles },
  { label: "Reports Created", value: 6900, suffix: "+", icon: HiOutlineDocumentChartBar },
];

// PLACEHOLDER TESTIMONIALS — these are illustrative, not real quotes, and are
// attributed to composite roles rather than named individuals on purpose.
// Replace with quotes you have written permission to publish before launch.
export const TESTIMONIALS = [
  {
    quote:
      "The summary is ready before the patient has left the room. I spend the consultation looking at the person instead of the keyboard.",
    role: "Orthopedic Surgeon",
    unit: "Orthopedics",
    initials: "OS",
  },
  {
    quote:
      "Medication compliance used to be a phone call to the ward. Now I can see every dose, and I am told the moment one is missed.",
    role: "Consultant Physician",
    unit: "General Medicine",
    initials: "CP",
  },
  {
    quote:
      "Handover is the part that used to get lost. Writing it into the patient's record means the next shift starts already informed.",
    role: "Senior Staff Nurse",
    unit: "Post-operative Care",
    initials: "SN",
  },
];

export const FAQS = [
  {
    q: "Does the AI prescribe medication on its own?",
    a: "No. The AI drafts a suggestion drawn only from the hospital's own formulary, and it is inert until a doctor reviews, edits and signs it. Verification locks the prescription, and any later edit clears the signature so a sign-off always refers to exactly what was reviewed.",
  },
  {
    q: "Which languages does the voice transcription handle?",
    a: "Whisper auto-detects the spoken language per segment, so a single consultation can move between English, Hindi, Telugu and Tamil. The transcript is always translated to English for the clinical record.",
  },
  {
    q: "Who can see a patient's medical record?",
    a: "Only the treating doctor, the nurse currently assigned to that patient, and admin for oversight. Reception can register and schedule but cannot open consultations, prescriptions, reports or the nursing record — enforced by the API, not just hidden in the interface.",
  },
  {
    q: "How does the nurse and doctor communication work?",
    a: "Each nursing assignment carries its own thread. The nurse logs doses, vitals, notes and alerts against the patient; the doctor sees them live, with a badge showing what has arrived since they last opened the record, and can reply with instructions.",
  },
  {
    q: "Is there an audit trail?",
    a: "Yes. Every registration, consultation, prescription sign-off, dose, observation, alert and message writes an append-only audit entry recording who did it, in what role, and when. Nothing in the application edits or deletes those rows.",
  },
  {
    q: "What happens if the internet drops mid-consultation?",
    a: "Transcription runs in short segments, so only the segment in flight is affected and recording resumes on the next one. The consultation stays open until the doctor ends it explicitly, and nothing already captured is lost.",
  },
];

export const FOOTER_LINKS = {
  "Quick Links": [
    { label: "Home", href: "#top" },
    { label: "Features", href: "#features" },
    { label: "About", href: "#why-us" },
    { label: "Contact", href: "#contact" },
    // `to` rather than `href` marks these as router destinations --
    // the footer renders a <Link> for those and an <a> for anchors.
    { label: "Privacy Policy", to: "/privacy" },
    { label: "Terms & Conditions", to: "/terms" },
  ],
  Platform: [
    { label: "AI Consultation", href: "#features" },
    { label: "Doctor Dashboard", href: "#dashboards" },
    { label: "Nurse Dashboard", href: "#dashboards" },
    { label: "Patient Management", href: "#features" },
    { label: "PDF Reports", href: "#features" },
    { label: "Secure Records", href: "#why-us" },
  ],
};
