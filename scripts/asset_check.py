"""Build standalone public delivery comparisons; no account state is accessed."""
import base64
import hashlib
import json
import re
from pathlib import Path
from public_asset_recovery import public_mirrors


def build_asset_check(root, site):
    root, site = Path(root), Path(site)
    controls = site / 'delivery-check'
    controls.mkdir()
    mirrors = public_mirrors(root, site)
    appearance = json.loads((site / 'content/appearance.json').read_text())
    # Retain the two immutable V2 URLs, never encode arbitrary owner uploads.
    for legacy in (next((site / 'assets/runtime').glob('Vazirmatn.*.woff2')), site / 'assets/glass/ribbon-day.webp'):
        data = legacy.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        (controls / (legacy.stem + '.' + digest[:16] + '.txt')).write_bytes(base64.b64encode(data))
    specs = [{'label': 'آیکون کوچک', 'path': '/favicon.svg'}]
    for label, source, kind in (
        ('فونت', next((site / 'assets/runtime').glob('Vazirmatn.*.woff2')), 'font'),
        ('پس‌زمینه', site / appearance['light']['wallpaper'].lstrip('/'), 'image'),
    ):
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        common = {'kind': kind, 'sha256': digest, 'sourceBytes': len(data)}
        path = '/' + source.relative_to(site).as_posix()
        specs.append({**common, 'label': label + '؛ مسیر واقعی سایت', 'path': path})
        if path in mirrors:
            specs.append({**common, 'label': label + '؛ مسیر مستقل GitHub', 'path': mirrors[path]['url']})
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
