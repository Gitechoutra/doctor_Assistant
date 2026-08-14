"""How a typed query becomes a filter, everywhere something is searchable.

Every screen with a search box was deciding this for itself, and the screens
that had not decided anything simply ignored what was typed. That is how you
get a box that finds nobody, and -- worse -- a box that finds everybody:
a single `ilike` over one long OR returns every Mehta in the hospital for
"arjun mehta", because "mehta" alone matched.

The rule here is the one a person expects from a search box:

  * the query is split into words, and **every** word must match something.
    "arjun mehta" is a narrowing of "arjun", never a widening of it.
  * a single word may match **any** of the fields offered -- name, phone,
    department, whatever the caller passes -- so "gastro" finds a doctor by
    speciality and "arjun" finds them by name.
  * matching is case-insensitive and substring-based, so a partial name types
    ahead usefully.

The caller chooses the columns, because which fields are meaningful is a
property of the record and not of the search. `terms_from` is exposed
separately for the callers that also need to look at what was typed --
matching a patient code against an id, say.
"""

from portal.extensions import db

# Enough words to narrow any name in the hospital. Past this the query is
# noise -- a pasted sentence -- and each extra word is another LIKE across the
# table, so it is bounded rather than trusted.
MAX_TERMS = 6

# A single character matches most of the table and tells the person searching
# nothing. Two is where a result list starts to mean something.
MIN_TERM_LENGTH = 2


def terms_from(raw):
    """The usable words in a query, lower-cased. `[]` when nothing was typed.

    Short words are dropped rather than the whole query being refused: typing
    "dr a" should still search for "dr", not fall back to listing everyone.
    """
    words = (raw or "").strip().lower().split()
    return [w for w in words if len(w) >= MIN_TERM_LENGTH][:MAX_TERMS]


def matches_all(terms, columns, extra=None):
    """A filter requiring every term to match at least one of `columns`.

    `extra` is an optional callable taking a single term and returning further
    clauses to OR in for that term -- how a patient code or a bare id gets
    searched alongside the text columns. Returns None when there is nothing to
    filter on, which the caller should read as "do not narrow the query".
    """
    if not terms or not columns:
        return None

    clauses = []
    for term in terms:
        like = f"%{term}%"
        # ilike on a NULL column is NULL, not false, which is what we want:
        # a missing phone number must not stop a name from matching.
        options = [column.ilike(like) for column in columns]
        if extra:
            options.extend(extra(term) or [])
        clauses.append(db.or_(*options))
    return db.and_(*clauses)


def id_from_term(term, prefix):
    """The row id inside a human-facing code, e.g. "PAT0004" -> 4.

    Also accepts the bare number, because that is what half of the hospital
    types. Returns None for anything else -- including a long run of digits
    that is obviously a phone number rather than an id, which would otherwise
    turn every phone search into an id lookup that finds the wrong record.
    """
    cleaned = term.strip().lower()
    if cleaned.startswith(prefix.lower()):
        cleaned = cleaned[len(prefix) :]
    if not cleaned.isdigit() or len(cleaned) > 6:
        return None
    return int(cleaned)
