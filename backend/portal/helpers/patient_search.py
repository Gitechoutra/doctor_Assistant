"""One rule for "find me this patient", wherever the question is asked.

Every list that shows patients grew its own `?search=` -- the Patients page,
Cases, Consultations, the OP history, Lab Requests, Prescriptions -- and each
one decided for itself which fields it looked at and how. So the same typed
name found a patient on one page and nobody on the next, and Lab Requests
crashed outright because it filtered on `Patient.code`, which is a Python
property and not a column.

The rule, in one place, is the one from `helpers/search.py`:

  * every typed word must match something, so "arjun mehta" narrows "arjun"
  * one word may match any of the patient's own fields -- name, phone, email,
    or the code on their card -- or anything the calling page adds on top
  * matching is case-insensitive and substring-based, so half a name is
    enough and nobody has to type "Arjun" with the capital A

Deliberately *not* searched: allergies, medical history, clinical notes.
Looking for "arjun" must not return a stranger whose notes mention an Arjun.
"""

from portal.extensions import db
from portal.helpers.search import id_from_term, matches_all, terms_from
from portal.models.patient import Patient

# What somebody has to hand when they are looking a patient up: the name, the
# number they left at the desk, their email. The patient code is not a column
# (`Patient.code` is derived from the id) so it is matched via `id_from_term`
# below rather than listed here.
PATIENT_COLUMNS = (Patient.name, Patient.phone, Patient.email)


def patient_code_clauses(term):
    """`Patient.id ==` clauses for a term that reads as a patient code.

    "PAT0004", "pat4" and a bare "4" all mean the same record; anything else
    -- including a ten digit run that is obviously a phone number -- yields
    nothing and is left to the text columns.
    """
    patient_id = id_from_term(term, "pat")
    return [Patient.id == patient_id] if patient_id else []


def code_clauses(term, prefix, column):
    """The same, for a record's own code: "CASE0007", "OP0123", "7"."""
    row_id = id_from_term(term, prefix)
    return [column == row_id] if row_id else []


def patient_search_filter(raw, columns=(), extra=None, relationship=None):
    """`?search=` as a filter, or None when nothing usable was typed.

    `columns` are the calling page's own searchable fields -- a case reason, a
    diagnosis, a test name -- ORed in alongside the patient's for each term, so
    "arjun blood" finds Arjun's blood tests rather than every blood test.
    `extra(term)` does the same for clauses that have to be built per term,
    which is how a record code is matched against its id.

    `relationship` is the owning model's link to Patient (`Appointment.patient`
    and friends). Pass it when the query does not already have Patient joined:
    the patient half is then wrapped in an EXISTS instead, which keeps a second
    join from aliasing the table into a cartesian product. Leave it off when
    the query is over Patient itself or has explicitly joined it.

    Returns None -- meaning "do not narrow the query" -- when the search is
    empty or every word was too short to mean anything.
    """
    terms = terms_from(raw)
    if not terms:
        return None

    def options(term):
        clauses = list(extra(term) or []) if extra else []
        patient_half = [column.ilike(f"%{term}%") for column in PATIENT_COLUMNS]
        patient_half.extend(patient_code_clauses(term))
        if relationship is not None:
            clauses.append(relationship.has(db.or_(*patient_half)))
        else:
            clauses.extend(patient_half)
        return clauses

    # `matches_all` refuses an empty column list, and a page that searches
    # nothing but the patient legitimately has one -- the whole patient half
    # rides in through `extra` in that case.
    if columns:
        return matches_all(terms, tuple(columns), extra=options)
    return db.and_(*(db.or_(*options(term)) for term in terms))
