"""Check deploy-time cache identities, relocation and protected app boundaries."""
import hashlib
import base64
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from public_assets import optimize_public_assets
from site_studio import ROOT, bake_settings


class PublicAssets(unittest.TestCase):
    def stage(self, folder):
        site = Path(folder)
        for name in ('js', 'css', 'assets', 'pages', 'content', 'admin', 'functions'):
            shutil.copytree(ROOT / name, site / name)
        shutil.copy2(ROOT / 'index.html', site / 'index.html')
        for page in [site / 'index.html', *sorted((site / 'pages').glob('*.html'))]:
            if page.name == 'studio-preview.html':
                continue
            page.write_text(bake_settings(site, page.read_text(), 'home' if page.name == 'index.html' else page.stem))
        (site / '_headers').write_text('/admin/*\n  Cache-Control: no-cache\n/js/*\n  Cache-Control: no-cache\n')
        return site

    def test_cache_identity_and_relocated_dependency_graph(self):
        with tempfile.TemporaryDirectory() as folder:
            site = self.stage(folder)
            protected = {str(p.relative_to(site)): p.read_bytes() for directory in ('admin', 'functions') for p in (site / directory).rglob('*') if p.is_file()}
            report = optimize_public_assets(site)
            for path in (site / 'assets/runtime').iterdir():
                self.assertEqual(path.name.split('.')[-2], hashlib.sha256(path.read_bytes()).hexdigest()[:16])
                if path.suffix in ('.js', '.mjs'):
                    self.assertNotRegex(path.read_text(), r"(?:from\s*|import\s*)['\"]\.")
                    for url in re.findall(r"(?:from\s*|import\s*)['\"](/assets/runtime/[^'\"]+)", path.read_text()):
                        self.assertTrue((site / url.lstrip('/')).is_file())
            model = next((site / 'assets/runtime').glob('site-model.*.mjs')).read_text()
            self.assertIn("new URL('/'+path,import.meta.url)", model)
            css = next((site / 'assets/runtime').glob('glass.*.css')).read_text()
            self.assertNotIn('material-controls.png', css)
            self.assertIn('/assets/optimized/material-controls.', css)
            for page in [site / 'index.html', *sorted((site / 'pages').glob('*.html'))]:
                text = page.read_text()
                self.assertNotRegex(text, r'(?:src|href)="(?:\.\./|/)?(?:js|css)/')
                self.assertTrue('id="site-public-runtime"' in text)
                self.assertNotRegex(text, r'<script\b[^>]*\bsrc=')
                self.assertNotRegex(text, r'<link\b[^>]*\brel="modulepreload"')
                self.assertNotRegex(text, r'<link\b[^>]*rel="stylesheet"')
                import json
                embedded = json.loads(re.search(r'<script id="site-embedded-assets" type="application/json">(.*?)</script>', text, re.S)[1])
                for path, uri in embedded.items():
                    self.assertEqual(base64.b64decode(uri.split(',',1)[1]), (site/path.lstrip('/')).read_bytes())
                styles = re.findall(r'<style data-public-stylesheet="([^"]+)">(.*?)</style>', text, re.S)
                self.assertEqual(len(styles), 3)
                for url, css_text in styles:
                    for path in embedded:
                        variable='--site-media-'+hashlib.sha256(path.encode()).hexdigest()[:12]
                        css_text=css_text.replace('var('+variable+',none)','url("'+path+'")')
                    font=next((site/'assets/runtime').glob('Vazirmatn.*.woff2'))
                    def font_url(match):
                        self.assertEqual(base64.b64decode(match[1]),font.read_bytes())
                        return 'url("/assets/runtime/'+font.name+'")'
                    css_text=re.sub(r'url\("data:font/woff2;base64,([^"]+)"\)',font_url,css_text)
                    self.assertTrue(css_text==(site/url.lstrip('/')).read_text(),'inline cascade must retain exact source rules after restoring embedded URLs')
                for url in re.findall(r'(?:src|href)="(/assets/(?:runtime|optimized)/[^"?]+)', text):
                    self.assertTrue((site / url.lstrip('/')).is_file(), url)
            self.assertEqual(protected, {name: (site / name).read_bytes() for name in protected})
            self.assertIn('/admin/*\n  Cache-Control: no-cache', (site / '_headers').read_text())
            self.assertLess(sum(row['optimized'] for row in report['images'].values()), 100000)
            self.assertFalse((site / 'assets/optimized/manifest.json').exists())
            self.assertEqual(report['render_blocking_stylesheets'], 0)
            self.assertLessEqual(report['inline_css_max_bytes'], 98304)

    def test_style_breakout_or_import_cannot_enter_the_inline_document(self):
        for unsafe in ('/* </style><script>alert(1)</script> */', '@import url("https://example.com/a.css");'):
            with self.subTest(css=unsafe), tempfile.TemporaryDirectory() as folder:
                site = self.stage(folder)
                with (site / 'css/style.css').open('a') as handle:
                    handle.write(unsafe)
                with self.assertRaisesRegex(ValueError, 'reviewed safe inline adapter'):
                    optimize_public_assets(site)

    def test_public_runtime_rejects_unreviewed_module_or_script_breakout(self):
        for file,code in [('js/main.js','\nconst unsafe="</script>";'),('js/site-model.mjs','\nexport default 1;')]:
            with self.subTest(file=file), tempfile.TemporaryDirectory() as folder:
                site=self.stage(folder)
                with (site/file).open('a') as handle:handle.write(code)
                with self.assertRaisesRegex(ValueError,'review|Review'):
                    optimize_public_assets(site)

    def test_external_published_image_is_not_read_as_a_local_file(self):
        with tempfile.TemporaryDirectory() as folder:
            site=self.stage(folder)
            page=site/'index.html'
            remote='https://example.test/assets/identity/logo-day.webp'
            page.write_text(page.read_text().replace('</main>','<img src="'+remote+'"></main>'))
            optimize_public_assets(site)
            self.assertTrue('<img src="'+remote+'">' in page.read_text())

    def test_changed_dependency_changes_all_importer_cache_identities(self):
        with tempfile.TemporaryDirectory() as before, tempfile.TemporaryDirectory() as after:
            a, b = self.stage(before), self.stage(after)
            with (b / 'js/topics.mjs').open('a') as handle:
                handle.write('\n// changed dependency\n')
            optimize_public_assets(a)
            optimize_public_assets(b)
            for name in ('topics', 'site-model', 'rich-text', 'site-customizer', 'content'):
                self.assertNotEqual(next((a / 'assets/runtime').glob(name + '.*')).name, next((b / 'assets/runtime').glob(name + '.*')).name)


if __name__ == '__main__':
    unittest.main()
