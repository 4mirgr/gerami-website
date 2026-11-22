"""Build small listing previews; approved originals remain byte-identical."""
import hashlib, io, json, re
from pathlib import Path
from PIL import Image, ImageOps


def build_article_previews(site):
    site = Path(site)
    mapping = {}
    articles = json.loads((site / 'content/articles.json').read_text())['articles']
    for article in articles:
        source = article.get('image', '')
        match = re.fullmatch(r'/assets/uploads/editorial-([a-f0-9]{64})\.(jpg|webp)', source)
        if article.get('status') != 'published' or not match or source in mapping:
            continue
        raw = (site / source.lstrip('/')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != match[1]:
            raise ValueError('Approved article image hash mismatch')
        with Image.open(io.BytesIO(raw)) as original:
            if original.width * original.height > 20000000:
                raise ValueError('Article image pixel limit exceeded')
            image = ImageOps.exif_transpose(original).convert('RGBA' if 'A' in original.getbands() else 'RGB')
        encoded = None
        for size in (480, 360, 240):
            preview = image.copy()
            preview.thumbnail((size, size), Image.Resampling.LANCZOS)
            for quality in (70, 55, 40, 25):
                out = io.BytesIO()
                preview.save(out, 'WEBP', quality=quality, method=6)
                if out.tell() <= 10000:
                    encoded = out.getvalue()
                    break
            if encoded is not None:
                break
        if encoded is None:
            raise ValueError('Article preview exceeds transfer budget')
        target = '/assets/optimized/post-' + hashlib.sha256(encoded).hexdigest()[:16] + '.webp'
        (site / target.lstrip('/')).write_bytes(encoded)
        mapping[source] = target
    return mapping
