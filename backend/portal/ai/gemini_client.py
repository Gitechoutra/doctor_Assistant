import io
import json
import logging
import os
import random
import re
import subprocess
import tempfile
import time

import httpx
from google import genai
from google.genai import errors as genai_errors, types

from portal.ai import ffmpeg_setup  # noqa: F401  (puts ffmpeg on PATH)

# A child of the app's own "portal" logger, so these land in portal.log
# alongside everything else.
logger = logging.getLogger(__name__)

_client = None


class QuotaExceededError(Exception):
    """The Gemini API refused the call because the account is out of quota.

    Raised in place of the raw SDK error so callers can say something useful.
    A 429 is not a bug and not something a doctor can fix by trying harder —
    it is either a short per-minute burst limit or the free tier's daily cap,
    and the two need different advice. Everything needed to tell them apart
    is carried here rather than left in a JSON blob.
    """

    def __init__(self, message, retry_seconds=None, is_daily=False, model=None):
        super().__init__(message)
        self.retry_seconds = retry_seconds
        self.is_daily = is_daily
        self.model = model


def _quota_error(exc, model):
    """Turns a 429 from the SDK into a QuotaExceededError, or returns None.

    The response carries `RetryInfo` (how long to wait) and `QuotaFailure`
    (which limit was hit). A quotaId naming a per-day limit means waiting for
    the retry delay will not help — the cap resets on its own schedule — so
    that distinction is what decides the advice given.
    """
    if getattr(exc, "code", None) != 429:
        return None

    details = getattr(exc, "details", None) or {}
    payload = details.get("error", details) if isinstance(details, dict) else {}
    retry_seconds, is_daily = None, False

    for item in payload.get("details") or []:
        if not isinstance(item, dict):
            continue
        kind = item.get("@type", "")
        if kind.endswith("RetryInfo"):
            raw = str(item.get("retryDelay") or "").rstrip("s")
            try:
                retry_seconds = int(float(raw))
            except (TypeError, ValueError):
                retry_seconds = None
        elif kind.endswith("QuotaFailure"):
            for violation in item.get("violations") or []:
                quota_id = (violation.get("quotaId") or "").lower()
                if "perday" in quota_id or "per_day" in quota_id:
                    is_daily = True

    if is_daily:
        message = (
            f"The AI service has used up its daily free-tier quota for {model}. "
            "It resets on Google's daily schedule — until then, ending a consultation "
            "cannot generate a summary. Switching GEMINI_MODEL to another model, or "
            "enabling billing on the API key, lifts the limit."
        )
    elif retry_seconds:
        message = (
            f"The AI service is rate-limited right now. Try again in about "
            f"{retry_seconds} seconds."
        )
    else:
        message = "The AI service is rate-limited right now. Try again shortly."

    return QuotaExceededError(
        message, retry_seconds=retry_seconds, is_daily=is_daily, model=model
    )


class AIServiceUnavailableError(Exception):
    """The Gemini API could not be reached, after retrying.

    Distinct from a quota refusal: nothing is wrong with the request, the
    account or the recording — the connection to Google dropped. Raised in
    place of the raw socket error so a doctor sees an instruction they can act
    on instead of "[WinError 10054] An existing connection was forcibly closed
    by the remote host".
    """


class SilentRecordingError(Exception):
    """The clip is below the noise floor — nothing was captured at all.

    Detected locally, before the upload, so a muted mic or a device the
    browser picked that isn't the one on the desk is reported as the hardware
    problem it is rather than as "the AI found no speech".
    """


# Retried, because none of these mean the request was wrong. A 429 is
# deliberately absent: quota is handled separately, with advice, and sitting
# in a backoff loop only delays telling the doctor about it.
_RETRIABLE_STATUS = (408, 500, 502, 503, 504)

# Winsock's flavours of "the connection went away mid-request": reset by peer,
# aborted by the local stack, timed out. These arrive as bare OSErrors on
# Windows rather than as anything httpx models.
_RETRIABLE_WINSOCK = (10053, 10054, 10060)

MAX_ATTEMPTS = 4
RETRY_BASE_DELAY = 1.5  # seconds, doubled each attempt

# How long any single request may take before it is abandoned and retried. A
# whole-consultation recording is a real upload followed by real inference, so
# this is generous — but unbounded is worse: a half-open socket would hang the
# doctor's browser forever with no way back.
REQUEST_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "300"))


def _is_transient(exc):
    """Whether this failure is worth retrying rather than reporting."""
    if isinstance(exc, genai_errors.ServerError):
        return True
    if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in _RETRIABLE_STATUS:
        return True

    # httpx.TransportError covers connect/read/write/timeout/protocol errors —
    # every way a request can die without the server ever answering. The cause
    # chain is walked because httpx does not wrap all of them: a reset raised
    # while the request body is still being written surfaces as a plain
    # ConnectionResetError.
    seen = 0
    current = exc
    while current is not None and seen < 10:
        if isinstance(current, (httpx.TransportError, ConnectionError, TimeoutError)):
            return True
        if isinstance(current, OSError) and (
            current.errno in _RETRIABLE_WINSOCK
            or getattr(current, "winerror", None) in _RETRIABLE_WINSOCK
        ):
            return True
        current = current.__cause__ or current.__context__
        seen += 1
    return False


def _call(fn, model, doing="talking to the AI service", attempts=MAX_ATTEMPTS):
    """Runs an SDK call, retrying dropped connections and translating refusals.

    Wrapped at the call site rather than at the top of each public function so
    a 429 raised on a retry attempt is translated too.

    The SDK does not retry anything by default, and even when configured it
    only covers connect and timeout errors — not a reset partway through, which
    is exactly what a several-megabyte audio upload over a flaky link runs
    into. So the retry lives here, where it can also cover the transcription
    and summary calls uniformly.
    """
    last_error = None
    for attempt in range(attempts):
        try:
            return fn()
        except genai_errors.ClientError as exc:
            quota = _quota_error(exc, model)
            if quota:
                raise quota from exc
            if not _is_transient(exc):
                raise
            last_error = exc
        except Exception as exc:  # noqa: BLE001 - re-raised below unless transient
            if not _is_transient(exc):
                raise
            last_error = exc

        if attempt < attempts - 1:
            # Jittered, so two consultations ending at the same moment don't
            # retry in lockstep against a service that is already struggling.
            delay = RETRY_BASE_DELAY * (2**attempt) + random.uniform(0, 0.5)
            logger.warning(
                "Transient failure while %s (attempt %s/%s): %s — retrying in %.1fs",
                doing,
                attempt + 1,
                attempts,
                last_error,
                delay,
            )
            time.sleep(delay)

    logger.error("Gave up %s after %s attempts: %s", doing, attempts, last_error)
    raise AIServiceUnavailableError(
        f"The connection to the AI service kept dropping while {doing}. This is a "
        "network problem, not a problem with your recording — nothing has been lost. "
        "Check the internet connection and try again."
    ) from last_error

SYSTEM_INSTRUCTION = """You are a clinical documentation assistant embedded in a doctor's private practice \
management system. You are NOT a doctor and must never present a diagnosis as final \
or certain — all diagnosis output is assistive only, for the treating doctor to review.

The transcript you receive is captured from a single continuous recording of the whole visit \
with no speaker tags — the doctor did not manually mark who was talking. Your first job is to \
read the raw transcript segments and reconstruct who most likely said each part, using context \
(clinical questions and instructions are almost always the doctor; symptom descriptions and \
answers are almost always the patient). This reconstruction is a best-effort inference, not a \
verified transcript.

You may also be given APPROVED CASE PRECEDENTS: past consultations at this same practice \
where the doctor reviewed the AI's analysis and personally signed off the prescription. They \
are the strongest evidence available about how this doctor actually treats a given \
presentation, and using them is what makes suggestions consistent between patients.

Rules for precedents:
- Judge each precedent yourself. Use one only when the presentation genuinely matches this \
patient's — similar wording is not a match if the clinical picture differs. A retrieved \
precedent that does not fit must be ignored, not stretched to fit.
- When one does match, REUSE its approved medicines. That is the point of a precedent: a \
doctor already decided how this presentation is treated, and repeating that decision is \
better than composing a new prescription. Carry over its doses, frequencies, durations and \
quantities, and set from_precedent_id to that precedent's id.
- A medicine named in a matching precedent may be prescribed even if it does not appear in \
the formulary list below. It was approved and signed for by the doctor at this practice, which \
is a stronger warrant than catalogue membership. Write its name exactly as the precedent \
does. This is the ONLY case where a medicine outside the formulary is allowed.
- Never return an empty prescription solely because the medicines you would use are missing \
from the formulary. If a precedent matches, use its medicines.
- Adapt rather than copy blindly. Drop or change anything the precedent prescribed that this \
patient's allergies, medical history or current presentation contraindicate, and say so in \
the summary.
- Set from_precedent_id only for a medicine genuinely carried over from that precedent. For \
anything you are proposing yourself, leave it unset — never attach a precedent id to a \
medicine that precedent did not contain.
- Precedents are de-identified. Never speculate about, or refer to, the patient a precedent \
came from.

Rules:
- Only suggest medicines that appear in the provided practice formulary list. Never invent \
a medicine name that is not in that list. Write `medicine_name` exactly as it appears there, \
including the strength — the chemist dispenses against that name.
- For each medicine give `quantity` as the total amount to hand over (e.g. "15 tablets", \
"1 bottle of 100ml"), consistent with the dose, frequency and duration you set. \
`instructions` is the plain-English line the patient reads on the label.
- Everything you produce is a suggestion for the treating doctor to review, change or \
reject. Never present a prescription as final or as already authorised.
- Base the summary strictly on what was actually said in the transcript. Do not invent \
symptoms, history, or details not present in the conversation.
- When earlier sessions of the same course of treatment are provided, use them only as \
background to interpret this one (e.g. to understand "it's better now"). Never report \
something from an earlier session as if it was said today.
- When reconstructing speaker turns, preserve the original wording — do not paraphrase.
- Write every field in English, even if a stray non-English word or phrase remains in the \
transcript (the audio may mix English with Hindi, Telugu, Tamil, or other Indian languages) —
translate anything non-English into clear clinical English rather than copying it verbatim.
- Respond with ONLY valid JSON matching the exact schema requested. No markdown, no prose \
outside the JSON.
"""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "labeled_transcript": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "speaker": {"type": "STRING", "enum": ["doctor", "patient"]},
                    "text": {"type": "STRING"},
                },
                "required": ["speaker", "text"],
            },
        },
        "summary": {"type": "STRING"},
        "symptoms": {"type": "STRING"},
        "possible_diagnosis": {"type": "STRING"},
        "follow_up_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "lifestyle_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "prescriptions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "medicine_name": {"type": "STRING"},
                    "dose": {"type": "STRING"},
                    "frequency": {"type": "STRING"},
                    "duration": {"type": "STRING"},
                    # How much the chemist should dispense, e.g. "20 tablets".
                    # Separate from dose, which is what the patient takes at a
                    # time — the counter cannot infer one from the other.
                    "quantity": {"type": "STRING"},
                    # How the patient takes it, for the label.
                    "instructions": {"type": "STRING"},
                    # Which approved case this medicine was carried over from,
                    # if any. Validated server-side against the precedents
                    # actually retrieved, so a wrong id cannot fabricate
                    # provenance that no doctor ever created.
                    "from_precedent_id": {"type": "INTEGER"},
                },
                "required": ["medicine_name"],
            },
        },
        # Why the precedents were or weren't followed, in the doctor's terms.
        # Blank when none were retrieved.
        "precedent_reasoning": {"type": "STRING"},
    },
    "required": [
        "labeled_transcript",
        "summary",
        "symptoms",
        "possible_diagnosis",
        "follow_up_advice",
        "lifestyle_advice",
        "prescriptions",
    ],
}


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in the environment")
        _client = genai.Client(
            api_key=api_key,
            # HttpOptions.timeout is in milliseconds. Without it httpx waits
            # indefinitely, so a connection that dies quietly rather than
            # resetting never fails and never retries — it just hangs.
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_SECONDS * 1000),
        )
    return _client


TRANSCRIBE_INSTRUCTION = """Transcribe this audio recording of a doctor-patient consultation, \
word for word. Speakers may switch between English and Indian languages (Hindi, Telugu, Tamil, \
or others) within the same sentence — translate everything into clear English. Output ONLY the \
transcribed text: no speaker labels, no timestamps, no commentary, no markdown.

The recording is made by one microphone sitting between two people in a consulting room, so \
one speaker is often much further from it than the other. It has been volume-normalised before \
reaching you, which lifts faint speech but also lifts room noise with it. Transcribe every part \
of the conversation, including passages that are quiet, distant, muffled or noisy — do not skip \
a passage merely because it is hard to hear. Where a few words are genuinely unintelligible, \
write [inaudible] for just those words and carry on with the rest.

CRITICAL: This is a clinical recording — never invent, guess, or fabricate any dialogue, \
symptoms, or diagnosis that isn't clearly and actually spoken in the audio. If the recording is \
silent, contains no intelligible speech, or is just background/mic noise, output exactly this \
literal token and nothing else: [NO_SPEECH]"""

NO_SPEECH_TOKEN = "[NO_SPEECH]"

# --- Preparing the recording for upload ------------------------------------

# A consultation is recorded across a desk, not into a headset. The doctor
# leaning towards the laptop lands 20-30 dB hotter than the patient sitting
# back from it, and handing that straight to the model is what made a
# soft-spoken patient come back as [NO_SPEECH] or vanish from the middle of
# an otherwise complete transcript. So the audio is levelled before it is
# sent, in two stages that do different jobs:
#   highpass    — drops rumble, mains hum and desk knocks that would otherwise
#                 soak up the gain the quiet speech needs.
#   speechnorm  — expands towards full scale, per speech half-cycle, capped at
#                 the filter's maximum (e=50) with its own peak ceiling at
#                 p=0.95 so nothing clips. The raise rate is well above the
#                 default: at the default it takes minutes to adapt, which is
#                 useless when the speaker changes every few seconds.
#   dynaudnorm  — evens out what is left across a moving window, which is what
#                 actually closes the doctor-to-patient gap. Measured on a
#                 34 dB level difference, speechnorm alone left 34 dB; the two
#                 together leave about 5 dB.
# Overridable so this can be tuned against a real room without a code change.
DEFAULT_AUDIO_FILTERS = (
    "highpass=f=80,"
    "speechnorm=p=0.95:e=50:r=0.01,"
    "dynaudnorm=f=150:g=15:p=0.9:m=30"
)
AUDIO_FILTERS = os.getenv("GEMINI_AUDIO_FILTERS", DEFAULT_AUDIO_FILTERS)

# 16 kHz mono is the standard speech-recognition format and everything above
# it is wasted bytes. MP3 rather than WAV because a whole consultation as
# 16-bit PCM is ~2 MB per minute — a 15-minute visit is a 30 MB upload, over
# the API's inline limit and long enough on a domestic connection to be reset
# partway through. At 64 kbit/s the same visit is under 8 MB, with no loss
# that matters at this bandwidth.
AUDIO_SAMPLE_RATE = "16000"
AUDIO_BITRATE = os.getenv("GEMINI_AUDIO_BITRATE", "64k")
AUDIO_MIME_TYPE = "audio/mp3"

# Peak level below which the clip holds nothing but the noise floor — a muted
# mic, or the browser recording from a device that isn't the one on the desk.
# Set deliberately low. Normalisation is what rescues quiet speech, so the only
# job of this threshold is to separate "nothing was captured" from "captured
# faintly", and getting it wrong in the strict direction would throw away
# exactly the quiet consultations this is all meant to save. A muted input
# measures around -90 dBFS; even a badly placed mic in a quiet room stays
# above -55.
SILENCE_FLOOR_DBFS = float(os.getenv("GEMINI_SILENCE_FLOOR_DBFS", "-60"))

# Above this, the recording goes through the Files API instead of being
# inlined in the request. The documented inline ceiling is 20 MB, and a
# resumable upload survives a dropped connection far better than one large
# request body does.
INLINE_AUDIO_LIMIT = 15 * 1024 * 1024

_MAX_VOLUME_RE = re.compile(rb"max_volume:\s*(-?\d+(?:\.\d+)?) dB")


def _ffmpeg(args):
    return subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", *args], capture_output=True
    )


def _peak_dbfs(path):
    """Peak level of a recording, in dBFS, or None if ffmpeg wouldn't say.

    Measured before normalisation — afterwards everything peaks near full
    scale by construction, which tells you nothing about what the microphone
    actually heard.
    """
    result = _ffmpeg(["-i", path, "-af", "volumedetect", "-f", "null", "-"])
    match = _MAX_VOLUME_RE.search(result.stderr or b"")
    return float(match.group(1)) if match else None


def _prepare_audio(audio_bytes):
    """Normalises the browser's webm/opus recording into mono MP3 for upload.

    Returns (mp3_bytes, peak_dbfs_of_the_original). Raises SilentRecordingError
    when there was nothing on the recording to normalise in the first place.
    """
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src:
        src.write(audio_bytes)
        src_path = src.name
    dst_path = src_path + ".mp3"

    try:
        peak = _peak_dbfs(src_path)
        if peak is not None and peak < SILENCE_FLOOR_DBFS:
            logger.warning("Recording rejected as silent: peak %.1f dBFS", peak)
            raise SilentRecordingError(
                "The microphone barely picked anything up — the recording is silent. "
                "Check that the right microphone is selected and unmuted, and that the "
                "browser has permission to use it, then record again."
            )

        encode = ["-y", "-i", src_path, "-vn", "-ac", "1", "-ar", AUDIO_SAMPLE_RATE]
        result = _ffmpeg(
            [*encode, "-af", AUDIO_FILTERS, "-c:a", "libmp3lame", "-b:a", AUDIO_BITRATE, dst_path]
        )
        if result.returncode != 0:
            # The filter chain is the only part of this that a different
            # ffmpeg build might not support, and a transcript from
            # un-normalised audio beats no transcript at all.
            logger.warning(
                "Audio filter chain failed, falling back to a plain conversion: %s",
                (result.stderr or b"").decode(errors="replace")[-500:],
            )
            result = _ffmpeg(
                [*encode, "-c:a", "libmp3lame", "-b:a", AUDIO_BITRATE, dst_path]
            )
        if result.returncode != 0:
            raise RuntimeError(
                "Could not convert the recording: "
                + (result.stderr or b"").decode(errors="replace")[-500:]
            )

        with open(dst_path, "rb") as f:
            prepared = f.read()

        logger.info(
            "Prepared %.1f KB of audio for transcription (was %.1f KB, peak %s dBFS)",
            len(prepared) / 1024,
            len(audio_bytes) / 1024,
            f"{peak:.1f}" if peak is not None else "unknown",
        )
        return prepared, peak
    finally:
        os.remove(src_path)
        if os.path.exists(dst_path):
            os.remove(dst_path)


def _wait_until_active(client, uploaded, model_name):
    """Blocks until an uploaded file is usable, or gives up.

    A file referenced while it is still PROCESSING is rejected, so the wait is
    part of uploading rather than something the caller should have to know.
    """
    deadline = time.monotonic() + 120
    while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
        if time.monotonic() > deadline:
            raise AIServiceUnavailableError(
                "The AI service did not finish accepting the recording in time. "
                "Nothing has been lost — please try again."
            )
        time.sleep(2)
        uploaded = _call(
            lambda: client.files.get(name=uploaded.name), model_name, "checking the upload"
        )

    if getattr(uploaded.state, "name", str(uploaded.state)) == "FAILED":
        raise RuntimeError("The AI service rejected the uploaded recording")
    return uploaded


def _audio_part(client, audio_bytes, model_name):
    """The recording as something `generate_content` can take.

    Returns (part, uploaded_name). `uploaded_name` is None for the inline case
    and otherwise names a server-side file the caller must delete.
    """
    if len(audio_bytes) <= INLINE_AUDIO_LIMIT:
        return types.Part.from_bytes(data=audio_bytes, mime_type=AUDIO_MIME_TYPE), None

    uploaded = _call(
        lambda: client.files.upload(
            file=io.BytesIO(audio_bytes),
            config=types.UploadFileConfig(mime_type=AUDIO_MIME_TYPE),
        ),
        model_name,
        "uploading the recording",
    )
    uploaded = _wait_until_active(client, uploaded, model_name)
    return uploaded, uploaded.name


# --- Embeddings, for matching a presentation to approved cases -------------

# 768 rather than the model's full width: it is the smallest documented output
# size that still separates clinical presentations cleanly, and every stored
# vector is scanned on every consultation.
EMBEDDING_DIMENSIONS = 768
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"


def embedding_model_name():
    return os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)


def embed_text(text, is_query=False):
    """Embeds one piece of text for similarity matching.

    `is_query` picks the task type: a live consultation is a query against the
    knowledge base, a case being learned is a document in it. The distinction
    is what the embedding model is trained on, and asymmetric retrieval is
    measurably better than embedding both sides the same way.

    Returns None for empty input, so callers can treat "nothing to match on"
    and "matching unavailable" the same way.
    """
    text = (text or "").strip()
    if not text:
        return None

    model_name = embedding_model_name()
    response = _call(
        lambda: _get_client().models.embed_content(
            model=model_name,
            contents=[text],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY" if is_query else "RETRIEVAL_DOCUMENT",
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        ),
        model_name,
        "matching against past cases",
        # Fewer attempts than a summary gets: every caller of this already
        # degrades gracefully to "no precedents", so a long backoff here only
        # delays a consultation that is going to be summarised regardless.
        attempts=2,
    )
    return list(response.embeddings[0].values)


def transcribe_audio(audio_bytes):
    """Transcribes+translates a recorded consultation clip via Gemini's native
    audio understanding, instead of a local CPU-bound Whisper pass. A
    multi-minute recording that took ~2 minutes on local "small" Whisper comes
    back in a few seconds from Gemini's hosted inference — the doctor isn't
    waiting on this laptop's CPU anymore.

    The clip is levelled and compressed first — see `_prepare_audio`. That is
    what makes the quieter of the two people in the room transcribe, and it is
    also what keeps the upload small enough to survive an ordinary connection.
    """
    prepared, peak = _prepare_audio(audio_bytes)
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    client = _get_client()
    part, uploaded_name = _audio_part(client, prepared, model_name)

    try:
        response = _call(
            lambda: client.models.generate_content(
                model=model_name,
                contents=[TRANSCRIBE_INSTRUCTION, part],
                # Verbatim transcription is not a creative task, and sampling
                # is where invented dialogue comes from.
                config=types.GenerateContentConfig(temperature=0),
            ),
            model_name,
            "transcribing the recording",
        )
    finally:
        if uploaded_name:
            try:
                client.files.delete(name=uploaded_name)
            except Exception:  # noqa: BLE001 - the file expires on its own anyway
                logger.warning("Could not delete uploaded audio %s", uploaded_name)

    text = (response.text or "").strip()
    if not text or NO_SPEECH_TOKEN in text:
        logger.info(
            "No speech found in a recording peaking at %s dBFS",
            f"{peak:.1f}" if peak is not None else "unknown",
        )
        return ""
    return text


def _format_prescriptions(prescriptions):
    lines = []
    for p in prescriptions or []:
        parts = [p.get("dose"), p.get("frequency"), p.get("duration")]
        detail = " · ".join(filter(None, parts)) or "no instructions recorded"
        lines.append(f"  - {p.get('medicine_name')} ({detail})")
    return "\n".join(lines) or "  - none prescribed"


def _format_prior_sessions(prior_sessions):
    """The earlier sessions of the same case, as context for this one.

    A follow-up is only meaningful against what came before it: "the pain is
    better" says nothing without knowing what the pain was and what was
    prescribed for it. Passed as read-only background — the summary being
    generated must still describe only what was said in *this* session.
    """
    if not prior_sessions:
        return ""

    blocks = []
    for session in prior_sessions:
        blocks.append(
            f"""--- Session {session.get('session_number')} ({session.get('date') or 'date unknown'}) ---
Summary: {session.get('summary') or '—'}
Symptoms: {session.get('symptoms') or '—'}
Assistive diagnosis: {session.get('possible_diagnosis') or '—'}
Prescribed then:
{_format_prescriptions(session.get('prescriptions'))}"""
        )

    return f"""
EARLIER SESSIONS OF THIS SAME COURSE OF TREATMENT (background only — do NOT
restate them as if they happened in today's conversation):
{chr(10).join(blocks)}
"""


def _format_precedents(precedents):
    """The approved-case block of the prompt.

    Each entry is a decision the doctor at this practice already made and signed
    off. They are presented as candidates to be judged, not as answers — the
    retrieval that found them matched on wording, and only the model reading
    the actual consultation can tell whether the clinical picture really is
    the same.
    """
    if not precedents:
        return ""

    blocks = []
    for precedent in precedents:
        medicines = _format_prescriptions(precedent.get("approved_medicines"))
        accepted = precedent.get("times_approved_for_similar_cases") or 0
        track_record = (
            f"\nThis precedent has been approved again for {accepted} similar case(s) since."
            if accepted
            else ""
        )
        blocks.append(
            f"""--- PRECEDENT #{precedent.get('precedent_id')} (similarity {precedent.get('similarity')}) ---
Patient context: {precedent.get('patient_context')}
Symptoms recorded then: {precedent.get('symptoms') or '—'}
Diagnosis reached: {precedent.get('diagnosis') or '—'}
Medicines the doctor approved:
{medicines}{track_record}"""
        )

    return f"""
APPROVED CASE PRECEDENTS — past consultations at this practice whose prescriptions the doctor
reviewed and signed off, retrieved because the recorded presentation resembles this one.
Judge each on the clinical picture, not on wording. Follow the ones that genuinely match and
ignore the ones that do not.
{chr(10).join(blocks)}
"""


def _build_prompt(
    patient,
    messages,
    formulary,
    prior_sessions=None,
    session_number=None,
    precedents=None,
):
    # Segments are numbered in recording order but deliberately unlabeled —
    # Gemini infers doctor/patient from content, not from any tag we provide.
    transcript = "\n".join(f"[{i + 1}] {m['message']}" for i, m in enumerate(messages))
    formulary_list = "\n".join(f"- {m['name']} (usual dose: {m.get('default_dose') or 'n/a'})" for m in formulary)

    session_line = (
        f"This is session {session_number} of an ongoing course of treatment.\n"
        if session_number and session_number > 1
        else ""
    )

    return f"""Patient: {patient.get('name')}, {patient.get('gender') or 'unknown gender'}, \
blood group {patient.get('blood_group') or 'unknown'}.
Known allergies: {patient.get('allergies') or 'none recorded'}.
Medical history: {patient.get('medical_history') or 'none recorded'}.
{session_line}{_format_prior_sessions(prior_sessions)}{_format_precedents(precedents)}
Raw consultation transcript segments (unlabeled, in chronological order):
{transcript}

Practice formulary (ONLY suggest medicines from this list):
{formulary_list}

First reconstruct labeled_transcript (who most likely said each part), then generate the \
clinical summary, assistive diagnosis, prescription suggestions, and advice — all as JSON \
matching the required schema."""


def generate_consultation_summary(
    patient,
    messages,
    formulary,
    prior_sessions=None,
    session_number=None,
    precedents=None,
):
    """Summarises one session and suggests a prescription for the doctor.

    `prior_sessions` carries the earlier sessions of the same case so a
    follow-up reads as a follow-up ("the cough has settled since the last
    visit") instead of as an isolated first encounter. The output still
    describes only this session — the consolidated view across all of them is
    `consolidate_case`'s job.

    `precedents` carries doctor-approved cases with a similar presentation, so
    a patient who looks like one the practice has treated before gets that
    same approved treatment put in front of the doctor rather than a fresh
    invention. Every suggestion remains a suggestion: the doctor reviews,
    edits and signs off before anything counts as prescribed.
    """
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    prompt = _build_prompt(
        patient, messages, formulary, prior_sessions, session_number, precedents
    )

    client = _get_client()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=RESPONSE_SCHEMA,
    )

    return _generate_json(client, model_name, prompt, config)


def _generate_json(client, model_name, prompt, config, doing="writing up the consultation"):
    """One retry, because a malformed response is almost always transient and
    losing a whole consultation's summary to it is not acceptable.

    This retries a *well-formed response containing malformed JSON*. Dropped
    connections are retried a level down, inside `_call`.
    """
    last_error = None
    for _attempt in range(2):
        response = _call(
            lambda: client.models.generate_content(
                model=model_name, contents=prompt, config=config
            ),
            model_name,
            doing,
        )
        try:
            return json.loads(response.text)
        except (json.JSONDecodeError, TypeError) as exc:
            last_error = exc
            continue

    raise ValueError(f"Gemini did not return valid JSON after retry: {last_error}")


# --- Consolidating a whole case -------------------------------------------

CONSOLIDATION_SYSTEM_INSTRUCTION = """You are a clinical documentation assistant embedded \
in a doctor's practice management system. You are NOT a doctor, and everything you produce is \
assistive only, for the treating doctor to review and sign off.

You are given every consultation session of one course of treatment for one patient, in \
chronological order. Each session already has its own summary, symptoms, assistive \
diagnosis and the prescription issued that day. Your job is to write the single \
consolidated record of the whole course of treatment, ending in one final medication list.

Rules for the consolidated prescription — this is the part a chemist may dispense from, \
so it must be conservative:
- Include ONLY medicines that were actually prescribed in one or more of the sessions. \
Never introduce a medicine that appears in no session.
- One row per medicine. If the same medicine was prescribed more than once, keep the \
instructions from the LATEST session that prescribed it — a later review supersedes an \
earlier one.
- Leave out a medicine that the transcript or summaries indicate was stopped, completed, \
or replaced. If it is unclear whether a medicine was stopped, KEEP it and say so in its \
note rather than silently dropping a live prescription.
- `note` is short provenance in plain clinical English, e.g. "started session 1, dose \
increased session 3", "added at session 2", "continue as before". Never leave it as \
filler like "n/a".
- `source_session_number` is the session number whose instructions you took.

Rules for the narrative fields:
- `overall_summary` covers the whole course of treatment, not the last session.
- `progression` describes how the patient actually changed from the first session to the \
last, citing sessions by number. Say plainly if there was no clear change.
- `final_diagnosis` stays assistive and must never be phrased as confirmed or certain.
- Base everything strictly on the sessions provided. Do not invent visits, symptoms, \
results or medicines.
- Write every field in English.
- Respond with ONLY valid JSON matching the exact schema requested. No markdown, no prose \
outside the JSON.
"""

CONSOLIDATION_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "overall_summary": {"type": "STRING"},
        "progression": {"type": "STRING"},
        "final_diagnosis": {"type": "STRING"},
        "follow_up_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "lifestyle_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "consolidated_prescriptions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "medicine_name": {"type": "STRING"},
                    "dose": {"type": "STRING"},
                    "frequency": {"type": "STRING"},
                    "duration": {"type": "STRING"},
                    "source_session_number": {"type": "INTEGER"},
                    "note": {"type": "STRING"},
                },
                "required": ["medicine_name"],
            },
        },
    },
    "required": [
        "overall_summary",
        "progression",
        "final_diagnosis",
        "follow_up_advice",
        "lifestyle_advice",
        "consolidated_prescriptions",
    ],
}


def _build_consolidation_prompt(patient, sessions):
    blocks = []
    for session in sessions:
        blocks.append(
            f"""=== SESSION {session.get('session_number')} — {session.get('date') or 'date unknown'} ===
Summary: {session.get('summary') or '—'}
Symptoms: {session.get('symptoms') or '—'}
Assistive diagnosis: {session.get('possible_diagnosis') or '—'}
Follow-up advice given: {'; '.join(session.get('follow_up_advice') or []) or '—'}
Lifestyle advice given: {'; '.join(session.get('lifestyle_advice') or []) or '—'}
Prescription issued at this session:
{_format_prescriptions(session.get('prescriptions'))}"""
        )

    return f"""Patient: {patient.get('name')}, {patient.get('gender') or 'unknown gender'}, \
blood group {patient.get('blood_group') or 'unknown'}.
Known allergies: {patient.get('allergies') or 'none recorded'}.
Medical history: {patient.get('medical_history') or 'none recorded'}.

This course of treatment has {len(sessions)} consultation session\
{'' if len(sessions) == 1 else 's'}, given below in chronological order.

{chr(10).join(blocks)}

Produce the consolidated record of this whole course of treatment, including the single \
final medication list, as JSON matching the required schema."""


def consolidate_case(patient, sessions):
    """Merges every session of a case into one record and one final prescription.

    Note there is no formulary argument, unlike a session summary: the final
    list may only contain medicines already prescribed during the case, which
    were themselves checked against the formulary when they were issued. Not
    passing one removes any opening for a new medicine to appear at the point
    where nobody is expecting a new clinical decision.
    """
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    client = _get_client()
    config = types.GenerateContentConfig(
        system_instruction=CONSOLIDATION_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=CONSOLIDATION_RESPONSE_SCHEMA,
    )
    return _generate_json(
        client,
        model_name,
        _build_consolidation_prompt(patient, sessions),
        config,
        "consolidating the case",
    )
