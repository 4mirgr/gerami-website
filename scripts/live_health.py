"""Read-only production probes. Never authenticate, submit forms or log secrets."""
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs

ORIGIN = 'https://drgerami-md.ir'
CHECKS = {
    '/': b'css/enfhess.css',
    '/admin/': b'dompet.css',
    '/admin/editor.html': b'decap-cms@3.10.0',
    '/api/cms/status': b'"configured":true',
    '/intmed/': b'<title>IntMed</title>',
    '/account/': b'account/account.mjs',
    '/api/account/session': b'"user":null',
    '/assets/fonts/Vazirmatn.woff2': b'wOF2',
}


def probe(item):
    path, marker = item
    request = Request(ORIGIN + path, headers={'User-Agent':'Gerami-Website-Health/1.0', 'Cache-Control':'no-cache'})
    with urlopen(request, timeout=20) as response:
        body = response.read(2_000_000)
        if response.status != 200 or marker not in body:
            raise RuntimeError(f'Health check failed: {path}')
    return f'PASS production: {path}'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def probe_private():
    request = Request(ORIGIN + '/aus/', headers={'Accept':'text/html', 'Cache-Control':'no-cache'})
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            raise RuntimeError('Private AUS entry unexpectedly served public content')
    except HTTPError as error:
        location = urlsplit(error.headers.get('Location', ''))
        if error.code != 302 or location.path != '/account/' or (location.netloc and location.netloc != urlsplit(ORIGIN).netloc) or parse_qs(location.query).get('mode') != ['private']:
            raise RuntimeError('Private AUS entry did not require authentication') from error
    request = Request(ORIGIN + '/aus/api/public-config', headers={'Accept':'application/json', 'Cache-Control':'no-cache'})
    try:
        with urlopen(request, timeout=20):
            raise RuntimeError('Private AUS API unexpectedly served an anonymous request')
    except HTTPError as error:
        if error.code != 401 or b'sign_in_required' not in error.read(4096):
            raise RuntimeError('Private AUS API did not fail closed') from error
    return 'PASS production: AUS navigation and API require authentication'


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(probe, CHECKS.items()):
            print(result)
    print(probe_private())
