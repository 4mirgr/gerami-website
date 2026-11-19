import unittest
from unittest.mock import MagicMock, patch
from live_health import CHECKS, probe, probe_admin
from urllib.error import HTTPError
from io import BytesIO


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

    def test_home_health_accepts_fingerprinted_assets_and_requires_public_snapshot(self):
        with patch('live_health.urlopen', return_value=self.response(b'<link href="/assets/runtime/glass.0123456789abcdef.css"><script id="site-public-data" type="application/json">{}</script>')):
            self.assertEqual(probe(('/', CHECKS['/'])), 'PASS production: /')
        with patch('live_health.urlopen', return_value=self.response(b'<html><title>Unavailable</title></html>')):
            with self.assertRaises(RuntimeError):
                probe(('/', CHECKS['/']))

    def test_aus_requires_its_mounted_application_assets(self):
        with patch('live_health.urlopen', return_value=self.response(b'<script src="/aus/assets/app.js"></script>')):
            self.assertEqual(probe(('/aus/', CHECKS['/aus/'])), 'PASS production: /aus/')

    def test_admin_health_accepts_only_the_local_login_gate(self):
        redirect=HTTPError('https://drgerami-md.ir/admin/',302,'redirect',{'Location':'/pages/account.html?next=%2Fadmin%2F'},BytesIO())
        with patch('live_health.build_opener') as opener:
            opener.return_value.open.side_effect=redirect
            self.assertIn('require authentication',probe_admin('/admin/'))

    def test_public_admin_shell_or_external_login_redirect_fails_health(self):
        with patch('live_health.build_opener') as opener:
            opener.return_value.open.return_value=self.response(b'private-editor-document')
            with self.assertRaises(RuntimeError):probe_admin('/admin/')
            for target in ['https://evil.test/admin/login.html','http://drgerami-md.ir/admin/login.html','javascript:/admin/login.html','https://user@drgerami-md.ir/admin/login.html']:
                opener.return_value.open.side_effect=HTTPError('https://drgerami-md.ir/admin/',302,'redirect',{'Location':target},BytesIO())
                with self.assertRaises(RuntimeError):probe_admin('/admin/')


if __name__ == '__main__':
    unittest.main()
