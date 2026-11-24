"""Check the assembled artifact and that imported app files retain their content."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_cloudflare import VENTILATOR_CHECK, VENTILATOR_FILES

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--site', type=Path, default=ROOT / '_site')
parser.add_argument('--intmed-source', type=Path, required=True)
parser.add_argument('--aus-source', type=Path, required=True)
parser.add_argument('--ventilator-source', type=Path, required=True)
args = parser.parse_args()
site = args.site.resolve()
errors = []


def digest(path):
    return hashlib.sha256(path.read_bytes()).digest()


class Assets(HTMLParser):
    def __init__(self, include_images=False):
        super().__init__()
        self.refs = []
        self.entries = []
        self.include_images = include_images

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if (tag == 'script' or (tag == 'img' and self.include_images)) and 'src' in attributes:
            self.refs.append(attributes['src'])
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'manifest', 'apple-touch-icon'):
            self.refs.append(attributes.get('href', ''))
        if tag == 'a' and 'data-app-entry' in attributes:
            self.entries.append(attributes.get('href'))


for path in ('index.html', 'pages/projects.html', 'aus/index.html', 'intmed/index.html', 'connection-check.html', 'asset-check.html', 'ventilator/index.html'):
    file = site / path
    is_ventilator = path == 'ventilator/index.html'
    assets = Assets(include_images=is_ventilator)
    assets.feed(file.read_text())
    for reference in assets.refs:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            errors.append(f'{path}: external entry-point asset {reference}')
            continue
        target = site / unquote(url.path).lstrip('/') if url.path.startswith('/') else file.parent / unquote(url.path)
        if is_ventilator and not target.resolve().is_relative_to(file.parent):
            errors.append(f'{path}: asset escapes its mount {reference}')
        if not target.is_file():
            errors.append(f'{path}: missing local asset {reference}')
    if path in ('index.html', 'pages/projects.html') and assets.entries != ['/intmed/']:
        errors.append(f'{path}: project buttons must stay on the preview/production origin')

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

ventilator = site / 'ventilator'
ventilator_published = {file.relative_to(ventilator).as_posix() for file in ventilator.rglob('*') if file.is_file()}
if ventilator_published != set(VENTILATOR_FILES):
    errors.append('Ventilator artifact differs from the reviewed public file allowlist')
for name in ventilator_published.intersection(VENTILATOR_FILES):
    original = args.ventilator_source / name
    if not original.is_file() or digest(original) != digest(ventilator / name):
        errors.append(f'Imported Ventilator file changed: {name}')

manifest = json.loads((site / 'intmed/manifest.webmanifest').read_text())
if manifest['start_url'] != './' or manifest['scope'] != './':
    errors.append('IntMed install manifest no longer supports subpaths')
report = json.loads((site / 'build-info.json').read_text())
if report['projects'] != json.loads((ROOT / 'deploy/projects.json').read_text()):
    errors.append('Build pins differ from deployment manifest')
redirects = (site / '_redirects').read_text()
if (not (site / '404.html').is_file()
        or any(f'/{name} /{name}/ 308' not in redirects for name in ('intmed', 'ventilator'))
        or any(line.split()[:1] == ['/aus'] for line in redirects.splitlines())):
    errors.append('Missing routing configuration')
if report.get('aus_checks') != ['--test tests/cloud_auth.mjs']:
    errors.append('AUS authentication and owner-isolation release checks were not recorded')
if report.get('ventilator_checks') != [' '.join(VENTILATOR_CHECK)]:
    errors.append('Ventilator simulation release checks were not recorded')
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
print('PASS: local entry assets, same-origin project buttons, pinned AUS build, unchanged Ventilator public files, restricted API routes, IntMed manifest and scoped worker.')
