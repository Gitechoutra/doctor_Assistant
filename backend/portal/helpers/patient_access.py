"""Who may see a patient.

One rule, defined once, applied by every route that returns patient data:

  * **the PA** (no doctor profile) — every patient on the practice's books.
    They run the desk; a patient they cannot see is a patient they cannot
    book, call or find.
  * **the doctor** — the patients assigned to them.

In a single-doctor practice those two sets are the same set, because
registration assigns every new patient to the practice's doctor automatically
(see `helpers/practice`). The scoping is kept rather than deleted for the one
case where it stops being the same set: a practice that takes on a second
doctor, where "my patients" has to keep meaning mine.

Note what is *not* here any more: the emergency carve-out. The hospital
version let an on-duty doctor reach a stranger's record for as long as they
held an open emergency case. A practice has no emergency board and no other
doctor to borrow a patient from, so the exception had nothing left to except.
"""

from portal.models.patient import Patient


def patient_scope(doctor):
    """SQLAlchemy filter for the patients this caller may see, or None for
    unrestricted access. Apply to any query joined to Patient."""
    if not doctor:
        return None
    return Patient.assigned_doctor_id == doctor.id


def scope_patients(query, doctor):
    """Applies patient_scope to a query already selecting/joined to Patient."""
    condition = patient_scope(doctor)
    return query if condition is None else query.filter(condition)


def can_access_patient(patient, doctor):
    """Whether this caller may see one specific patient."""
    if not doctor:
        return True
    # A patient nobody has been assigned yet is visible to the practice's
    # doctor rather than to nobody: registration assigns automatically, so an
    # unassigned row is a gap in the data, not a deliberate restriction, and
    # hiding it would make the patient unreachable from either side.
    if patient.assigned_doctor_id is None:
        return True
    return patient.assigned_doctor_id == doctor.id
