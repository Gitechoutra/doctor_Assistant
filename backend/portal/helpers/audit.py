"""Recording who did what.

Call `audit(...)` from a route right before its `db.session.commit()` -- the
row joins the open session, so an audit entry can never outlive the change it
describes (a failed commit rolls both back together). Same discipline as
`helpers/notify`.

This is the answer to "who changed this patient's medication, and when" during
a dispute or an inspection, so entries are append-only: nothing in the app
updates or deletes an AuditLog row.
"""

from flask_jwt_extended import get_jwt, get_jwt_identity

from portal.extensions import db
from portal.models.audit_log import AuditLog

# Actions worth being able to search for later. Not enforced -- a free-form
# action still records -- but keeping the vocabulary in one place stops
# "patient.update" and "patient_updated" both ending up in the table.
PATIENT_CREATED = "patient.created"
PATIENT_UPDATED = "patient.updated"
# The PA removing a registration that should never have existed -- a duplicate
# or a mistyped walk-in. Only ever a patient with no clinical record; see
# patient_routes.delete_patient.
PATIENT_DELETED = "patient.deleted"
APPOINTMENT_CREATED = "appointment.created"
CONSULTATION_STARTED = "consultation.started"
CONSULTATION_ENDED = "consultation.ended"
CONSULTATION_RESUMED = "consultation.resumed"
PRESCRIPTION_VERIFIED = "prescription.verified"
PRESCRIPTION_UNVERIFIED = "prescription.unverified"
# The knowledge base of doctor-approved cases. Learning and retiring are
# recorded because a precedent shapes what is later suggested for other
# patients -- "why was this treatment suggested" has to be answerable.
PRECEDENT_LEARNED = "knowledge.precedent_learned"
PRECEDENT_RETIRED = "knowledge.precedent_retired"
PRECEDENT_ACCEPTED = "knowledge.precedent_accepted"
# A doctor prescribed something the catalogue lacked, so it was added.
# Recorded because it is how the practice's medicine list grows.
CUSTOM_MEDICINE_REQUESTED = "formulary.medicine_added_by_doctor"
CASE_CLOSED = "case.closed"
CASE_REOPENED = "case.reopened"
FINAL_PRESCRIPTION_EDITED = "case.final_prescription_edited"
FINAL_PRESCRIPTION_VERIFIED = "case.final_prescription_verified"
FINAL_PRESCRIPTION_UNVERIFIED = "case.final_prescription_unverified"


def audit(action, entity=None, entity_id=None, detail=None, user_id=None):
    """Queues one audit row against the current user. Returns the row.

    `detail` is a short human-readable summary -- what a reader needs to
    understand the entry without joining back to five other tables.
    """
    # RuntimeError matters as much as the type errors: flask_jwt_extended
    # raises it when there is no verified token in the request at all, which
    # is the normal case for the public registration route and for anything
    # run from a seeder or a shell. An audit row with no actor is still worth
    # having -- losing the whole write because nobody was logged in is not.
    if user_id is None:
        try:
            user_id = int(get_jwt_identity())
        except (RuntimeError, TypeError, ValueError):
            user_id = None

    try:
        role = get_jwt().get("role")
    except (RuntimeError, TypeError, ValueError):
        role = None

    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        actor_role=role,
        detail=(detail or None) if detail is None else str(detail)[:255],
    )
    db.session.add(entry)
    return entry
