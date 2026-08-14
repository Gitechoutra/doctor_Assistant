import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import DashboardLayout from "../layouts/DashboardLayout";
import NurseLayout from "../layouts/NurseLayout";
import PharmacyLayout from "../layouts/PharmacyLayout";
import LabLayout from "../layouts/LabLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleRoute from "../components/RoleRoute";

// Every screen but the login is loaded on demand.
//
// Eagerly importing all thirty of them produced one 880 kB chunk that a
// doctor opening the dashboard downloaded in full — the pharmacy counter they
// never visit, and framer-motion, which only the public landing page uses.
// Splitting per screen means each session fetches its own module and nothing
// else. The routes themselves are unchanged.
const Landing = lazy(() => import("../pages/Landing"));
// The two screens a staff member reaches from an email, before they have an
// account they can sign in to. Lazy like everything else — somebody signing in
// normally never loads them.
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("../pages/legal/PrivacyPolicy"));
const Terms = lazy(() => import("../pages/legal/Terms"));

const Dashboard = lazy(() => import("../pages/Dashboard"));
const Patients = lazy(() => import("../pages/Patients"));
const Appointments = lazy(() => import("../pages/Appointments"));
// The two screens the doctor cards on Appointments lead into: one doctor's
// queue, then one patient's record. Pages rather than panels expanded in
// place, so each has a URL that can be refreshed, bookmarked and linked to.
const DoctorPatientQueue = lazy(() => import("../pages/DoctorPatientQueue"));
const PatientDetails = lazy(() => import("../pages/PatientDetails"));
const EmergencyCases = lazy(() => import("../pages/EmergencyCases"));
const EmergencyCaseDetail = lazy(() => import("../pages/EmergencyCaseDetail"));
const Consultations = lazy(() => import("../pages/Consultations"));
const ConsultationRoom = lazy(() => import("../pages/ConsultationRoom"));
const Cases = lazy(() => import("../pages/Cases"));
const CaseRecord = lazy(() => import("../pages/CaseRecord"));
const KnowledgeBase = lazy(() => import("../pages/KnowledgeBase"));
const Prescriptions = lazy(() => import("../pages/Prescriptions"));
const Doctors = lazy(() => import("../pages/Doctors"));
const DoctorAvailability = lazy(() => import("../pages/DoctorAvailability"));
const StaffManagement = lazy(() => import("../pages/StaffManagement"));
const Departments = lazy(() => import("../pages/Departments"));
const DepartmentDetail = lazy(() => import("../pages/DepartmentDetail"));
const NursingMonitor = lazy(() => import("../pages/NursingMonitor"));
const NursingUpdates = lazy(() => import("../pages/NursingUpdates"));
const NursingRecord = lazy(() => import("../pages/NursingRecord"));
const Reports = lazy(() => import("../pages/Reports"));
const Settings = lazy(() => import("../pages/Settings"));
const Shifts = lazy(() => import("../pages/Shifts"));
const Profile = lazy(() => import("../pages/Profile"));

const NurseDashboard = lazy(() => import("../pages/nurse/NurseDashboard"));
const NursePatients = lazy(() => import("../pages/nurse/NursePatients"));
const NursePatientRecord = lazy(() => import("../pages/nurse/NursePatientRecord"));
const NurseAlerts = lazy(() => import("../pages/nurse/NurseAlerts"));

const PharmacyDashboard = lazy(() => import("../pages/pharmacy/PharmacyDashboard"));
const AddMedicine = lazy(() => import("../pages/pharmacy/AddMedicine"));
const Inventory = lazy(() => import("../pages/pharmacy/Inventory"));
const PharmacyDepartments = lazy(() => import("../pages/pharmacy/Departments"));
const MedicineRequests = lazy(() => import("../pages/pharmacy/MedicineRequests"));
const Categories = lazy(() => import("../pages/pharmacy/Categories"));
const MedicineSearch = lazy(() => import("../pages/pharmacy/MedicineSearch"));
const StockIn = lazy(() => import("../pages/pharmacy/StockIn"));
const StockAlerts = lazy(() => import("../pages/pharmacy/StockAlerts"));
const PharmacySoon = lazy(() => import("../pages/pharmacy/PharmacySoon"));

const LabDashboard = lazy(() => import("../pages/lab/LabDashboard"));
const LabRequests = lazy(() => import("../pages/lab/LabRequests"));
const LabRequestDetail = lazy(() => import("../pages/lab/LabRequestDetail"));

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

// Org-structure screens. Hidden from the doctor sidebar (see Sidebar.jsx) and
// unreachable by URL for doctors — keep the two lists in step.
const ADMIN_ONLY_DENY = ["doctor"];

// Patient care. Reception registers and schedules; it never sees what was
// diagnosed or prescribed. Blocked here so a bookmark or typed URL bounces,
// and blocked again on the API, which 403s these routes for this role.
const CLINICAL_DENY = ["receptionist"];

// Sections of the pharmacy sidebar that are mapped out but not built. Listed
// here rather than silently omitted so the nav stays honest — each renders a
// page that says what it needs, instead of 404ing or showing a fake table.
const PHARMACY_SOON = [
  {
    path: "prescriptions/pending",
    title: "Pending prescriptions",
    blurb: "Doctor-verified prescriptions waiting to be dispensed at this counter.",
    needs: ["A dispense record linking a prescription to the batch it was filled from", "Partial-fill handling when stock runs short"],
  },
  {
    path: "prescriptions/dispensed",
    title: "Dispensed prescriptions",
    blurb: "What this counter has filled, and from which batch.",
    needs: ["The dispense record above"],
  },
  {
    path: "prescriptions/history",
    title: "Prescription history",
    blurb: "Full dispensing history per patient.",
    needs: ["The dispense record above"],
  },
  {
    path: "purchases/orders",
    title: "Purchase orders",
    blurb: "Raise and track orders with suppliers.",
    needs: ["A supplier record", "Purchase order and line-item models", "Goods-received matching against the order"],
  },
  {
    path: "purchases/suppliers",
    title: "Suppliers",
    blurb: "Who you buy from, and on what terms.",
    needs: ["A supplier record with GSTIN and payment terms"],
  },
  {
    path: "purchases/received",
    title: "Stock received",
    blurb: "Deliveries booked against a purchase order.",
    needs: ["Purchase orders", "Stock In already works standalone — this links it to an order"],
  },
  {
    path: "billing/new",
    title: "New bill",
    blurb: "Sell over the counter or against a prescription.",
    needs: ["Bill and bill-line models", "GST rate per medicine (HSN code)", "Payment capture and a printable invoice"],
  },
  {
    path: "billing/transactions",
    title: "Transactions",
    blurb: "Every bill raised at this counter.",
    needs: ["The billing models above"],
  },
  {
    path: "billing/refunds",
    title: "Refunds",
    blurb: "Return a sale and put the stock back.",
    needs: ["The billing models above", "A stock-return movement so quantities stay correct"],
  },
  {
    path: "stock/out",
    title: "Stock out",
    blurb: "Issue stock to a ward, another branch, or write it off.",
    needs: ["A stock movement ledger so every in and out has an auditable reason"],
  },
  {
    path: "stock/damaged",
    title: "Damaged medicines",
    blurb: "Record breakage and spoilage.",
    needs: ["The stock movement ledger above"],
  },
  // Explicit titles rather than derived from the slug: "profit-loss" and
  // "gst" do not title-case correctly by rule.
  ...[
    ["sales", "Sales"],
    ["purchases", "Purchases"],
    ["inventory", "Inventory"],
    ["profit-loss", "Profit & Loss"],
    ["gst", "GST"],
  ].map(([slug, title]) => ({
    path: `reports/${slug}`,
    title: `${title} report`,
    blurb:
      "Reporting is deliberately last — a report is only as honest as the transactions underneath it.",
    needs: [
      "Billing and purchase records to aggregate",
      "GST rates per medicine for tax reporting",
    ],
  })),
  {
    path: "notifications",
    title: "Notifications",
    blurb: "Low-stock and expiry alerts for this counter.",
    needs: ["Scheduled checks that raise a notification, reusing the existing notification model"],
  },
];

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

          {/* One login for everyone at /login; a nurse is routed here on the
              way out of it. The nursing module stays its own tree because a
              nurse's whole job is the assignments handed to them and none of the
              doctor/admin screens apply — but it is a dashboard, not a second
              portal, and it has no sign-in page of its own. */}
          <Route path="/nurse" element={<NurseLayout />}>
            <Route index element={<NurseDashboard />} />
            <Route path="patients" element={<NursePatients />} />
            <Route path="patients/:id" element={<NursePatientRecord />} />
            <Route path="alerts" element={<NurseAlerts />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* The pharmacy counter. Its own tree for the same reason the nursing
              module has one: stock is scoped to a branch, and none of the
              clinical screens apply. PharmacyLayout guards the role. */}
          <Route path="/pharmacy" element={<PharmacyLayout />}>
            <Route index element={<PharmacyDashboard />} />
            <Route path="medicines/departments" element={<PharmacyDepartments />} />
            <Route path="medicines/requests" element={<MedicineRequests />} />
            <Route path="medicines/inventory" element={<Inventory />} />
            <Route path="medicines/add" element={<AddMedicine />} />
            <Route path="medicines/categories" element={<Categories />} />
            <Route path="medicines/search" element={<MedicineSearch />} />
            <Route path="stock/in" element={<StockIn />} />
            <Route path="stock/low" element={<StockAlerts mode="low" />} />
            <Route path="stock/expired" element={<StockAlerts mode="expired" />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="profile" element={<Profile />} />
            {PHARMACY_SOON.map(({ path, title, blurb, needs }) => (
              <Route
                key={path}
                path={path}
                element={<PharmacySoon title={title} blurb={blurb} needs={needs} />}
              />
            ))}
          </Route>

          {/* The laboratory. Its own tree for the same reason nursing and
              pharmacy have one: a technician's whole job here is the tests
              handed to them, and every clinical screen 403s for the role.
              LabLayout guards it. */}
          <Route path="/lab" element={<LabLayout />}>
            <Route index element={<LabDashboard />} />
            <Route path="requests" element={<LabRequests />} />
            <Route path="requests/:id" element={<LabRequestDetail />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="appointments/doctors/:doctorId" element={<DoctorPatientQueue />} />
              <Route path="appointments/patients/:patientId" element={<PatientDetails />} />
              {/* Same tree as Appointments, unwrapped by either RoleRoute:
                  reception, doctor and admin all need to see the board, just
                  with different actions gated inside the page itself. */}
              <Route path="emergency" element={<EmergencyCases />} />
              <Route path="emergency/:id" element={<EmergencyCaseDetail />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              {/* Admin sees the whole schedule and manages it; every other
                  role sees only their own shifts. Shifts.jsx picks the
                  screen, and the API enforces the same split. */}
              <Route path="shifts" element={<Shifts />} />

              <Route element={<RoleRoute deny={CLINICAL_DENY} />}>
                <Route path="consultations" element={<Consultations />} />
                <Route path="consultations/:id" element={<ConsultationRoom />} />
                <Route path="cases" element={<Cases />} />
                <Route path="cases/:id" element={<CaseRecord />} />
                <Route path="knowledge" element={<KnowledgeBase />} />
                <Route path="prescriptions" element={<Prescriptions />} />
                <Route path="nursing" element={<NursingMonitor />} />
                <Route path="nursing/updates" element={<NursingUpdates />} />
                <Route
                  path="nursing/alerts"
                  element={<NurseAlerts basePath="/dashboard/nursing" title="Nursing alerts" />}
                />
                <Route path="nursing/:id" element={<NursingRecord />} />
                <Route path="reports" element={<Reports />} />
                {/* Same two screens as the lab module, told to route back
                    here. The server scopes the data by role, so a doctor sees
                    only what they ordered. */}
                <Route
                  path="lab"
                  element={<LabRequests basePath="/dashboard/lab" />}
                />
                <Route
                  path="lab/:id"
                  element={<LabRequestDetail basePath="/dashboard/lab" />}
                />
              </Route>

              <Route element={<RoleRoute deny={ADMIN_ONLY_DENY} />}>
                <Route path="doctors" element={<Doctors />} />
                {/* Who is in today and between what hours. Front desk work —
                    the API allows admin and reception only, so the roles that
                    reach this tree but not that endpoint see its error rather
                    than a blank screen. */}
                <Route path="doctors/availability" element={<DoctorAvailability />} />
                <Route path="departments" element={<Departments />} />
                <Route path="departments/:id" element={<DepartmentDetail />} />
                <Route path="staff" element={<StaffManagement />} />
              </Route>
            </Route>
          </Route>

          {/* Without this a mistyped or stale URL matched nothing and React
              Router rendered an empty document — indistinguishable from a
              crash. NotFound routes the visitor on by role. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
