"""Check the assembled artifact and that imported app files retain their content."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_cloudflare import STATIC_APPS, STATIC_APP_CHECK

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--site', type=Path, default=ROOT / '_site')
parser.add_argument('--intmed-source', type=Path, required=True)
parser.add_argument('--aus-source', type=Path, required=True)
for name in STATIC_APPS:
    parser.add_argument(f'--{name}-source', type=Path, required=True)
args = parser.parse_args()
site = args.site.resolve()
pins = json.loads((ROOT / 'deploy/projects.json').read_text())
static_entries = {pins[name]['mount'] + '/index.html' for name in STATIC_APPS}
errors = []


def digest(path):
    return hashlib.sha256(path.read_bytes()).digest()


class Assets(HTMLParser):
    def __init__(self, include_images=False):
        super().__init__()
        self.refs = []
        self.entries = []
        self.canonical = []
        self.include_images = include_images

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if (tag == 'script' or (tag == 'img' and self.include_images)) and 'src' in attributes:
            self.refs.append(attributes['src'])
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'manifest', 'apple-touch-icon'):
            self.refs.append(attributes.get('href', ''))
        if tag == 'link' and attributes.get('rel') == 'canonical':
            self.canonical.append(attributes.get('href', ''))
        if tag == 'a' and 'data-app-entry' in attributes:
            self.entries.append(attributes.get('href'))


for path in ('index.html', 'pages/projects.html', 'aus/index.html', 'intmed/index.html',
             'connection-check.html', 'asset-check.html', *sorted(static_entries)):
    file = site / path
    is_static_app = path in static_entries
    assets = Assets(include_images=is_static_app)
    assets.feed(file.read_text())
    for reference in assets.refs:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            errors.append(f'{path}: external entry-point asset {reference}')
            continue
        target = site / unquote(url.path).lstrip('/') if url.path.startswith('/') else file.parent / unquote(url.path)
        if is_static_app and not target.resolve().is_relative_to(file.parent):
            errors.append(f'{path}: asset escapes its mount {reference}')
        if not target.is_file():
            errors.append(f'{path}: missing local asset {reference}')
    expected_entries = {
        'index.html': ['/intmed/'],
        'pages/projects.html': ['/intmed/', '/respiratory/spirometry/'],
    }
    if path in expected_entries and assets.entries != expected_entries[path]:
        errors.append(f'{path}: project buttons must stay on the preview/production origin')
    if path == 'respiratory/spirometry/index.html' and assets.canonical != ['https://drgerami-md.ir/respiratory/spirometry/']:
        errors.append(f'{path}: expected the published course as its canonical URL')

# IntMed retains the upstream bytes except its documented service-worker scope.
for target in (site / 'intmed').rglob('*'):
    if target.is_file() and target != site / 'intmed/sw.js':
        original = args.intmed_source / 'docs' / target.relative_to(site / 'intmed')
        if not original.is_file() or digest(original) != digest(target):
            errors.append(f'Imported IntMed file changed: {target.relative_to(site)}')

# AUS is compiled from its pinned React source; only dist assets belong here.
aus = site / 'aus'
if 'id="root"' not in (aus / 'index.html').read_text():
    errors.append('AUS must contain the authenticated React entry point')
if not (aus / 'assets').is_dir() or (aus / 'app.js').exists() or (aus / 'data/tasks.json').exists():
    errors.append('AUS must publish the authenticated build, never the old static dashboard')
for forbidden in ('cloud', 'src', 'tests', 'private', 'node_modules', 'wrangler.jsonc', 'package.json'):
    if (aus / forbidden).exists():
        errors.append(f'Nonpublic AUS source published: {forbidden}')

for name, files in STATIC_APPS.items():
    spec = pins[name]
    mount = site / spec['mount']
    published = {file.relative_to(mount).as_posix() for file in mount.rglob('*') if file.is_file()}
    if published != set(files):
        errors.append(f'{name} artifact differs from the reviewed public file allowlist')
    source = getattr(args, f'{name}_source') / spec['public_directory']
    for filename in published.intersection(files):
        original = source / filename
        if not original.is_file() or digest(original) != digest(mount / filename):
            errors.append(f'Imported {name} file changed: {filename}')

manifest = json.loads((site / 'intmed/manifest.webmanifest').read_text())
if manifest['start_url'] != './' or manifest['scope'] != './':
    errors.append('IntMed install manifest no longer supports subpaths')
report = json.loads((site / 'build-info.json').read_text())
if report['projects'] != pins:
    errors.append('Build pins differ from deployment manifest')
redirects = (site / '_redirects').read_text()
if (not (site / '404.html').is_file()
        or any(f'/{mount} /{mount}/ 308' not in redirects for mount in ('intmed', *(pins[name]['mount'] for name in STATIC_APPS)))
        or (site / 'spirometry').exists()
        or any(line.split()[:1] == ['/aus'] for line in redirects.splitlines())):
    errors.append('Missing routing configuration')
if report.get('aus_checks') != ['--test tests/cloud_auth.mjs']:
    errors.append('AUS authentication and owner-isolation release checks were not recorded')
for name in STATIC_APPS:
    if report.get(f'{name}_checks') != [' '.join(STATIC_APP_CHECK)]:
        errors.append(f'{name} simulation release checks were not recorded')
routes = json.loads((site / '_routes.json').read_text())
if routes != {'version': 1, 'include': ['/*'], 'exclude': ['/aus/assets/*', '/aus/fonts/*']}:
    errors.append('Protected documents and encoded aliases must pass the server access gate')
for asset in (aus / 'assets').glob('*'):
    if not asset.is_file() or not re.fullmatch(r'[A-Za-z0-9_-]+-[A-Z0-9]{8}\.(?:js|css)', asset.name):
        errors.append(f'Only fingerprinted compiled files may use the AUS immutable asset route: {asset.name}')
if any(path.name == '.git' for path in site.rglob('*')):
    errors.append('Git metadata must not be published')
if errors:
    raise SystemExit('\n'.join(errors))
print('PASS: local entry assets, same-origin project buttons, pinned AUS build, unchanged Ventilator and Spirometry public files, restricted API routes, IntMed manifest and scoped worker.')
