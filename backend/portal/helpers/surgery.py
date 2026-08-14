"""The surgical pathway: keeping a patient's stage honest when it is read.

`Patient.refresh_surgery_stage()` moves a patient from `post_op` to
`ready_for_discharge` once the observation window has elapsed. Nothing calls it
on a timer -- the only thing the transition changes is what the doctor and the
nurse are shown, so evaluating it on read is both sufficient and impossible to
miss. These helpers are the read side of that: call one, then commit if it
returns True.

Kept out of the model so the "did anything change, do I need to commit?"
bookkeeping lives in one place rather than being repeated at every call site.
"""

from portal.extensions import db


def refresh_surgery_stages(patients, commit=True):
    """Advances every patient whose observation window has run out.

    Takes an iterable so a list route pays for one commit rather than one per
    row. Returns how many changed; with `commit=False` the caller owns the
    commit, which is what a route already writing in the same request wants.
    """
    changed = 0
    for patient in patients:
        if patient is not None and patient.refresh_surgery_stage():
            changed += 1
    if changed and commit:
        db.session.commit()
    return changed


def refresh_for_assignments(assignments, commit=True):
    """The same, for the patients behind a set of nursing assignments.

    The doctor's monitor and the nurse's ward list both read assignments rather
    than patients, and both need to show "observation finished" the moment it
    is true.
    """
    return refresh_surgery_stages(
        [a.patient for a in assignments if a is not None], commit=commit
    )
