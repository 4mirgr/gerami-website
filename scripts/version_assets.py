"""Give first-party scripts/styles content hashes so old browser caches cannot mix releases."""
import hashlib
import re
from urllib.parse import urlsplit


def version_assets(site):
    for page in [site / 'index.html', *(site / 'pages').glob('*.html'), *(site / 'admin').glob('*.html')]:
        def replace(match):
            prefix, reference = match.groups()
            url = urlsplit(reference)
            if url.scheme or url.netloc or not url.path.endswith(('.css', '.js')):
                return match.group(0)
            target = (site / url.path.lstrip('/') if url.path.startswith('/') else page.parent / url.path).resolve()
            if not target.is_relative_to(site.resolve()) or not target.is_file():
                return match.group(0)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()[:16]
            return f'{prefix}{url.path}?v={digest}"'
        page.write_text(re.sub(r'((?:src|href)=")([^"\s]+)"', replace, page.read_text()), encoding='utf-8')
