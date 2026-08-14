"""The practice itself: who the doctor is, and how everything resolves to them.

This is a single doctor's practice, and that single fact removes a whole class
of question the hospital version had to ask. There is no department to file a
patient under, no doctor to pick from a list when booking, no rota deciding
whose queue an arrival joins. One doctor, one queue, one record.

`practice_doctor()` is the one place that answers "which doctor?", so every
workflow -- registering a patient, booking an appointment, opening a
consultation -- resolves it identically instead of each carrying its own
guess. Registration and booking call it rather than offering a chooser: a
form field with exactly one possible value is not a choice, it is a step.

Written to survive a second doctor joining. The lookup is "the practice's
doctor" (deterministic: lowest id among active accounts), not "the only row in
the table", and every caller records the id it resolved -- so the day a
practice grows, the existing records still say who they belonged to and the
change needed is a chooser on two forms, not a schema.
"""

from portal.models.doctor import Doctor
from portal.models.user import User


def practice_doctor():
    """The practice's doctor, or None before one has been set up.

    Deterministic where more than one exists: the lowest id among the doctors
    whose account is still active. Never a random pick -- the answer decides
    whose queue a patient lands in, and it has to be the same answer twice
    running.
    """
    return (
        Doctor.query.join(User, Doctor.user_id == User.id)
        .filter(User.is_active.is_(True))
        .order_by(Doctor.id.asc())
        .first()
    )


def practice_doctor_id():
    doctor = practice_doctor()
    return doctor.id if doctor else None


def practice_name():
    """What the practice calls itself on paperwork, falling back to the
    doctor's own name and then to the product name."""
    doctor = practice_doctor()
    if doctor:
        if doctor.practice_name:
            return doctor.practice_name
        if doctor.user and doctor.user.name:
            return f"Dr. {doctor.user.name}".replace("Dr. Dr.", "Dr.")
    return "MediAssist AI"
