import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi2";
import DoctorsTable from "../components/DoctorsTable";
import { fetchDepartment } from "../services/departmentService";
import { fetchDoctors } from "../services/doctorService";

export default function DepartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [department, setDepartment] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDepartment(id), fetchDoctors(id)])
      .then(([dept, docs]) => {
        setDepartment(dept);
        setDoctors(docs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard/departments")}
        className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <HiArrowLeft className="h-4 w-4" />
        Back to departments
      </button>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : !department ? (
        <p className="text-sm text-slate-400">Department not found.</p>
      ) : (
        <>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{department.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {department.doctor_count} doctor{department.doctor_count === 1 ? "" : "s"}
          </p>

          <div className="mt-6">
            <DoctorsTable
              doctors={doctors}
              showDepartment={false}
              emptyMessage={`No doctors in ${department.name} yet.`}
            />
          </div>
        </>
      )}
    </div>
  );
}
