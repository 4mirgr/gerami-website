import unittest
from unittest.mock import MagicMock, patch
from live_health import CHECKS, probe


class LiveHealth(unittest.TestCase):
    def response(self, body):
        context = MagicMock()
        context.__enter__.return_value.status = 200
        context.__enter__.return_value.read.return_value = body
        return context

    def test_valid_intmed_document_does_not_require_explicit_html_tag(self):
        with patch('live_health.urlopen', return_value=self.response(b'<meta charset="utf-8"><title>IntMed</title>')):
            self.assertEqual(probe(('/intmed/', CHECKS['/intmed/'])), 'PASS production: /intmed/')

    def test_an_unrelated_success_page_is_still_rejected(self):
        with patch('live_health.urlopen', return_value=self.response(b'<html><title>Unavailable</title></html>')):
            with self.assertRaises(RuntimeError):
                probe(('/intmed/', CHECKS['/intmed/']))

    def test_aus_requires_its_mounted_application_assets(self):
        with patch('live_health.urlopen', return_value=self.response(b'<script src="/aus/assets/app.js"></script>')):
            self.assertEqual(probe(('/aus/', CHECKS['/aus/'])), 'PASS production: /aus/')


if __name__ == '__main__':
    unittest.main()
