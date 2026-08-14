"""Who may see a nursing assignment.

One rule, mirroring `patient_access` for the doctor side:

  * a nurse — only the assignments handed to them
  * a doctor — only the assignments they created for their own patients
  * admin (no doctor/nurse profile) — everything, for oversight

Everything else in the module (medication logs, observations, notes, alerts)
hangs off an assignment, so scoping the assignment scopes the lot.
"""

from portal.helpers.auth_helper import get_current_doctor, get_current_nurse
from portal.models.nursing_assignment import NursingAssignment


def scope_assignments(query):
    """Narrows an assignment query to what the caller is allowed to see."""
    nurse = get_current_nurse()
    if nurse:
        return query.filter(NursingAssignment.nurse_id == nurse.id)

    doctor = get_current_doctor()
    if doctor:
        return query.filter(NursingAssignment.doctor_id == doctor.id)

    return query


def can_view_assignment(assignment):
    nurse = get_current_nurse()
    if nurse:
        return assignment.nurse_id == nurse.id

    doctor = get_current_doctor()
    if doctor:
        return assignment.doctor_id == doctor.id

    return True


def can_record_on(assignment):
    """Whether the caller may add medication logs, observations and notes.

    Only the assigned nurse writes the nursing record — that is the whole
    point of the audit trail. A doctor changes the plan instead, and admins
    read but never write on someone's behalf.
    """
    nurse = get_current_nurse()
    return bool(nurse and assignment.nurse_id == nurse.id and assignment.status == "active")
