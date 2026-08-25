"""Where the time goes between the doctor pressing stop and the write-up.

Every stage of the consultation pipeline is timed through one helper so the
numbers are directly comparable and can be grepped out of a log as a set:

    grep 'pipeline stage' backend/logs/*.log

The point is to make optimisation answerable with evidence. The obvious
suspects in this pipeline are not the expensive ones -- ffmpeg preprocessing
measures ~2.2s on a four-minute recording, while a single Gemini round trip is
an order of magnitude more -- and a change made against a guess about that
ratio is as likely to cost time as save it.

Deliberately not a metrics backend. This writes one INFO line per stage with a
duration in milliseconds; anything that wants percentiles can parse them.
"""

import logging
import time
from contextlib import contextmanager

logger = logging.getLogger(__name__)


@contextmanager
def stage(name, **fields):
    """Times a block and logs it, whether or not it raised.

    A stage that fails is still a stage that cost the doctor time, so the
    duration is recorded on the way out either way and the exception is left to
    propagate untouched.
    """
    start = time.perf_counter()
    failed = False
    try:
        yield
    except BaseException:
        failed = True
        raise
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        detail = "".join(f" {key}={value}" for key, value in fields.items())
        logger.info(
            "pipeline stage=%s ms=%.0f%s%s",
            name,
            elapsed_ms,
            detail,
            " failed=1" if failed else "",
        )
