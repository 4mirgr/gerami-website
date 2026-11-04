"""Check the assembled artifact and that imported app files retain their content."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--site', type=Path, default=ROOT / '_site')
parser.add_argument('--intmed-source', type=Path, required=True)
parser.add_argument('--aus-source', type=Path, required=True)
args = parser.parse_args()
site = args.site.resolve()
errors = []


def digest(path):
    return hashlib.sha256(path.read_bytes()).digest()


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.entries = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and 'src' in attributes:
            self.refs.append(attributes['src'])
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'manifest', 'apple-touch-icon'):
            self.refs.append(attributes.get('href', ''))
        if tag == 'a' and 'data-app-entry' in attributes:
            self.entries.append(attributes.get('href'))


for path in ('index.html', 'pages/projects.html', 'aus/index.html', 'intmed/index.html'):
    file = site / path
    assets = Assets()
    assets.feed(file.read_text())
    for reference in assets.refs:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            errors.append(f'{path}: external entry-point asset {reference}')
            continue
        target = site / unquote(url.path).lstrip('/') if url.path.startswith('/') else file.parent / unquote(url.path)
        if not target.is_file():
            errors.append(f'{path}: missing local asset {reference}')
    if path in ('index.html', 'pages/projects.html') and assets.entries != ['/intmed/', '/aus/']:
        errors.append(f'{path}: project buttons must stay on the preview/production origin')

for name, source in (('aus', args.aus_source), ('intmed', args.intmed_source / 'docs')):
    for target in (site / name).rglob('*'):
        adapted = (name == 'intmed' and target == site / 'intmed/sw.js') or (name == 'aus' and target == site / 'aus/styles.css')
        if target.is_file() and not adapted:
            original = source / target.relative_to(site / name)
            if not original.is_file() or digest(original) != digest(target):
                errors.append(f'Imported app file changed: {target.relative_to(site)}')

manifest = json.loads((site / 'intmed/manifest.webmanifest').read_text())
if manifest['start_url'] != './' or manifest['scope'] != './':
    errors.append('IntMed install manifest no longer supports subpaths')
report = json.loads((site / 'build-info.json').read_text())
if report['projects'] != json.loads((ROOT / 'deploy/projects.json').read_text()):
    errors.append('Build pins differ from deployment manifest')
redirects = (site / '_redirects').read_text()
if not (site / '404.html').is_file() or '/intmed /intmed/ 308' not in redirects or '/aus /aus/ 308' not in redirects:
    errors.append('Missing routing configuration')
if report.get('aus_checks') != ['scripts/validate-data.mjs', '--check app.js']:
    errors.append('AUS data and JavaScript release checks were not recorded')
aus_css = (site / 'aus/styles.css').read_text()
if 'fonts.googleapis.com' in aus_css or "/intmed/fonts/Vazirmatn-Regular.woff2" not in aus_css:
    errors.append('AUS must use the local font instead of the Google import')
if any(path.name == '.git' for path in site.rglob('*')):
    errors.append('Git metadata must not be published')
if errors:
    raise SystemExit('\n'.join(errors))
print('PASS: 3 site entry points, local assets/fonts, same-origin project buttons, release pins, PWA manifest, routing, and unchanged upstream app files (except the documented worker/font adapters).')
