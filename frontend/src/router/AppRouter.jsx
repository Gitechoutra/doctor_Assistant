import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import DashboardLayout from "../layouts/DashboardLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleRoute from "../components/RoleRoute";
import { ROLE_DOCTOR, ROLE_PA } from "../context/AuthContext";

// Every screen but the login is loaded on demand, so a session fetches its
// own modules and nothing else.
const Landing = lazy(() => import("../pages/Landing"));
// The two screens somebody reaches from an email, before they have a password
// they can sign in with. Lazy like everything else — signing in normally never
// loads them.
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("../pages/legal/PrivacyPolicy"));
const Terms = lazy(() => import("../pages/legal/Terms"));

const Dashboard = lazy(() => import("../pages/Dashboard"));
const Patients = lazy(() => import("../pages/Patients"));
const PatientDetails = lazy(() => import("../pages/PatientDetails"));
const Appointments = lazy(() => import("../pages/Appointments"));
const Doctors = lazy(() => import("../pages/Doctors"));
const Assistants = lazy(() => import("../pages/Assistants"));
const PatientQueue = lazy(() => import("../pages/PatientQueue"));
const Consultations = lazy(() => import("../pages/Consultations"));
const ConsultationRoom = lazy(() => import("../pages/ConsultationRoom"));
const Cases = lazy(() => import("../pages/Cases"));
const CaseRecord = lazy(() => import("../pages/CaseRecord"));
const Prescriptions = lazy(() => import("../pages/Prescriptions"));
const Reports = lazy(() => import("../pages/Reports"));
const Settings = lazy(() => import("../pages/Settings"));
const Profile = lazy(() => import("../pages/Profile"));

/** Shown for the moment a screen's chunk is in flight. Deliberately plain —
 *  a spinner that appears for 80ms reads as a flicker, not as progress. */
function RouteFallback() {
  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

// The doctor's clinical screens. The PA reads consultations, prescriptions and
// reports through the patient's record instead — those are readable, and the
// API allows it — but the consultation room and the case workspace are where
// clinical judgement is recorded, so they are the doctor's alone.
//
// Kept in step with Sidebar.jsx: nothing here is in the PA's nav, and nothing
// in either nav is missing from the routes below.
const DOCTOR_ONLY = [ROLE_DOCTOR];

// Booking, rescheduling and the appointment book. Desk work; the API 403s the
// doctor on every write behind this screen.
const PA_ONLY = [ROLE_PA];

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          {/* Unauthenticated by necessity: whoever needs these cannot sign in.
              The single-use token in the URL is the credential, and the API
              validates it on both screens. */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              {/* Both roles. Dashboard renders the PA's day or the doctor's,
                  the queue is the one both work from, and the patient record
                  is readable by each — with different actions inside. */}
              <Route index element={<Dashboard />} />
              <Route path="queue" element={<PatientQueue />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:patientId" element={<PatientDetails />} />
              <Route path="reports" element={<Reports />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />

              <Route element={<RoleRoute allow={PA_ONLY} />}>
                <Route path="appointments" element={<Appointments />} />
              </Route>

              <Route element={<RoleRoute allow={DOCTOR_ONLY} />}>
                <Route path="consultations" element={<Consultations />} />
                <Route path="consultations/:id" element={<ConsultationRoom />} />
                <Route path="cases" element={<Cases />} />
                <Route path="cases/:id" element={<CaseRecord />} />
                <Route path="prescriptions" element={<Prescriptions />} />
                {/* Where the desk's accounts come from. The doctor is the
                    seeded account, so they are the one who exists first and
                    the only one who can issue credentials — a PA who could
                    mint accounts could mint a doctor's. */}
                <Route path="assistants" element={<Assistants />} />
                {/* Off the menu, and the route kept: a practice taking on a
                    second doctor adds them here. The first one comes from the
                    seeder, not from this screen. */}
                <Route path="doctors" element={<Doctors />} />
              </Route>
            </Route>
          </Route>

          {/* Without this a mistyped or stale URL matched nothing and React
              Router rendered an empty document — indistinguishable from a
              crash. NotFound routes the visitor on. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
