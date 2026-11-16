"""Read-only production probes. Never authenticate, submit forms or log secrets."""
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit, urljoin

ORIGIN = 'https://drgerami-md.ir'
CHECKS = {
    '/': b'css/enfhess.css',
    '/admin/login.html': b'login.mjs',
    '/api/cms/status': b'"configured":true',
    '/intmed/': b'<title>IntMed</title>',
    '/aus/': b'/aus/assets/',
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


def probe_admin(path):
    request=Request(ORIGIN+path,headers={'Accept':'text/html','Cache-Control':'no-cache'})
    try:
        with build_opener(NoRedirect).open(request,timeout=20):
            raise RuntimeError('Administrator document unexpectedly served publicly')
    except HTTPError as error:
        location=urlsplit(urljoin(ORIGIN+'/',error.headers.get('Location','')))
        if error.code!=302 or location.path not in ('/admin/login','/admin/login.html') or location.scheme!='https' or location.netloc!=urlsplit(ORIGIN).netloc or location.username is not None or location.password is not None:
            raise RuntimeError('Administrator document did not require the local login gate') from error
    return f'PASS production: {path} require authentication'


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(probe, CHECKS.items()):
            print(result)
    for path in ('/admin/','/admin/editor.html','/dash/'):
        print(probe_admin(path))
