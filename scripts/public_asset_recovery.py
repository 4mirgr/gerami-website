"""Scope alternate delivery to reviewed, immutable public font/decorative bytes."""
import hashlib
import json
import re
from pathlib import Path

EMPTY_IMAGE = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E'


def public_mirrors(root, site):
    root, site = Path(root), Path(site)
    config = json.loads((root / 'deploy/public-asset-mirror.json').read_text())
    if config['repository'] != '4mirgr/gerami-website' or not re.fullmatch(r'[a-f0-9]{40}', config['commit']):
        raise ValueError('Review public mirror repository/pin')
    mirrors = {}
    for path, digest in config['assets'].items():
        if not re.fullmatch(r'/assets/(?:fonts/Vazirmatn\.woff2|(?:glass|identity|optimized)/[a-z0-9.-]+\.webp)', path):
            raise ValueError('Only reviewed public font/decorative paths may be mirrored')
        data = (site / path.lstrip('/')).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest or not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise ValueError('Public mirror bytes changed; review source pin and hashes')
        target = path
        if path.endswith('.woff2'):
            target = '/assets/runtime/Vazirmatn.' + digest[:16] + '.woff2'
            if (site / target.lstrip('/')).read_bytes() != data:
                raise ValueError('Public runtime font differs from reviewed mirror')
        mirrors[target] = {'url': f"https://raw.githubusercontent.com/{config['repository']}/{config['commit']}{path}", 'sha256': digest, 'bytes': len(data), 'type': 'font/woff2' if path.endswith('.woff2') else 'image/webp', 'variable': '--public-asset-' + digest[:16]}
    return mirrors


def controlled_public_css(css, mirrors):
    # Native CSS/font fetches cannot be bounded/cancelled by AbortController.
    # Real bytes are installed as local Blob URLs after a verified managed fetch.
    for path, entry in mirrors.items():
        if entry['type'] == 'font/woff2':
            css = re.sub(r'url\([\'\"]?' + re.escape(path) + r'[\'\"]?\)\s*format\([\'\"]woff2[\'\"]\)', 'local("Arial")', css)
    def image(match):
        entry = mirrors.get(match[2])
        return 'var(' + entry['variable'] + ',url("' + EMPTY_IMAGE + '"))' if entry and entry['type'] == 'image/webp' else match[0]
    return re.sub(r'url\(\s*([\'\"]?)([^)\'\"]+)\1\s*\)', image, css)


def add_public_asset_recovery(root, site):
    root, site = Path(root), Path(site)
    mirrors = public_mirrors(root, site)
    code = (root / 'deploy/public-asset-recovery.js').read_text()
    marker = 'const assets=/* public-asset-mirror */{}'
    if code.count(marker) != 1 or re.search(r'</script', code, re.I):
        raise ValueError('Review safe inline public recovery adapter')
    code = code.replace(marker, 'const assets=' + json.dumps(mirrors, separators=(',', ':')))
    if len(code.encode()) > 18000:
        raise ValueError('Public recovery must fit the small first response')
    font = next(path for path, entry in mirrors.items() if entry['type'] == 'font/woff2')
    font_face = '@font-face{font-family:Vazirmatn;src:url("' + font + '") format("woff2");font-weight:100 900;font-display:swap}'
    for page in [site / 'index.html', *sorted((site / 'pages').glob('*.html')), *sorted((site / 'articles').rglob('index.html')), *sorted((site / 'topics').rglob('index.html'))]:
        text = page.read_text()
        if text.count('</body>') != 1:
            raise ValueError('Public recovery requires reviewed document boundary')
        # Inline images retain a normal src. Only CSS art referenced on this page
        # needs a native fallback variable when JavaScript is disabled.
        variables = [entry['variable'] + ':url("' + path + '");' for path, entry in mirrors.items()
                     if entry['type'] == 'image/webp' and 'var(' + entry['variable'] + ',' in text]
        no_script = ':root{' + ''.join(variables) + '}' + font_face
        page.write_text(text.replace('</body>', '<noscript><style>' + no_script + '</style></noscript><script data-public-asset-recovery>' + code + '</script></body>'))
