import { useEffect, useState } from "react";
import { HiOutlineArrowsRightLeft, HiOutlinePencilSquare } from "react-icons/hi2";
import Modal from "../Modal";
import { formatWhen } from "./NursingBadges";
import { addNursingNote, fetchNurses } from "../../services/nursingService";

const SHIFTS = ["morning", "evening", "night"];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

function NoteModal({ assignmentId, noteType, nurses, onClose, onSaved }) {
  const isHandover = noteType === "handover";
  const [form, setForm] = useState({
    content: "",
    shift: "",
    handover_to_nurse_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      await addNursingNote(assignmentId, {
        note_type: noteType,
        content: form.content,
        shift: form.shift || null,
        handover_to_nurse_id: isHandover ? form.handover_to_nurse_id || null : null,
      });
      onSaved();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isHandover ? "Shift handover" : "Nursing note"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Shift</label>
            <select className={inputClass} value={form.shift} onChange={update("shift")}>
              <option value="">Not specified</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>
          {isHandover && (
            <div>
              <label className={labelClass}>Hand over to</label>
              <select
                className={inputClass}
                value={form.handover_to_nurse_id}
                onChange={update("handover_to_nurse_id")}
              >
                <option value="">Nobody yet</option>
                {/* Name only, matching the assign-nurse picker. The shift
                    being handed over is recorded on the note itself, above —
                    it does not belong on the person's name. */}
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>
            {isHandover ? "What the next nurse needs to know *" : "Note *"}
          </label>
          <textarea
            required
            rows={5}
            className={inputClass}
            value={form.content}
            onChange={update("content")}
            placeholder={
              isHandover
                ? "Current condition, doses due, anything to watch overnight…"
                : "What happened during this round"
            }
          />
        </div>

        {isHandover && form.handover_to_nurse_id && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This also transfers the patient to that nurse — they take over the
            record from here, and this patient leaves your list.
          </p>
        )}

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : isHandover ? "Complete handover" : "Save note"}
        </button>
      </form>
    </Modal>
  );
}

export default function NotesPanel({ assignment, canRecord, onChanged }) {
  const [composing, setComposing] = useState(null); // "note" | "handover"
  const [nurses, setNurses] = useState([]);

  // Only the handover form needs the shift schedule, and only a nurse can open it.
  useEffect(() => {
    if (composing !== "handover") return;
    fetchNurses()
      .then((rows) => setNurses(rows.filter((n) => n.id !== assignment.nurse_id)))
      .catch(() => setNurses([]));
  }, [composing, assignment.nurse_id]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Nursing notes & handover</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {assignment.notes.length} entries on the record
          </p>
        </div>
        {canRecord && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setComposing("handover")}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <HiOutlineArrowsRightLeft className="h-4 w-4" />
              Handover
            </button>
            <button
              onClick={() => setComposing("note")}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlinePencilSquare className="h-4 w-4" />
              Add note
            </button>
          </div>
        )}
      </div>

      {assignment.notes.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {assignment.notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-xl border p-4 ${
                note.note_type === "handover"
                  ? "border-indigo-200 bg-indigo-50/40"
                  : "border-slate-100"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {note.note_type === "handover" ? "Shift handover" : "Nursing note"}
                  {note.shift && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-500">
                      {note.shift} shift
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {note.nurse}
                  {note.handover_to ? ` → ${note.handover_to}` : ""} ·{" "}
                  {formatWhen(note.created_at)}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {composing && (
        <NoteModal
          assignmentId={assignment.id}
          noteType={composing}
          nurses={nurses}
          onClose={() => setComposing(null)}
          onSaved={() => {
            setComposing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
