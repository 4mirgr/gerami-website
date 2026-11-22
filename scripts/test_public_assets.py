"""Check deploy-time cache identities, relocation and protected app boundaries."""
import base64
import hashlib
import json
import re
import shutil
import tempfile
import unittest
import gzip
from pathlib import Path

from public_assets import optimize_public_assets
from asset_check import build_asset_check
from public_asset_recovery import add_public_asset_recovery, public_mirrors
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

    def test_six_approved_covers_have_bounded_previews_and_unchanged_originals(self):
        import io, random
        from PIL import Image
        with tempfile.TemporaryDirectory() as folder:
            site = self.stage(folder)
            uploads = site / 'assets/uploads'; uploads.mkdir(exist_ok=True)
            data = {'articles': []}
            originals = {}
            for i in range(6):
                image = Image.frombytes('RGB', (1200, 800), random.Random(i).randbytes(1200 * 800 * 3))
                encoded = io.BytesIO(); image.save(encoded, 'JPEG', quality=88)
                raw = encoded.getvalue(); source = '/assets/uploads/editorial-' + hashlib.sha256(raw).hexdigest() + '.jpg'
                (site / source.lstrip('/')).write_bytes(raw); originals[source] = raw
                data['articles'].append({'slug': 'synthetic-cover-' + str(i), 'status': 'published', 'image': source})
            (site / 'content/articles.json').write_text(json.dumps(data))
            optimize_public_assets(site)
            previews = list((site / 'assets/optimized').glob('post-*.webp'))
            self.assertEqual(len(previews), 6, 'Published cards must not request full-size originals')
            self.assertLessEqual(sum(p.stat().st_size for p in previews), 60000)
            for p in previews:
                with Image.open(p) as im:
                    self.assertLessEqual(max(im.size), 480)
                    self.assertAlmostEqual(im.width / im.height, 1.5, places=1)
            runtime = next((site / 'assets/runtime').glob('content.*.js')).read_text()
            for source, original in originals.items():
                self.assertEqual((site / source.lstrip('/')).read_bytes(), original)
                self.assertIn(source, runtime)
            self.assertIn('/assets/optimized/post-', runtime)

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
            self.assertNotRegex(css, r'url\([\'\"]?/assets/', 'CSS art downloads must be managed and cancellable')
            for page in [site / 'index.html', *sorted((site / 'pages').glob('*.html'))]:
                text = page.read_text()
                self.assertNotRegex(text, r'(?:src|href)="(?:\.\./|/)?(?:js|css)/')
                self.assertIn('rel="modulepreload"', text)
                self.assertNotRegex(text, r'<link\b[^>]*rel="stylesheet"')
                styles = re.findall(r'<style data-public-stylesheet="([^"]+)">(.*?)</style>', text, re.S)
                self.assertEqual(len(styles), 4 if page.name in ('account.html','about.html','blog.html','projects.html') else 3)
                for url, css_text in styles:
                    self.assertEqual(css_text, (site / url.lstrip('/')).read_text(), 'inline cascade must match the exact emitted stylesheet')
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

    def test_comment_compaction_preserves_rules_between_comments(self):
        with tempfile.TemporaryDirectory() as folder:
            site = self.stage(folder)
            rule = '/* lead */ .must-survive { color:red; --label:"a ; { b"; width:calc(100% - 12px) } /* tail */\n'
            with (site / 'css/glass.css').open('a') as handle:
                handle.write('\n' + rule)
            optimize_public_assets(site)
            text = (site / 'index.html').read_text()
            self.assertRegex(text, r'\.must-survive\s*\{\s*color:\s*red[;} ]')
            self.assertIn('"a ; { b"', text)
            self.assertIn('calc(100% - 12px)', text)

    def test_changed_dependency_changes_all_importer_cache_identities(self):
        with tempfile.TemporaryDirectory() as before, tempfile.TemporaryDirectory() as after:
            a, b = self.stage(before), self.stage(after)
            with (b / 'js/topics.mjs').open('a') as handle:
                handle.write('\n// changed dependency\n')
            optimize_public_assets(a)
            optimize_public_assets(b)
            for name in ('topics', 'site-model', 'rich-text', 'site-customizer', 'content'):
                self.assertNotEqual(next((a / 'assets/runtime').glob(name + '.*')).name, next((b / 'assets/runtime').glob(name + '.*')).name)

    def test_delivery_controls_compare_identical_bytes_without_changing_public_pages(self):
        with tempfile.TemporaryDirectory() as folder:
            site = self.stage(folder)
            optimize_public_assets(site)
            pages = {p: p.read_bytes() for p in [site / 'index.html', *sorted((site / 'pages').glob('*.html'))]}
            build_asset_check(ROOT, site)
            text = (site / 'asset-check.html').read_text()
            specs = json.loads(re.search(r'const specs=(\[.*?\]);', text)[1])
            self.assertEqual(len(specs), 7)
            for binary, encoded in ((specs[1], specs[2]), (specs[3], specs[4])):
                data = (site / binary['path'].lstrip('/')).read_bytes()
                self.assertRegex(encoded['path'], r'^https://raw\.githubusercontent\.com/4mirgr/gerami-website/[a-f0-9]{40}/assets/')
                self.assertEqual(binary['sha256'], hashlib.sha256(data).hexdigest())
                self.assertEqual(encoded['sourceBytes'], len(data))
            for original in (next((site / 'assets/runtime').glob('Vazirmatn.*.woff2')), site / 'assets/glass/ribbon-day.webp'):
                compatibility = next((site / 'delivery-check').glob(original.stem + '.*.txt'))
                self.assertEqual(base64.b64decode(compatibility.read_bytes(), validate=True), original.read_bytes())
            self.assertIn('/assets/runtime/Vazirmatn.', specs[1]['path'])
            self.assertEqual(pages, {p: p.read_bytes() for p in pages})
            self.assertLess(len(text.encode()), 12000)
            self.assertIn('/asset-check\n  Cache-Control: no-cache', (site / '_headers').read_text())

    def test_recovery_preserves_protected_files_and_small_first_response(self):
        with tempfile.TemporaryDirectory() as folder:
            site = self.stage(folder)
            optimize_public_assets(site)
            protected = {p: p.read_bytes() for directory in ('admin', 'functions') for p in (site / directory).rglob('*') if p.is_file()}
            add_public_asset_recovery(ROOT, site)
            self.assertEqual(protected, {p: p.read_bytes() for p in protected})
            self.assertLess(len(gzip.compress((site / 'index.html').read_bytes())), 28000)
            mirrors = public_mirrors(ROOT, site)
            appearance = json.loads((ROOT / 'content/appearance.json').read_text())
            self.assertTrue({appearance['light']['wallpaper'], appearance['dark']['wallpaper']}.issubset(mirrors))
            self.assertLessEqual(len(mirrors), 24)
            for path, entry in mirrors.items():
                self.assertEqual(hashlib.sha256((site / path.lstrip('/')).read_bytes()).hexdigest(), entry['sha256'])
                self.assertNotIn('/api/', path)

    def test_mirror_stale_bytes_or_nonpublic_paths_block_the_build(self):
        for mutation in ('bytes', 'path'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as config:
                site = self.stage(folder)
                optimize_public_assets(site)
                root = Path(config)
                (root / 'deploy').mkdir()
                spec = json.loads((ROOT / 'deploy/public-asset-mirror.json').read_text())
                if mutation == 'bytes':
                    spec['assets']['/assets/fonts/Vazirmatn.woff2'] = '0' * 64
                else:
                    spec['assets']['/admin/config.yml'] = '0' * 64
                (root / 'deploy/public-asset-mirror.json').write_text(json.dumps(spec))
                with self.assertRaises(ValueError):
                    public_mirrors(root, site)


if __name__ == '__main__':
    unittest.main()
