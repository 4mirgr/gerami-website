import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from site_studio import ROOT, bake_settings


class HomeLoading(unittest.TestCase):
    def render(self, root=ROOT):
        return bake_settings(root, (root / 'index.html').read_text(), 'home')

    def snapshot(self, text):
        match = re.search(r'<script id="site-public-data" type="application/json">(.*?)</script>', text, re.S)
        self.assertIsNotNone(match, 'home must carry its own public data instead of requiring late JSON requests')
        return json.loads(match[1])

    def test_home_embeds_only_bounded_public_documents_and_theme(self):
        text = self.render()
        snapshot = self.snapshot(text)
        self.assertEqual(snapshot['version'], 1)
        expected_paths = {
            'content/appearance.json', 'content/navigation.json', 'content/pages/home.json',
            'content/site.json', 'content/topics.json', 'content/articles.json'}
        if json.loads((ROOT / 'content/articles.json').read_text())['articles']:
            expected_paths.remove('content/articles.json')
            self.assertIn('articleDelivery', snapshot)
        self.assertEqual(set(snapshot['documents']), expected_paths)
        for path, data in snapshot['documents'].items():
            expected = json.loads((ROOT / path).read_text())
            if path == 'content/site.json': expected['cv'] = []
            self.assertEqual(data, expected)
        self.assertLessEqual(len(json.dumps(snapshot, ensure_ascii=False).encode()), 65536)
        self.assertIn('<script id="site-theme-bootstrap">', text)
        self.assertNotRegex(text, r'<script[^>]+src="(?:/)?js/theme\.js')
        self.assertIn((ROOT / 'js/theme.js').read_text(), text)

    def test_snapshot_escapes_script_breakout_and_preserves_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('content', 'js'):
                shutil.copytree(ROOT / name, root / name)
            shutil.copy2(ROOT / 'index.html', root / 'index.html')
            path = root / 'content/site.json'
            value = json.loads(path.read_text())
            value['bio_fa'] = '</script><script>window.pwned=true</script>&\u2028'
            path.write_text(json.dumps(value, ensure_ascii=False))
            before = {str(p): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            text = self.render(root)
            self.assertEqual(self.snapshot(text)['documents']['content/site.json'], {**value, 'cv': []})
            self.assertNotIn('<script>window.pwned=true</script>', text)
            self.assertEqual(before, {str(p): p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_inner_pages_embed_only_their_own_public_documents(self):
        for ident in ('about', 'blog', 'appointments', 'projects'):
            with self.subTest(page=ident):
                text = bake_settings(ROOT, (ROOT / 'pages' / (ident + '.html')).read_text(), ident)
                documents = self.snapshot(text)['documents']
                expected = {'content/appearance.json', 'content/navigation.json', 'content/site.json', 'content/pages/' + ident + '.json'}
                if ident == 'blog':
                    expected.add('content/topics.json')
                    if not json.loads((ROOT / 'content/articles.json').read_text())['articles']:
                        expected.add('content/articles.json')
                self.assertEqual(set(documents), expected)
                self.assertIn('<script id="site-theme-bootstrap">', text)
                self.assertNotRegex(text, r'<script[^>]+src="[^"]*js/theme\.js')

    def test_large_article_feed_falls_back_without_bloating_html(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('content', 'js'):
                shutil.copytree(ROOT / name, root / name)
            shutil.copy2(ROOT / 'index.html', root / 'index.html')
            (root / 'content/articles.json').write_text(json.dumps({'articles': [{'body_fa': 'ا' * 100000}]}))
            snapshot = self.snapshot(self.render(root))
            self.assertNotIn('content/articles.json', snapshot['documents'])
            self.assertIn('content/topics.json', snapshot['documents'])


if __name__ == '__main__':
    unittest.main()
