"""One reproducible entry point for website verification; never publishes."""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
UNITS = ('test_editorial.mjs', 'test_editorial_catalog.mjs', 'test_editorial_media.mjs', 'test_editorial_delivery.mjs', 'test_editorial_trends.mjs', 'test_editorial_cover_sql.mjs', 'test_editorial_choices.mjs', 'test_editorial_publisher.mjs', 'test_editorial_feed.mjs', 'test_editorial_function.mjs', 'test_editorial_sql.mjs', 'test_editorial_telegram.mjs', 'test_editorial_api.mjs', 'test_aus_gateway.mjs', 'test_connection_check.mjs', 'test_asset_check.mjs', 'test_cms_oauth.mjs', 'test_admin_gate.mjs', 'test_shared_account.mjs', 'test_shared_auth_sql.mjs', 'test_site_studio.mjs', 'test_topics.mjs')
BROWSERS = ('test_editorial_browser.mjs', 'browser-check.mjs', 'test_personal_site.mjs', 'test_admin.mjs',
            'test_identity_font.mjs', 'test_public_glass.mjs', 'test_reading_glass.mjs', 'test_mobile_brand.mjs', 'test_topic_reading.mjs', 'test_pages_canonical.mjs', 'test_content_order.mjs',
            'test_cms_completion.mjs', 'test_cms_session.cjs', 'test_site_studio_browser.mjs', 'test_topic_editor.mjs', 'test_article_publish_browser.mjs', 'test_admin_gate_browser.mjs', 'test_home_loading_browser.mjs', 'test_domain_account.mjs', 'test_account_menu.mjs', 'test_header_polish.mjs', 'test_toolbar.mjs', 'test_folder_headings.mjs', 'test_intmed_posters.mjs')


def run(command):
    print('CHECK ' + ' '.join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True, timeout=180)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', action='store_true')
    parser.add_argument('--reuse-server', action='store_true')
    args = parser.parse_args()
    for script in ('verify.py', 'validate_content.py'):
        run([sys.executable, 'scripts/' + script])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_content_validation.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_update_projects.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_asset_versions.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_live_health.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_aus_frontend_adapter.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_site_studio.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_editorial_seo.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_home_loading.py'])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_public_assets.py'])
    for script in UNITS:
        run(['node', 'scripts/' + script])
    for folder in ('js', 'admin', 'functions'):
        for path in sorted([p for p in (ROOT / folder).rglob('*') if p.suffix in ('.js', '.mjs')]):
            run(['node', '--check', str(path.relative_to(ROOT))])
    if not args.browser:
        return
    server = None
    try:
        if not args.reuse_server:
            server = subprocess.Popen([sys.executable, 'scripts/preview_server.py'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ready = False
        for _ in range(50):
            if server and server.poll() is not None:
                raise RuntimeError('Preview server could not start; port 4173 must be free')
            try:
                with urlopen('http://127.0.0.1:4173/', timeout=2) as response:
                    ready = response.status == 200
                if ready:
                    break
            except OSError:
                time.sleep(0.1)
        if not ready:
            raise RuntimeError('Preview server did not become ready')
        for script in BROWSERS:
            run(['node', 'scripts/' + script])
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == '__main__':
    main()
