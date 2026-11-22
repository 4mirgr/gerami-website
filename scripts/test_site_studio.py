import json
import shutil
import tempfile
import unittest
from pathlib import Path
from site_studio import ROOT, generate, bake_settings


class SiteStudioBuild(unittest.TestCase):
    def test_public_profile_is_baked_and_escaped_without_waiting_for_javascript(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copytree(ROOT / 'content', root / 'content')
            profile = json.loads((root / 'content/site.json').read_text())
            profile['bio_fa'] = 'معرفی واقعی <script>bad()</script>'
            profile['cv'] = [{'title_fa': 'آموزش بالینی', 'title_en': 'Clinical training', 'detail_fa': 'شرح مستند <img onerror=bad()>', 'detail_en': 'Documented training'}]
            (root / 'content/site.json').write_text(json.dumps(profile))
            template = '<html><head></head><body><main><section data-profile-host></section></main></body></html>'
            page = bake_settings(root, template, 'about')
            self.assertIn('class="career-entry"', page)
            self.assertIn('معرفی واقعی &lt;script&gt;bad()&lt;/script&gt;', page)
            self.assertIn('شرح مستند &lt;img onerror=bad()&gt;', page)
            self.assertIn('data-en="Clinical training"', page)
            self.assertNotIn('<img onerror=bad()>', page)

    def test_static_edits_custom_pages_and_escaping_leave_sources_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'source'
            output = Path(temp) / 'output'
            for target in (root, output):
                target.mkdir()
                shutil.copytree(ROOT / 'content', target / 'content')
                shutil.copytree(ROOT / 'pages', target / 'pages')
                shutil.copy2(ROOT / 'index.html', target / 'index.html')
            taxonomy = root / 'backend/editorial/functions/gerami-editorial/taxonomy.json'
            taxonomy.parent.mkdir(parents=True)
            shutil.copy2(ROOT / 'backend/editorial/functions/gerami-editorial/taxonomy.json', taxonomy)
            path = root / 'content/pages/home.json'
            data = json.loads(path.read_text())
            data['blocks']['text-001']['fa'] = 'عنوان <script>bad()</script> \\g<1>'
            path.write_text(json.dumps(data))
            extra = {'pages': [dict(slug='test-page', published=True, title_fa='<img onerror=bad()>', title_en='Safe', description_fa='" > <script>', description_en='', body_fa='**Test**\n<script>alert(1)</script>', body_en='Safe', image='')]}
            (root / 'content/extra-pages.json').write_text(json.dumps(extra))
            original = (root / 'index.html').read_bytes()
            generate(root, output)
            self.assertEqual((root / 'index.html').read_bytes(), original)
            html = (output / 'index.html').read_text()
            self.assertIn('&lt;script&gt;bad()&lt;/script&gt;', html)
            self.assertIn('\\g&lt;1&gt;', html)
            self.assertIn('href="https://drgerami-md.ir/intmed/"', html)
            custom = (output / 'pages/test-page.html').read_text()
            self.assertIn('&lt;img onerror=bad()&gt;', custom)
            self.assertNotIn('<script>alert(1)</script>', custom)
            self.assertIn('data-extra-page="test-page"', custom)
            self.assertIn('noindex,nofollow', (output / 'pages/studio-preview.html').read_text())
            self.assertIn('id="site-settings"', html)


if __name__ == '__main__':
    unittest.main()
