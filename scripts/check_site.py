"""One reproducible entry point for website verification; never publishes."""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
UNITS = ('test_aus_gateway.mjs', 'test_connection_check.mjs', 'test_cms_oauth.mjs')
BROWSERS = ('browser-check.mjs', 'test_personal_site.mjs', 'test_admin.mjs',
            'test_identity_font.mjs', 'test_content_order.mjs',
            'test_cms_completion.mjs', 'test_cms_session.cjs')


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
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_aus_frontend_adapter.py'])
    for script in UNITS:
        run(['node', 'scripts/' + script])
    for folder in ('js', 'admin', 'functions'):
        for path in sorted((ROOT / folder).rglob('*.js')):
            run(['node', '--check', str(path.relative_to(ROOT))])
    if not args.browser:
        return
    server = None
    try:
        if not args.reuse_server:
            server = subprocess.Popen([sys.executable, '-m', 'http.server', '4173', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
