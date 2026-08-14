"""Who may see a patient.

One rule, defined once, applied by every route that returns patient data:

  * admin / reception (no doctor profile) — the whole hospital
  * a doctor — only the patients assigned to them

Assignment happens at registration: the front desk picks the treating doctor
based on the patient's condition. A patient with no assigned doctor is
deliberately invisible to every doctor — nobody has been made responsible for
them yet, so routing them is front-desk work via
`PATCH /patients/<id>/assignment`.

The one exception is an Emergency Case: an on-duty doctor has to be able to
claim and treat a patient who is unassigned, or assigned to someone else,
without either waiting on the front desk or bumping that patient's regular
doctor off the record. `has_active_emergency_claim` is that carve-out — see
`can_access_patient` below — and is deliberately narrow: it grants access for
exactly as long as the claimed case stays open, and never touches
`assigned_doctor_id` itself.
"""

from portal.extensions import db
from portal.models.emergency_case import EmergencyCase
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


def has_active_emergency_claim(patient_id, doctor_id):
    """Whether `doctor_id` currently holds an open, claimed Emergency Case for
    this patient — the scoped, temporary alternative to `assigned_doctor_id`.
    """
    return (
        db.session.query(EmergencyCase.id)
        .filter(
            EmergencyCase.patient_id == patient_id,
            EmergencyCase.doctor_id == doctor_id,
            EmergencyCase.status == "in_progress",
        )
        .first()
        is not None
    )


def can_access_patient(patient, doctor):
    """Whether this caller may see one specific patient."""
    if not doctor:
        return True
    if patient.assigned_doctor_id == doctor.id:
        return True
    return has_active_emergency_claim(patient.id, doctor.id)
