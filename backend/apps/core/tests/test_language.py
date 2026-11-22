from django.test import RequestFactory, SimpleTestCase

from apps.core.language import resolve_language


class ResolveLanguageTests(SimpleTestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def lang(self, query="", header=None):
        extra = {"HTTP_ACCEPT_LANGUAGE": header} if header is not None else {}
        return resolve_language(self.rf.get(f"/api/v1/landmarks/{query}", **extra))

    def test_default_is_tajik(self):
        self.assertEqual(self.lang(), "tg")

    def test_query_parameter_wins(self):
        self.assertEqual(self.lang("?lang=ru", "en-US,en;q=0.9"), "ru")
        self.assertEqual(self.lang("?lang=EN"), "en")

    def test_unsupported_query_falls_back_to_header(self):
        self.assertEqual(self.lang("?lang=de", "ru-RU"), "ru")

    def test_header_quality_order(self):
        self.assertEqual(self.lang(header="de;q=1, en;q=0.5, ru;q=0.8"), "ru")
        self.assertEqual(self.lang(header="en-GB,en;q=0.9"), "en")

    def test_header_q_zero_is_ignored(self):
        self.assertEqual(self.lang(header="en;q=0, fr"), "tg")
