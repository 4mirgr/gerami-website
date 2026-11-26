"""Assemble pinned sites and the authenticated AUS frontend for Cloudflare Pages; never deploy or edit upstreams."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PINS = ROOT / 'deploy/projects.json'
PUBLIC_EXTENSIONS = {'.html', '.css', '.js', '.json', '.webmanifest', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.ico', '.pdf', '.txt'}
SITE_FILES = ('index.html', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', 'robots.txt', 'sitemap.xml')
SITE_DIRS = ('pages', 'css', 'js', 'assets', 'content', 'admin', 'dash')
VENTILATOR_FILES = (
    'index.html', 'app.js', 'content.js', 'model.js', 'organ-motion.js', 'waveforms.js',
    'device.css', 'organ-motion.css', 'styles.css', 'manifest.webmanifest', 'manifest.en.webmanifest',
    'assets/Vazirmatn-OFL.txt', 'assets/Vazirmatn.woff2', 'assets/alveoli.webp',
    'assets/heart-lungs.webp', 'assets/ventilator-housing.webp', 'assets/favicon.png',
    'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png',
    'assets/icon-maskable-512.png', 'assets/dr-gerami.webp',
)
SPIROMETRY_FILES = (
    'index.html', 'styles.css', 'app.mjs', 'cases.mjs', 'charts.mjs',
    'curriculum.mjs', 'model.mjs', 'lesson-notes.mjs', 'notebook.mjs', 'notebook.css',
    'locale.mjs', 'curriculum.en.mjs', 'cases.en.mjs', 'lesson-notes.en.mjs',
    'assets/Vazirmatn.woff2',
    'assets/Vazirmatn-OFL.txt', 'assets/lungs.webp', 'assets/icon.png',
)
STATIC_APPS = {'ventilator': VENTILATOR_FILES, 'spirometry': SPIROMETRY_FILES}
STATIC_APP_CHECK = ('--test',)


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


def copy_public(source, target, extra_extensions=()):
    for file in sorted(source.rglob('*')):
        relative = file.relative_to(source)
        if any(part.startswith('.') for part in relative.parts):
            continue
        if file.is_symlink():
            raise ValueError(f'Public source contains a symlink: {relative}')
        if file.is_file() and file.suffix.lower() in PUBLIC_EXTENSIONS.union(extra_extensions):
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, destination)


def inline_admin_styles(admin):
    """Deliver the render-blocking CSS with the already-authorized shell."""
    from rcssmin import cssmin

    shell = admin / 'index.html'
    html = shell.read_text(encoding='utf-8')

    def inline(match):
        source = admin / match['name']
        css = source.read_text(encoding='utf-8')
        # Check the original input, including comments removed by minification.
        if re.search(r'</style|@import\b', css, re.I):
            raise ValueError(f'Unsafe inline admin stylesheet: {source.name}')
        # Source CSS and the document have the same directory, so all relative
        # font/image URLs keep their original base.
        return f'<style data-admin-stylesheet="{source.name}">{cssmin(css, keep_bang_comments=True)}</style>'

    # Keep other links and any future alternate/media-specific styles untouched.
    links = r'<link rel="stylesheet" href="(?P<name>dompet\.css|studio\.css|settings\.css)(?:\?[^"]*)?">'
    shell.write_text(re.sub(links, inline, html), encoding='utf-8')


def fill_admin_counts(admin, content):
    """Use the same release feeds the dashboard refreshes from after startup."""
    articles = json.loads((content / 'articles.json').read_text())['articles']
    profile = json.loads((content / 'site.json').read_text())
    published = sum(article.get('status') == 'published' for article in articles)
    counts = {'total': len(articles), 'published': published,
              'drafts': len(articles) - published, 'cv-count': len(profile['cv']),
              'donut-total': len(articles)}
    shell = admin / 'index.html'
    html = shell.read_text(encoding='utf-8')
    persian = str.maketrans('0123456789,', '۰۱۲۳۴۵۶۷۸۹٬')
    for field, count in counts.items():
        marker = f'id="{field}">—<'
        if html.count(marker) != 1:
            raise ValueError(f'Missing or repeated admin count placeholder: {field}')
        value = f'{count:,}'.translate(persian)
        html = html.replace(marker, f'id="{field}">{value}<')
    shell.write_text(html, encoding='utf-8')


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


def validate_static_app(name, source):
    result = subprocess.run(
        ['node', *STATIC_APP_CHECK], cwd=source, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    if result.returncode:
        raise RuntimeError(f'{name} validation failed:\n' + result.stdout[-4000:])
    if git(source, 'status', '--porcelain', '--untracked-files=all'):
        raise RuntimeError(f'{name} validation modified the checkout; refusing to publish')
    print(f'PASS {name}: ' + ' '.join(STATIC_APP_CHECK), flush=True)


def copy_reviewed_app(source, target, files):
    for name in files:
        original = source / name
        if not original.is_file() or original.resolve() != original:
            raise ValueError(f'Missing or symlinked public asset for {target.name}: {name}')
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, destination)


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
    for name in STATIC_APPS:
        validate_static_app(name, sources[name])
    output.parent.mkdir(parents=True, exist_ok=True)
    # Build in a temporary sibling; failure never leaves a half-built _site.
    with tempfile.TemporaryDirectory(prefix='gerami-stage-', dir=output.parent) as temporary:
        stage = Path(temporary) / 'site'
        stage.mkdir()
        for name in SITE_FILES:
            shutil.copy2(ROOT / name, stage / name)
        for name in SITE_DIRS:
            copy_public(ROOT / name, stage / name, {'.mjs'} if name in ('js', 'admin') else ())
        shutil.copy2(ROOT / 'admin/config.yml', stage / 'admin/config.yml')
        inline_admin_styles(stage / 'admin')
        from site_studio import generate, write_public_feeds
        write_public_feeds(ROOT, stage)
        fill_admin_counts(stage / 'admin', stage / 'content')
        generate(ROOT, stage)
        from search_index import search_bytes
        (stage / 'content/search-index.json').write_bytes(search_bytes(ROOT))
        # AUS is a compiled authenticated application. Never copy its repository
        # root (which includes backend/private-data tooling) into public assets.
        copy_public(sources['intmed'] / pins['intmed']['public_directory'], stage / 'intmed')
        for name, files in STATIC_APPS.items():
            spec = pins[name]
            copy_reviewed_app((sources[name] / spec['public_directory']).resolve(), stage / spec['mount'], files)
        from aus_frontend_adapter import prepare_and_build
        prepare_and_build(sources['aus'], stage / 'aus')
        if git(sources['aus'], 'status', '--porcelain', '--untracked-files=all'):
            raise RuntimeError('AUS build modified the checkout; refusing to publish')
        worker = stage / 'intmed/sw.js'
        worker.write_text(scoped_worker(worker.read_text()), encoding='utf-8')
        shutil.copy2(stage / 'assets/favicon.ico', stage / 'favicon.ico')
        shutil.copy2(ROOT / 'deploy/retire-legacy-sw.js', stage / 'sw.js')
        shutil.copy2(ROOT / 'deploy/legacy-intmed-links.js', stage / 'legacy-intmed-links.js')
        for name in ('connection-check.html', 'connection-check.js'):
            shutil.copy2(ROOT / 'deploy' / name, stage / name)
        # Enable cards in the assembled artifact, where the actual apps now exist.
        with (stage / 'js/links.js').open('a', encoding='utf-8') as handle:
            handle.write("\nwindow.SITE_LINKS = Object.freeze(Object.assign({}, window.SITE_LINKS, {intmed:'/intmed/',aus:'/aus/'}));\n")
        for page in (stage / 'index.html', stage / 'pages/projects.html'):
            html = page.read_text()
            # Relative destinations keep Pages previews and the .ir site on their own host.
            html = html.replace('href="https://drgerami-md.ir/intmed/"', 'href="/intmed/"').replace('href="https://drgerami-md.ir/aus/"', 'href="/aus/"')
            spirometry_entry = '/' + pins['spirometry']['mount'] + '/'
            html = html.replace(f'href="https://drgerami-md.ir{spirometry_entry}"', f'href="{spirometry_entry}"')
            html = html.replace('href="https://drgerami-md.ir/clinic/portal/"', 'href="/clinic/portal/"')
            if page.name == 'index.html':
                html = html.replace('</head>', '<script src="/legacy-intmed-links.js" defer></script>\n</head>', 1)
            page.write_text(html, encoding='utf-8')
        spa_mounts = ('intmed', *(pins[name]['mount'] for name in STATIC_APPS))
        redirects = ''.join(f'/{mount} /{mount}/ 308\n' for mount in spa_mounts)
        (stage / '_redirects').write_text(redirects + '/newsletter.html /intmed/newsletter.html 302\n', encoding='utf-8')
        (stage / '_routes.json').write_text(json.dumps({'version': 1, 'include': ['/*'], 'exclude': ['/aus/assets/*', '/aus/fonts/*']}) + '\n', encoding='utf-8')
        shutil.copy2(ROOT / 'deploy/404.html', stage / '404.html')
        (stage / '_headers').write_text('/\n  Cache-Control: no-cache\n/pages/*\n  Cache-Control: no-cache\n/js/*\n  Cache-Control: no-cache\n/css/*\n  Cache-Control: no-cache\n/content/*\n  Cache-Control: no-cache\n/admin/*\n  Cache-Control: no-cache\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n/intmed/sw.js\n  Cache-Control: no-cache\n/intmed/config.js\n  Cache-Control: no-cache\n/intmed/content/*.json\n  Cache-Control: no-cache\n/aus/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/aus/fonts/*\n  Cache-Control: public, max-age=86400\n', encoding='utf-8')
        with (stage / '_headers').open('a', encoding='utf-8') as headers:
            headers.write('/projects\n  Cache-Control: no-cache\n')
            for name in STATIC_APPS:
                mount = pins[name]['mount']
                headers.write(f'/{mount}/\n  Cache-Control: no-cache\n/{mount}/*\n  Cache-Control: no-cache\n')
        from version_assets import version_assets
        version_assets(stage)
        from public_assets import optimize_public_assets
        performance = optimize_public_assets(stage)
        from public_asset_recovery import add_public_asset_recovery
        add_public_asset_recovery(ROOT, stage)
        # Publish the Studio-managed catalog at the clean storefront address.
        shutil.copy2(stage / 'pages/projects.html', stage / 'projects.html')
        from asset_check import build_asset_check
        build_asset_check(ROOT, stage)
        files = [file for file in stage.rglob('*') if file.is_file()]
        if len(files) > 20000 or any(file.stat().st_size > 25 * 1024 * 1024 for file in files):
            raise ValueError('Output exceeds Cloudflare Pages static asset limits')
        report = {'performance': performance, 'projects': pins, 'files': len(files), 'bytes': sum(file.stat().st_size for file in files), 'upstream_sources_modified': False, 'intmed_checks': intmed_checks, 'aus_checks': aus_checks, 'aus_warnings': aus_warnings, 'adapters': ['IntMed service-worker scope/cache paths', 'AUS authenticated frontend with same-origin API and auth gateway', 'root legacy worker retirement', 'same-origin project entries']}
        for name in STATIC_APPS:
            report[f'{name}_checks'] = [' '.join(STATIC_APP_CHECK)]
        (stage / 'build-info.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        stage.rename(output)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--intmed-source', type=Path)
    parser.add_argument('--aus-source', type=Path)
    parser.add_argument('--ventilator-source', type=Path)
    parser.add_argument('--spirometry-source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    args = parser.parse_args()
    if bool(args.intmed_source) != bool(args.aus_source):
        parser.error('Provide both local sources, or neither to fetch the pinned releases')
    subprocess.run([sys.executable, str(ROOT / 'scripts/check_site.py')], check=True, timeout=300)
    pins = json.loads(PINS.read_text())
    with tempfile.TemporaryDirectory(prefix='gerami-sources-') as temporary:
        local_sources = {'intmed': args.intmed_source, 'aus': args.aus_source,
                         'ventilator': args.ventilator_source, 'spirometry': args.spirometry_source}
        sources = {
            name: local_sources[name].resolve() if local_sources[name] else fetch_source(spec, Path(temporary) / name)
            for name, spec in pins.items()
        }
        result = assemble(sources, args.output)
        command = [sys.executable, str(ROOT / 'scripts/verify_cloudflare.py'), '--site', str(args.output)]
        for name, source in sources.items():
            command.extend((f'--{name}-source', str(source)))
        subprocess.run(command, check=True, timeout=120)
    print(f"Built {result['files']} public files ({result['bytes']:,} bytes) in {args.output}; nothing deployed.")


if __name__ == '__main__':
    main()
