"""Assemble pinned sites and the authenticated AUS frontend for Cloudflare Pages; never deploy or edit upstreams."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PINS = ROOT / 'deploy/projects.json'
PUBLIC_EXTENSIONS = {'.html', '.css', '.js', '.json', '.webmanifest', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.ico', '.pdf', '.txt'}
SITE_FILES = ('index.html', 'favicon.svg')
SITE_DIRS = ('pages', 'css', 'js', 'assets', 'content', 'admin')


def git(directory, *args):
    return subprocess.check_output(['git', '-C', str(directory), *args], text=True).strip()


def fetch_source(spec, directory):
    directory.mkdir()
    subprocess.run(['git', 'init', '-q', str(directory)], check=True)
    subprocess.run(['git', '-C', str(directory), 'remote', 'add', 'origin', spec['repository']], check=True)
    subprocess.run(['git', '-C', str(directory), 'fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', spec['commit']], check=True)
    # Upstream validators may read root configuration and files outside the public
    # folders. Always materialize the complete pinned tree, including in CI where
    # sparse-checkout settings may be inherited from the build environment.
    subprocess.run(['git', '-C', str(directory), '-c', 'core.sparseCheckout=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], check=True)
    if spec['mount'] == 'intmed':
        # Restore the actual upstream config, never a generated substitute. This
        # file is needed only by tests; it is not published in the site's assets.
        subprocess.run(['git', '-C', str(directory), 'restore', '--source=FETCH_HEAD', '--ignore-skip-worktree-bits', '--worktree', '--', 'wrangler.jsonc'], check=True)
    return directory


def copy_public(source, target):
    for file in sorted(source.rglob('*')):
        relative = file.relative_to(source)
        if any(part.startswith('.') for part in relative.parts):
            continue
        if file.is_symlink():
            raise ValueError(f'Public source contains a symlink: {relative}')
        if file.is_file() and file.suffix.lower() in PUBLIC_EXTENSIONS:
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, destination)


def scoped_worker(source):
    # The original worker compares some content paths to /content/... . At /intmed/
    # those must stay network-first, not silently become stale-while-revalidate.
    needle = 'function liveContent(url){return'
    if source.count(needle) != 1 or "'intmed-pwa-" not in source:
        raise ValueError('Upstream service worker changed; review the subpath adapter before updating the pin')
    source = source.replace("'intmed-pwa-", "'intmed-subpath-")
    return source.replace(needle, 'function liveContent(url){url=new URL(url);url.pathname=url.pathname.slice(new URL(self.registration.scope).pathname.length-1);return', 1)


def validate_config(source):
    # Validate the existing PUBLIC browser config without logging its key.
    match = re.search(r'window\.INTMED_CONFIG\s*=\s*(\{.*\});', source, re.S)
    if not match:
        raise ValueError('IntMed runtime config is not a JSON assignment')
    config = json.loads(match.group(1))
    if config.get('allowLegacyDemo') is not False:
        raise ValueError('Production build requires allowLegacyDemo=false')
    if config.get('supabaseUrl') != 'https://api.drgerami-md.ir':
        raise ValueError('Review the IntMed API gateway before building this deployment')
    if not isinstance(config.get('supabaseAnonKey'), str) or len(config['supabaseAnonKey']) < 20:
        raise ValueError('IntMed public anon configuration is missing')
    key = config['supabaseAnonKey']
    if not key.startswith('sb_publishable_'):
        try:
            payload = key.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        except (IndexError, ValueError):
            raise ValueError('Runtime key is not a recognized public anon/publishable key') from None
        if claims.get('role') != 'anon':
            raise ValueError('Privileged keys must never enter a public site build')


def validate_intmed(source):
    """Run upstream's read-only gates; never migrate/build into its source tree."""
    commands = [
        [sys.executable, 'scripts/content_pipeline.py', 'validate'],
        [sys.executable, 'scripts/content_pipeline.py', 'check'],
        ['node', 'scripts/check_inline_js.mjs'],
        ['node', 'scripts/backend_unit_test.mjs'],
        ['node', 'scripts/backend_state_test.mjs'],
        ['node', 'scripts/exams_unit_test.mjs'],
        ['node', 'scripts/username_login_test.mjs'],
        ['node', 'scripts/entitlements_test.mjs'],
        ['node', 'scripts/pwa_test.mjs'],
        ['node', 'scripts/cloudflare_proxy_test.mjs'],
        [sys.executable, 'scripts/runtime_config_test.py'],
        [sys.executable, 'scripts/release_preflight.py'],
    ]
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    for command in commands:
        result = subprocess.run(command, cwd=source, env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        label = ' '.join(command[1:])
        if result.returncode:
            raise RuntimeError('IntMed validation failed: '+label+'\n'+result.stdout[-4000:])
        print('PASS IntMed: '+label, flush=True)
    if git(source, 'status', '--porcelain', '--untracked-files=all'):
        raise RuntimeError('IntMed validation modified the checkout; refusing to publish')
    return [' '.join(command[1:]) for command in commands]


def validate_aus(source):
    commands = [['node', '--test', 'tests/cloud_auth.mjs']]
    warnings = []
    for command in commands:
        result = subprocess.run(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        label = ' '.join(command[1:])
        if result.returncode:
            raise RuntimeError('AUS validation failed: '+label+'\n'+result.stdout[-4000:])
        notes = [line for line in result.stdout.splitlines() if line.startswith('! ')]
        warnings.extend(notes)
        for note in notes:
            print('AUS warning: '+note[2:], flush=True)
        print('PASS AUS: '+label, flush=True)
    if git(source, 'status', '--porcelain', '--untracked-files=all'):
        raise RuntimeError('AUS validation modified the checkout; refusing to publish')
    return [' '.join(command[1:]) for command in commands], warnings


def assemble(sources, output):
    pins = json.loads(PINS.read_text())
    output = output.resolve()
    if output.exists():
        raise ValueError(f'Output already exists; use a fresh build directory: {output}')
    for name, source in sources.items():
        source = source.resolve()
        if git(source, 'rev-parse', 'HEAD') != pins[name]['commit']:
            raise ValueError(f'{name}: checkout differs from the pinned release')
        if git(source, 'status', '--porcelain', '--untracked-files=all'):
            raise ValueError(f'{name}: source has local changes; refusing an unreproducible build')
        if output == source or source.is_relative_to(output) or output.is_relative_to(source):
            raise ValueError('Output must be separate from source checkouts')
    validate_config((sources['intmed'] / 'docs/config.js').read_text())
    aus_checks, aus_warnings = validate_aus(sources['aus'])
    intmed_checks = validate_intmed(sources['intmed'])
    output.parent.mkdir(parents=True, exist_ok=True)
    # Build in a temporary sibling; failure never leaves a half-built _site.
    with tempfile.TemporaryDirectory(prefix='gerami-stage-', dir=output.parent) as temporary:
        stage = Path(temporary) / 'site'
        stage.mkdir()
        for name in SITE_FILES:
            shutil.copy2(ROOT / name, stage / name)
        for name in SITE_DIRS:
            copy_public(ROOT / name, stage / name)
        shutil.copy2(ROOT / 'admin/config.yml', stage / 'admin/config.yml')
        # AUS is a compiled authenticated application. Never copy its repository
        # root (which includes backend/private-data tooling) into public assets.
        copy_public(sources['intmed'] / pins['intmed']['public_directory'], stage / 'intmed')
        from aus_frontend_adapter import prepare_and_build
        prepare_and_build(sources['aus'], stage / 'aus')
        if git(sources['aus'], 'status', '--porcelain', '--untracked-files=all'):
            raise RuntimeError('AUS build modified the checkout; refusing to publish')
        worker = stage / 'intmed/sw.js'
        worker.write_text(scoped_worker(worker.read_text()), encoding='utf-8')
        # Supply a local fallback favicon for browser requests.
        # Wrap its medical project's existing PNG in a standard ICO container;
        # no image pixels or imported app files are changed.
        icon = (stage / 'intmed/assets/pwa-192.png').read_bytes()
        width, height = struct.unpack('>II', icon[16:24])
        if icon[:8] != b'\x89PNG\r\n\x1a\n' or not (0 < width <= 256 and 0 < height <= 256):
            raise ValueError('Review the fallback favicon source')
        entry = struct.pack('<BBBBHHII', width % 256, height % 256, 0, 0, 1, 32, len(icon), 22)
        (stage / 'favicon.ico').write_bytes(struct.pack('<HHH', 0, 1, 1) + entry + icon)
        shutil.copy2(ROOT / 'deploy/retire-legacy-sw.js', stage / 'sw.js')
        shutil.copy2(ROOT / 'deploy/legacy-intmed-links.js', stage / 'legacy-intmed-links.js')
        for name in ('connection-check.html', 'connection-check.js'):
            shutil.copy2(ROOT / 'deploy' / name, stage / name)
        # Enable cards in the assembled artifact, where the actual apps now exist.
        with (stage / 'js/links.js').open('a', encoding='utf-8') as handle:
            handle.write("\nwindow.SITE_LINKS = Object.freeze(Object.assign({}, window.SITE_LINKS, {intmed:'/intmed/',aus:'/aus/'}));\n")
        ready_fa = 'هر دو پروژه از زیرمسیر همین سایت در دسترس‌اند.'
        ready_en = 'Both projects are available under this site’s own paths.'
        for page in (stage / 'index.html', stage / 'pages/projects.html'):
            html = page.read_text()
            # Relative destinations keep Pages previews and the .ir site on their own host.
            html = html.replace('href="https://drgerami-md.ir/intmed/"', 'href="/intmed/"').replace('href="https://drgerami-md.ir/aus/"', 'href="/aus/"')
            html, count = re.subn(r'<p[^>]*id="project-entry-status"[^>]*>.*?</p>', f'<p class="link-status" id="project-entry-status" data-fa="{ready_fa}" data-en="{ready_en}">{ready_fa}</p>', html, flags=re.S)
            if count != 1:
                raise ValueError('Project entry markup changed; review the deployment adapter')
            if page.name == 'index.html':
                html = html.replace('</head>', '<script src="/legacy-intmed-links.js" defer></script>\n</head>', 1)
            page.write_text(html, encoding='utf-8')
        (stage / '_redirects').write_text('/intmed /intmed/ 308\n/aus /aus/ 308\n/newsletter.html /intmed/newsletter.html 302\n', encoding='utf-8')
        (stage / '_routes.json').write_text(json.dumps({'version': 1, 'include': ['/aus/api/*', '/aus/supabase/*', '/api/cms/*'], 'exclude': []}) + '\n', encoding='utf-8')
        (stage / '404.html').write_text('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>صفحه پیدا نشد</title><h1>صفحه پیدا نشد</h1><a href="/">صفحهٔ اصلی</a></html>\n', encoding='utf-8')
        (stage / '_headers').write_text('/sw.js\n  Cache-Control: no-cache\n/intmed/sw.js\n  Cache-Control: no-cache\n/intmed/config.js\n  Cache-Control: no-cache\n/intmed/content/*.json\n  Cache-Control: no-cache\n', encoding='utf-8')
        files = [file for file in stage.rglob('*') if file.is_file()]
        if len(files) > 20000 or any(file.stat().st_size > 25 * 1024 * 1024 for file in files):
            raise ValueError('Output exceeds Cloudflare Pages static asset limits')
        report = {'projects': pins, 'files': len(files), 'bytes': sum(file.stat().st_size for file in files), 'upstream_sources_modified': False, 'intmed_checks': intmed_checks, 'aus_checks': aus_checks, 'aus_warnings': aus_warnings, 'adapters': ['IntMed service-worker scope/cache paths', 'AUS authenticated frontend with same-origin API and auth gateway', 'root legacy worker retirement', 'same-origin project entries']}
        (stage / 'build-info.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        stage.rename(output)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--intmed-source', type=Path)
    parser.add_argument('--aus-source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    args = parser.parse_args()
    if bool(args.intmed_source) != bool(args.aus_source):
        parser.error('Provide both local sources, or neither to fetch the pinned releases')
    pins = json.loads(PINS.read_text())
    with tempfile.TemporaryDirectory(prefix='gerami-sources-') as temporary:
        if args.intmed_source:
            sources = {'intmed': args.intmed_source.resolve(), 'aus': args.aus_source.resolve()}
        else:
            sources = {name: fetch_source(spec, Path(temporary) / name) for name, spec in pins.items()}
        result = assemble(sources, args.output)
    print(f"Built {result['files']} public files ({result['bytes']:,} bytes) in {args.output}; nothing deployed.")


if __name__ == '__main__':
    main()
