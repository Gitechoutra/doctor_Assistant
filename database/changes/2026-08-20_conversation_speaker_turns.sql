-- The recorded take, laid out as the conversation it was.
--
-- A consultation is captured as one continuous recording and transcribed as
-- one block of prose, which is what the doctor then had to read on screen:
-- a wall of text with no indication of who said which half of it. This column
-- holds the same take split into speaker turns --
-- [{"speaker": "doctor"|"patient", "text": "..."}, ...] -- so the transcript
-- reads as a conversation while the visit is still happening.
--
-- Presentational only, and deliberately additive. `message` is untouched and
-- remains the verbatim record of the take. It is still the only thing the
-- end-of-consultation summary, the assistive diagnosis and the prescription
-- are generated from -- nothing clinical reads this column.
--
-- NULL means "no split available" -- either the consultation predates this
-- column, or the split failed or came back doubtful and was discarded. The UI
-- falls back to showing `message` as one block, exactly as before.
--
-- Safe to apply to a database that has rows: one new nullable column, and
-- every existing message keeps rendering the way it always did.
--
--   mysql -h 127.0.0.1 -u root -p doctor < 2026-08-20_conversation_speaker_turns.sql

ALTER TABLE `conversation_messages`
  ADD COLUMN `speaker_turns` text COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `message`;
