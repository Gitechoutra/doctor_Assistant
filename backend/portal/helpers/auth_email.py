def normalize_login_email(email):
    """Normalize login emails for known aliases and common typos.

    The app previously seeded doctor accounts under the domain
    ``yasodhahospitals.com`` but some users still try the slightly misspelled
    ``yasodhahospitas.com``. We accept that alias on login so a valid account
    can still be found without changing the stored email.
    """
    if not email:
        return email

    lowered = email.strip().lower()
    if lowered.endswith("@yasodhahospitas.com"):
        return lowered.replace("@yasodhahospitas.com", "@yasodhahospitals.com")
    return lowered
