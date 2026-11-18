"""Build isolated, byte-identical binary/text delivery controls; never used by the site."""
import base64
import hashlib
import json
import re
from pathlib import Path


def build_asset_check(root, site):
    root, site = Path(root), Path(site)
    controls = site / 'delivery-check'
    controls.mkdir()
    specs = [{'label': 'آیکون کوچک', 'path': '/favicon.svg'}]
    for label, source, kind in (
        ('فونت', next((site / 'assets/runtime').glob('Vazirmatn.*.woff2')), 'font'),
        ('پس‌زمینه', site / 'assets/glass/ribbon-day.webp', 'image'),
    ):
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        encoded = controls / (source.stem + '.' + digest[:16] + '.txt')
        encoded.write_bytes(base64.b64encode(data))
        common = {'kind': kind, 'sha256': digest, 'sourceBytes': len(data)}
        specs.append({**common, 'label': label + '؛ مسیر واقعی سایت', 'path': '/' + source.relative_to(site).as_posix()})
        specs.append({**common, 'label': label + '؛ همان داده با انتقال متنی', 'path': '/' + encoded.relative_to(site).as_posix(), 'encoding': 'base64'})
    specs.extend([
        {'label': 'بخش ۸ کیلوبایتی فونت', 'path': '/assets/fonts/Vazirmatn.woff2', 'range': 'bytes=0-8191'},
        {'label': 'آیکون موضوع', 'path': '/assets/optimized/heart.012d14fb0e841a4f.webp', 'kind': 'image'},
    ])
    html = (root / 'deploy/asset-check.html').read_text()
    code = (root / 'deploy/asset-check.js').read_text()
    marker = 'const specs=/* public-delivery-controls */[];'
    if code.count(marker) != 1 or html.count('<!-- public-asset-check-script -->') != 1:
        raise ValueError('Review public delivery diagnostic adapter')
    code = code.replace(marker, 'const specs=' + json.dumps(specs, ensure_ascii=False, separators=(',', ':')) + ';')
    if re.search(r'</script', code, re.I):
        raise ValueError('Unsafe inline public diagnostic')
    (site / 'asset-check.html').write_text(html.replace('<!-- public-asset-check-script -->', '<script>' + code + '</script>'))
    with (site / '_headers').open('a') as handle:
        handle.write('/asset-check\n  Cache-Control: no-cache\n/asset-check.html\n  Cache-Control: no-cache\n/delivery-check/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Robots-Tag: noindex, nofollow\n')
