"""The two clocks stay apart.

`doctor_Assistant` stores two kinds of naive datetime and they are not
interchangeable:

  * `scheduled_at` is naive **local** wall time. It arrives from a
    `datetime-local` input, which sends the time the desk typed with no zone,
    and it is stored unshifted.
  * `created_at`, `arrived_at`, `started_at`, `ended_at` and the audit trail
    are naive **UTC**, written by `db.func.now()` or `datetime.utcnow()`.

Mixing them fails silently rather than loudly, which is what makes it worth a
detector. The local number is simply larger than the UTC one by the practice's
offset, so a comparison across the two still evaluates -- it just evaluates
wrongly, and every guard built on it quietly stops guarding. The history in
this repository is exactly that: the writers were fixed first, and the same
confusion then survived for two more days in the readers, because nobody had
a way to ask which sites were left.

That question is what this check answers. `helpers/datetime_helper` names the
rule and carries the tools for it; these patterns are the rule as a gate.

Deliberately narrow. It matches on the column names themselves, so it reports
sites it can point at rather than guessing about datetime handling generally,
and every pattern below corresponds to a defect that has actually shipped
here at least once.
"""

from __future__ import annotations

import re

from ._util import ERROR, Finding, line_of, source_files

NAME = "clock-rule"
TITLE = "Local/UTC clock discipline"

LOCAL_COLUMN = "scheduled_at"
UTC_COLUMNS = ("created_at", "arrived_at", "started_at", "ended_at")

# Each rule: (compiled pattern, summary, why it is wrong).
RULES = [
    (
        re.compile(r"to_utc_iso\s*\(\s*[^()]*\bscheduled_at\b[^()]*\)"),
        "to_utc_iso() applied to scheduled_at",
        "scheduled_at is local wall time. Stamping a 'Z' on it labels the "
        "reading as UTC, and the browser -- or a person -- then shifts it by "
        "the practice's offset: a 09:00 booking reads as 14:30 on an IST desk. "
        "Use to_local_iso().",
    ),
    (
        re.compile(
            r"\bscheduled_at\b[^\n]{0,80}?(?:utcnow\s*\(\s*\)|to_utc_iso)"
            r"|(?:utcnow\s*\(\s*\)|to_utc_iso)[^\n]{0,80}?\bscheduled_at\b"
        ),
        "scheduled_at measured against a UTC clock",
        "Comparing local wall time against utcnow() does not error -- the "
        "local number is larger by the offset, so the guard silently passes "
        "slots it should refuse. Use datetime.now() / local_naive_day_bounds().",
    ),
    (
        re.compile(r"\bscheduled_at\b[^\n]{0,100}?\blocal_day_bounds\s*\("
                   r"|\blocal_day_bounds\s*\([^\n]{0,100}?\bscheduled_at\b"),
        "scheduled_at matched against local_day_bounds()",
        "local_day_bounds() returns the local day shifted into UTC, for the "
        "UTC columns. Against scheduled_at it moves the day by the offset, so "
        "an evening booking falls out of 'today' and the desk's check-in does "
        "not find it. Use local_naive_day_bounds().",
    ),
    (
        re.compile(
            r"coalesce\s*\(\s*[^()]*\bscheduled_at\b\s*,\s*(?!\s*local_clock)[^()]*"
            r"\b(?:created_at)\b[^()]*\)"
        ),
        "coalesce(scheduled_at, created_at) without local_clock()",
        "The two branches are on different clocks, so the expression puts a "
        "local reading and a UTC one in one column: a walk-in registered at "
        "02:00 files itself under yesterday. Wrap the UTC branch in "
        "local_clock().",
    ),
    (
        re.compile(
            r"to_local_iso\s*\(\s*[^()]*\b(?:" + "|".join(UTC_COLUMNS) + r")\b[^()]*\)"
        ),
        "to_local_iso() applied to a UTC column",
        "Only scheduled_at is local. Dropping the 'Z' from a genuinely UTC "
        "timestamp makes the browser read it as local time and shift it the "
        "other way. Use to_utc_iso().",
    ),
]


def run(ctx):
    findings = []
    scanned = 0

    for path in source_files(ctx.backend, {".py"}):
        # The helper is where the rule is defined and explained; its own
        # docstrings name every pattern above by way of warning about them.
        if path.name == "datetime_helper.py":
            continue
        # The suites deliberately book on both clocks -- `utcnow()` and
        # `datetime.now()` minutes apart -- because the pair is what proves
        # the lead-time guard reads the right one. Flagging the UTC half
        # would report the regression test as the regression.
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if LOCAL_COLUMN not in text and not any(c in text for c in UTC_COLUMNS):
            continue
        scanned += 1
        rel = path.relative_to(ctx.root).as_posix()

        # Comments explain the rule as often as they break it -- matching
        # them would report every warning about the bug as the bug.
        lines = text.splitlines()
        code_only = "\n".join(
            "" if ln.lstrip().startswith("#") else ln for ln in lines
        )

        for pattern, summary, why in RULES:
            for match in pattern.finditer(code_only):
                findings.append(
                    Finding(
                        ERROR,
                        summary,
                        where="%s:%d" % (rel, line_of(code_only, match.start())),
                        detail=match.group(0).strip()[:160] + "\n" + why,
                    )
                )

    print("    %d files carry a timestamp column, %d violations" % (scanned, len(findings)))
    return findings
