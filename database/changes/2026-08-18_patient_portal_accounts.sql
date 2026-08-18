-- Patient portal sign-in.
--
-- Adds the credential a patient uses to reach their own appointments. It goes
-- on `patients` rather than `users` on purpose: every staff route resolves
-- "whose list is this?" by looking for a Doctor profile and reads *no profile*
-- as the PA, who sees the practice's whole book — so a patient row in `users`
-- would have been served the entire practice by any route that never thought
-- to ask. See backend/portal/helpers/portal_auth.py.
--
-- All four columns are nullable or defaulted, so every existing patient row
-- stays valid and untouched: a patient who has never enrolled simply has no
-- credential, exactly as before.
--
--   mysql -h 127.0.0.1 -u root -p doctor < 2026-08-18_patient_portal_accounts.sql

ALTER TABLE patients
    -- The address they sign in with. Unique, and MySQL allows any number of
    -- NULLs under a unique index, so "never enrolled" costs nothing.
    ADD COLUMN portal_email VARCHAR(150) NULL,
    ADD COLUMN portal_password_hash VARCHAR(255) NULL,
    -- Lets the desk revoke access without destroying the credential, so the
    -- audit trail still reads correctly and restoring access does not need
    -- the patient to enrol again.
    ADD COLUMN portal_enabled TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN portal_last_login_at DATETIME NULL,
    ADD UNIQUE KEY uq_patients_portal_email (portal_email);

-- The sign-in lookup is by this column on every request that mints a token.
CREATE INDEX ix_patients_portal_email ON patients (portal_email);
