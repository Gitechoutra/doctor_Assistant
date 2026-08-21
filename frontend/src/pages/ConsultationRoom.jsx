import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineMicrophone,
  HiOutlineStop,
  HiArrowLeft,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentList,
  HiOutlineFolderOpen,
} from "react-icons/hi2";
import ConversationTurns, { TranscriptCaveat } from "../components/ConversationTurns";
import PatientInfoPanel from "../components/PatientInfoPanel";
import SummaryPanel from "../components/SummaryPanel";
import AiSafetyNote from "../components/AiSafetyNote";
import CaseSessionCard from "../components/CaseSessionCard";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  continueConsultation,
  endConsultation,
  fetchConsultation,
  startConsultation,
  transcribeTurn,
} from "../services/consultationService";
import { getSocket, joinConsultationRoom } from "../services/socket";

/**
 * One recorded take.
 *
 * A take is a whole stretch of conversation — the doctor presses the mic once
 * and speaks with the patient until they press stop — so as a single block it
 * arrives as a paragraph with both people's words run together. The server
 * splits it back into turns (`message.turns`), which is what gets drawn here.
 *
 * The unsplit paragraph is the fallback, not the intent: it appears for takes
 * recorded before the split existed, and for the ones where it failed or came
 * back doubtful. Everything that was said is in `message.message` either way,
 * so a take that cannot be laid out is still shown in full rather than hidden.
 */
function TranscriptLine({ message }) {
  if (message.turns?.length) {
    return <ConversationTurns turns={message.turns} />;
  }
  return (
    <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
      {message.message}
    </div>
  );
}

export default function ConsultationRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isStartingNext, setIsStartingNext] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [confirmingNextSession, setConfirmingNextSession] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Live input level, so "is it actually hearing the patient?" is answerable
  // while the consultation is happening rather than after it, when the only
  // evidence left is a transcript with half the conversation missing.
  const [micLevel, setMicLevel] = useState(0);
  const [micTooQuiet, setMicTooQuiet] = useState(false);
  const audioCtxRef = useRef(null);
  const meterTimerRef = useRef(null);
  const peakRef = useRef(0);

  function addMessageIfNew(message) {
    setConsultation((c) => {
      if (!c) return c;
      if (c.messages.some((m) => m.id === message.id)) return c;
      return { ...c, messages: [...c.messages, message] };
    });
  }

  useEffect(() => {
    fetchConsultation(id)
      .then(setConsultation)
      // A consultation that has been deleted, or an id typed by hand, answers
      // 404. Without this the rejection escapes as an unhandled promise error
      // in the console; the render below already copes with a null
      // consultation, so swallowing it here is what makes that path show.
      .catch(() => setConsultation(null))
      .finally(() => setLoading(false));

    joinConsultationRoom(id);
    const socket = getSocket();
    const onNewMessage = (msg) => addMessageIfNew(msg);
    const onCompleted = (data) => setConsultation(data);
    // Reopened from another device or tab — this one has to drop back out of
    // the completed view or it would keep showing a summary that is about to
    // be regenerated.
    const onResumed = (data) => setConsultation(data);
    socket.on("new_message", onNewMessage);
    socket.on("consultation_completed", onCompleted);
    socket.on("consultation_resumed", onResumed);

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("consultation_completed", onCompleted);
      socket.off("consultation_resumed", onResumed);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null; // leaving the page cancels any in-flight segment
        recorderRef.current.stop();
      }
      // Cancelling onstop above also skips its teardown, so the meter's
      // AudioContext has to be closed here or it outlives the page.
      if (meterTimerRef.current) window.clearInterval(meterTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Drives the input-level bar shown while recording.
   *
   * Purely diagnostic — it taps the same stream the recorder is using and
   * changes nothing about what gets captured. The point is that a mic that is
   * muted, pointing away, or set to the wrong device looks identical to a
   * quiet room until the transcript comes back empty; this makes the
   * difference visible in the moment.
   */
  function startLevelMeter(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = ctx;
    peakRef.current = 0;
    setMicTooQuiet(false);

    const samples = new Float32Array(analyser.fftSize);
    // Sampled on a timer rather than per animation frame: ten updates a
    // second is more than the eye needs, and it keeps this off React's
    // render-per-frame path.
    meterTimerRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sumOfSquares = 0;
      for (let i = 0; i < samples.length; i += 1) sumOfSquares += samples[i] * samples[i];
      const rms = Math.sqrt(sumOfSquares / samples.length);

      // Mapped on a dB scale, not linearly: speech across a desk sits around
      // -35 dBFS, which on a linear bar is a sliver indistinguishable from
      // silence.
      const dbfs = 20 * Math.log10(rms || 1e-8);
      const level = Math.min(1, Math.max(0, (dbfs + 60) / 60));
      setMicLevel(level);

      peakRef.current = Math.max(peakRef.current, level);
      // Only after a few seconds — the first moments of a recording are
      // usually silence while people settle, and warning then is noise.
      if (ctx.currentTime > 4) setMicTooQuiet(peakRef.current < 0.25);
    }, 100);
  }

  function stopLevelMeter() {
    if (meterTimerRef.current) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
    setMicTooQuiet(false);
  }

  // One MediaRecorder runs for as long as the doctor leaves the mic on —
  // no auto-chopping into fixed-length chunks. Short, arbitrarily-cut clips
  // are exactly what makes Whisper hallucinate ("Hi Gemini, how can I help
  // you today?"); a single take of real speech transcribes far more
  // reliably, and Gemini reconstructs who-said-what from the full text at
  // end_consultation anyway, so nothing is lost by not tagging speakers live.
  async function startRecording() {
    setErrorMsg("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Spelled out rather than left as `audio: true`. The defaults vary by
        // browser and by device, and the one that matters here is
        // autoGainControl: with it off, a patient sitting back from the laptop
        // records 20-30 dB below the doctor leaning towards it, and the quiet
        // half of the conversation is what goes missing from the transcript.
        // echoCancellation is off deliberately — nothing is being played back
        // for it to cancel, and it is tuned to duck the far end of a call,
        // which is exactly the distant speaker we are trying to keep.
        audio: {
          channelCount: 1,
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: false,
        },
      });
    } catch (err) {
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? "The browser blocked access to the microphone. Allow it for this site, then press the mic again."
          : "No microphone could be opened. Check that one is connected and selected, then try again."
      );
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    startLevelMeter(stream);

    // A higher bitrate than the browser's default for the hop to our own
    // server, which is on the same network. The backend levels the audio and
    // re-encodes it small before it goes anywhere near the internet, so
    // nothing is gained by starving the capture of detail here.
    const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  // Stops the recorder and transcribes the whole take as one clip. Returns
  // a promise so callers (End Consultation) can wait for the last bit of
  // audio to land before generating the summary.
  function stopRecording() {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.onstop = async () => {
        stopLevelMeter();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size > 0) {
          setIsProcessing(true);
          try {
            const message = await transcribeTurn(id, "unknown", blob);
            addMessageIfNew(message);
          } catch (err) {
            setErrorMsg(err.response?.data?.message || "Could not transcribe that recording.");
          } finally {
            setIsProcessing(false);
          }
        }
        resolve();
      };
      recorder.stop();
    });
  }

  async function handleEndConsultation() {
    await stopRecording();
    setIsEnding(true);
    setErrorMsg("");
    try {
      const result = await endConsultation(id);
      setConsultation(result);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not end this consultation.");
    } finally {
      setIsEnding(false);
    }
  }

  /**
   * Carries on with THIS consultation after it was ended.
   *
   * The patient is still in the room, so what they say next belongs to the
   * visit already under way — recording reopens on the same transcript, and
   * ending again rewrites this session's summary and prescription over the
   * whole conversation. No new session is created.
   */
  async function handleContinue() {
    setIsContinuing(true);
    setErrorMsg("");
    try {
      setConsultation(await continueConsultation(id));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not reopen this consultation.");
    } finally {
      setIsContinuing(false);
    }
  }

  /**
   * Begins the next session of this same course of treatment — for a patient
   * returning on a later day.
   *
   * This creates a *new* consultation on the same case and navigates to it —
   * the session on screen keeps its transcript, summary and prescription
   * exactly as they are. Nothing here writes back to the finished session.
   */
  async function handleStartNextSession() {
    setIsStartingNext(true);
    setErrorMsg("");
    try {
      const next = await startConsultation(consultation.patient_id);
      navigate(`/dashboard/consultations/${next.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start the next session.");
      setIsStartingNext(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (!consultation) {
    return <p className="text-sm text-slate-400">Consultation not found.</p>;
  }

  const isCompleted = consultation.status === "completed";
  // Only the doctor this consultation belongs to can record or end it —
  // enforced server-side too, this just keeps the UI from offering controls
  // that would 403 (the PA can read this page, but not act on it).
  const canManage = Boolean(consultation.can_manage);

  const caseInfo = consultation.case;
  const sessionNumber = consultation.session_number;
  const previousSessions = consultation.previous_sessions || [];
  const latestPrevious = previousSessions[previousSessions.length - 1];
  // Only worth showing once a case actually has more than one session —
  // "Session 1 of 1" is noise on a routine single-visit consultation.
  const showSessionLabel = Boolean(caseInfo && sessionNumber && caseInfo.session_count > 1);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate("/dashboard/consultations")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <HiArrowLeft className="h-4 w-4" />
            Back to consultations
          </button>

          {showSessionLabel && (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              Session {sessionNumber} of {caseInfo.session_count}
            </span>
          )}

          {caseInfo && (
            <Link
              to={`/dashboard/cases/${caseInfo.id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-700"
            >
              <HiOutlineFolderOpen className="h-4 w-4" />
              View full case
            </Link>
          )}
        </div>

        {!isCompleted && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live Consultation
            </span>
            {canManage ? (
              <button
                onClick={handleEndConsultation}
                disabled={isEnding || isProcessing}
                className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {isEnding ? "Generating summary…" : isProcessing ? "Wrapping up…" : "End Consultation"}
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                View only
              </span>
            )}
          </div>
        )}

        {isCompleted && canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Exactly one of these two, decided by the server from the date:
                the patient is still here (carry on with this same
                conversation) or they have come back another day (a new
                session). Offering both would invite one visit to be split
                across two records. */}
            {consultation.can_continue ? (
              <button
                onClick={handleContinue}
                disabled={isContinuing}
                title="The patient has more to say — reopen recording on this same consultation"
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
              >
                <HiOutlineMicrophone className="h-4 w-4" />
                {isContinuing ? "Reopening…" : "Continue consultation"}
              </button>
            ) : consultation.continue_blocked_by_verification ? (
              // Continuing rewrites the prescription, so a signed one has to
              // be unlocked first — say so here rather than letting the
              // button 409.
              <span
                title="Unlock the prescription below to add more to this consultation"
                className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
              >
                Unlock the prescription to continue this consultation
              </span>
            ) : (
              caseInfo?.status === "open" && (
                <button
                  onClick={() => setConfirmingNextSession(true)}
                  disabled={isStartingNext}
                  title="The patient has returned on a later day — record a new session on this case"
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                >
                  <HiOutlineMicrophone className="h-4 w-4" />
                  {isStartingNext ? "Starting…" : "Start next session"}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {/* Page level, not inside the recorder card: this frames the whole
          consultation - the recording, the draft it produces and the medicines
          suggested from it - so it sits above all of them rather than in the
          panel for one. Below the header, so "End Consultation" stays the first
          thing in reach. */}
      {!isCompleted && <AiSafetyNote className="mb-6" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <PatientInfoPanel patient={consultation.patient_detail} />

        <div className="space-y-6">
          {/* What happened on this patient's earlier visits, read-only and
              collapsed by default. A doctor recording a follow-up needs last
              time's conversation, diagnosis and medicines in front of them,
              and should not have to leave the room to get them. */}
          {previousSessions.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <button
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <HiOutlineClipboardDocumentList className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-semibold text-slate-900">
                    Previous history — {previousSessions.length} earlier session
                    {previousSessions.length === 1 ? "" : "s"}
                  </span>
                  {latestPrevious?.summary?.possible_diagnosis && !showHistory && (
                    <span className="hidden truncate text-sm text-slate-400 sm:inline">
                      · last seen{" "}
                      {latestPrevious.ended_at
                        ? new Date(latestPrevious.ended_at).toLocaleDateString()
                        : "previously"}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500">
                  {showHistory ? "Hide" : "Show"}
                  <HiOutlineChevronDown
                    className={`h-4 w-4 transition ${showHistory ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {showHistory && (
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                  {previousSessions.map((session) => (
                    <CaseSessionCard key={session.id} session={session} />
                  ))}
                </div>
              )}
            </div>
          )}

          {!isCompleted && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="max-h-[420px] space-y-3 overflow-y-auto pb-2">
                {consultation.messages.length === 0 && !isProcessing ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {canManage
                      ? "Nothing recorded yet. Press the mic, have the whole consultation normally, then press stop — the AI will sort out who said what."
                      : "Nothing recorded yet."}
                  </p>
                ) : (
                  <>
                    {/* Said once, above the conversation, rather than on every
                        turn: the speakers were worked out from the recording,
                        not tagged while it was made. */}
                    {consultation.messages.some((m) => m.turns?.length > 0) && (
                      <TranscriptCaveat className="pb-1 text-center" />
                    )}
                    {consultation.messages.map((m) => (
                      <TranscriptLine key={m.id} message={m} />
                    ))}
                  </>
                )}
                {isProcessing && (
                  <p className="py-2 text-center text-sm text-slate-400">
                    Listening back and writing up the conversation…
                  </p>
                )}
              </div>

              {canManage ? (
                <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-400">
                    {isProcessing
                      ? "Processing what was just recorded…"
                      : isRecording
                        ? "Recording… just talk normally, the AI will sort out who said what."
                        : "Press the mic, have the whole consultation, then press stop."}
                  </p>

                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={`grid h-14 w-14 place-items-center rounded-full text-white shadow-lg transition disabled:opacity-60 ${
                      isRecording
                        ? "animate-pulse bg-red-500 shadow-red-500/40"
                        : "bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-500/40"
                    }`}
                  >
                    {isRecording ? (
                      <HiOutlineStop className="h-6 w-6" />
                    ) : (
                      <HiOutlineMicrophone className="h-6 w-6" />
                    )}
                  </button>

                  {/* What the microphone is hearing, right now. A doctor can
                      see from this whether the patient is reaching it at all,
                      and move the laptop while it still matters — rather than
                      finding out from a transcript that stops halfway. */}
                  {isRecording && (
                    <div className="w-full max-w-xs">
                      <div
                        role="meter"
                        aria-label="Microphone input level"
                        aria-valuenow={Math.round(micLevel * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-100 ${
                            micLevel < 0.25 ? "bg-amber-400" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.round(micLevel * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-center text-xs text-slate-400">
                        {micTooQuiet
                          ? "Barely picking anything up — move the microphone closer, or ask everyone to speak up."
                          : "Microphone level"}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 border-t border-slate-100 pt-4 text-center text-sm text-slate-400">
                  Only {consultation.doctor} can record or end this consultation.
                </p>
              )}
            </div>
          )}

          {isCompleted && (
            <SummaryPanel
              summary={consultation.summary}
              prescriptions={consultation.prescriptions}
              consultationId={consultation.id}
              patientName={consultation.patient}
              verified={consultation.prescription_verified}
              verifiedBy={consultation.prescription_verified_by}
              verifiedAt={consultation.prescription_verified_at}
              canManage={canManage}
              // Verifying or editing returns the whole updated consultation,
              // so the panel re-renders from the server's copy.
              onConsultationUpdated={setConsultation}
            />
          )}

          {/* The bridge from "this visit is documented" to "this treatment is
              documented" — the consolidated report lives on the case, not
              here, and a doctor finishing a session needs to know that. */}
          {isCompleted && caseInfo && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
              <p className="text-sm font-medium text-slate-700">
                {caseInfo.status === "open"
                  ? "This session is part of an ongoing course of treatment."
                  : "This session is part of a closed course of treatment."}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {caseInfo.status === "open"
                  ? "The summary and prescription above cover this session only. When the patient's treatment is finished, end it on the case to get one report covering every session with a single final prescription."
                  : "The consolidated report covering every session is on the case."}
              </p>
              <Link
                to={`/dashboard/cases/${caseInfo.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                <HiOutlineFolderOpen className="h-4 w-4" />
                Open case {caseInfo.code} ({caseInfo.session_count} session
                {caseInfo.session_count === 1 ? "" : "s"}) →
              </Link>
            </div>
          )}
        </div>
      </div>

      {confirmingNextSession && (
        <ConfirmDialog
          title="Start a new session?"
          message={
            "A new session is for a visit on a different day — it gets its own summary and " +
            "prescription, and this one stays exactly as it is. If the patient is still with " +
            "you and simply has more to say, close this and continue the current consultation " +
            "instead so today's visit stays one record."
          }
          confirmLabel="Start new session"
          cancelLabel="Cancel"
          busy={isStartingNext}
          onCancel={() => setConfirmingNextSession(false)}
          onConfirm={() => {
            setConfirmingNextSession(false);
            handleStartNextSession();
          }}
        />
      )}
    </div>
  );
}
