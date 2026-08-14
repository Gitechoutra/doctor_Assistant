import unittest

from portal.helpers.auth_email import normalize_login_email


class AuthEmailNormalizationTests(unittest.TestCase):
    def test_typo_domain_alias_is_normalized(self):
        self.assertEqual(
            normalize_login_email("sandeep.viswanadh@yasodhahospitas.com"),
            "sandeep.viswanadh@yasodhahospitals.com",
        )

    def test_valid_email_is_left_unchanged(self):
        self.assertEqual(
            normalize_login_email("sandeep.viswanadh@yasodhahospitals.com"),
            "sandeep.viswanadh@yasodhahospitals.com",
        )


if __name__ == "__main__":
    unittest.main()
