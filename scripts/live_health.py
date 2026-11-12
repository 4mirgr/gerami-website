"""Read-only production probes. Never authenticate, submit forms or log secrets."""
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

ORIGIN = 'https://drgerami-md.ir'
CHECKS = {
    '/': b'css/enfhess.css',
    '/admin/': b'dompet.css',
    '/admin/editor.html': b'decap-cms@3.10.0',
    '/intmed/': b'<html',
    '/aus/': b'<html',
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


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(probe, CHECKS.items()):
            print(result)
