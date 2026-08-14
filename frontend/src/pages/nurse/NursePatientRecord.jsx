import { useNavigate, useParams } from "react-router-dom";
import PatientRecord from "../../components/nursing/PatientRecord";

/** The nurse's view of one patient. All the writing controls live inside
 *  PatientRecord and switch themselves on from `can_record`. */
export default function NursePatientRecord() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <PatientRecord
      assignmentId={id}
      backTo="Back to my patients"
      onBack={() => navigate("/nurse/patients")}
    />
  );
}
