"""Publish fingerprinted public assets without changing protected or mounted apps."""
import hashlib,json,re,shutil
from rcssmin import cssmin
from pathlib import Path
from urllib.parse import urlsplit,unquote
from public_asset_recovery import public_mirrors, controlled_public_css


def optimize_public_assets(site):
    site=Path(site).resolve()
    manifest=json.loads((site/'assets/optimized/manifest.json').read_text())
    images=manifest['images']
    for source,target in images.items():
        if not re.fullmatch(r'/assets/optimized/[a-z-]+\.[a-f0-9]{16}\.webp',target) or not (site/target.lstrip('/')).is_file():
            raise ValueError('Invalid optimized public image')
        if hashlib.sha256((site/target.lstrip('/')).read_bytes()).hexdigest()[:16] != target.split('.')[-2]:
            raise ValueError('Optimized image fingerprint does not match its bytes')
    # This hook only changes decorative topic art, never article/clinical images.
    topics=site/'js/topics.mjs'
    urls={Path(source).stem:target for source,target in images.items() if source.startswith('/assets/topics/')}
    original=topics.read_text()
    needle='export const topicImageSources={};'
    if original.count(needle)!=1:raise ValueError('Review topic-image adapter before building')
    topics.write_text(original.replace(needle,'export const topicImageSources='+json.dumps(urls,separators=(',',':'))+';'))
    from article_previews import build_article_previews
    article_images = build_article_previews(site)
    content = site/'js/content.js'
    code = content.read_text()
    hook = 'const articleImageSources={};'
    if code.count(hook) != 1:
        raise ValueError('Review article-preview adapter before building')
    content.write_text(code.replace(hook, 'const articleImageSources='+json.dumps(article_images,separators=(',',':'))+';'))
    (site/'assets/optimized/manifest.json').unlink()
    runtime=site/'assets/runtime';runtime.mkdir()
    fingerprint=lambda data:hashlib.sha256(data).hexdigest()[:16]
    font=site/'assets/fonts/Vazirmatn.woff2'
    font_url='/assets/runtime/Vazirmatn.'+fingerprint(font.read_bytes())+'.woff2'
    shutil.copy2(font,site/font_url.lstrip('/'))
    mapping={font:font_url}
    mirrors=public_mirrors(Path(__file__).resolve().parent.parent,site)
    visiting=set()
    sources=sorted([*site.glob('js/*.js'),*site.glob('js/*.mjs'),*site.glob('css/*.css')])

    def resolve(reference,owner):
        url=urlsplit(reference)
        if url.scheme or url.netloc or not url.path or url.path.startswith('data:'):return None
        path=(site/url.path.lstrip('/') if url.path.startswith('/') else owner.parent/unquote(url.path)).resolve()
        return path if path.is_relative_to(site) and path.is_file() else None

    def emit(path):
        if path in mapping:return mapping[path]
        if path in visiting:raise ValueError('Public module import cycle needs review')
        visiting.add(path);text=path.read_text()
        if path.suffix in ('.js','.mjs'):
            def dependency(match):
                target=resolve(match[2],path)
                if target not in sources:return match[0]
                return match[1]+emit(target)+match[3]
            text=re.sub(r"((?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['\"])(\.[^'\"]+)(['\"])",dependency,text)
            # Source modules live under /js; emitted ones live under /assets/runtime.
            text=re.sub(r"new URL\(['\"]\.\./['\"],\s*import\.meta\.url\)","new URL('/',import.meta.url)",text)
            text=re.sub(r"new URL\(['\"]\.\./['\"]\s*\+\s*path,\s*import\.meta\.url\)","new URL('/'+path,import.meta.url)",text)
        else:
            # Validate original bytes before compaction can remove an unsafe comment.
            if re.search(r'</style|@import\b',text,re.I):
                raise ValueError('Public stylesheet requires a reviewed safe inline adapter')
            def css_url(match):
                reference=match[2];target=resolve(reference,path)
                if not target:return match[0]
                url=images.get('/'+target.relative_to(site).as_posix()) or mapping.get(target) or '/'+target.relative_to(site).as_posix()
                return 'url("'+url+'")'
            text=re.sub(r'url\(\s*([\'\"]?)([^)\'\"]+)\1\s*\)',css_url,text)
            text=cssmin(controlled_public_css(text,mirrors),keep_bang_comments=True)
        data=text.encode();url='/assets/runtime/'+path.stem+'.'+fingerprint(data)+path.suffix
        (site/url.lstrip('/')).write_bytes(data);mapping[path]=url;visiting.remove(path);return url

    for path in sources:emit(path)
    pages=[site/'index.html',*sorted((site/'pages').glob('*.html')),*sorted((site/'topics').rglob('*.html')),*sorted((site/'articles').rglob('*.html'))]
    preloads=[mapping[p] for p in sources if p.suffix=='.mjs' and p.name not in ('account-page.mjs','toolbar-search.mjs','search-index.mjs')]
    inline_css_max_bytes=0
    for page in pages:
        text=page.read_text()
        if page == site/'index.html':
            # Static links, titles and previews paint immediately. The interactive
            # homepage shares one cacheable snapshot for all managed settings.
            snapshot_pattern = r'<script id="site-public-data" type="application/json">(.*?)</script>'
            snapshot_match = re.search(snapshot_pattern, text, flags=re.S)
            if snapshot_match:
                snapshot = json.loads(snapshot_match[1])
                # Keep source JSON as text (including its HTML-safe escapes).
                # A failed bundle leaves the normal per-document fallback usable.
                payload = json.dumps(snapshot_match[1], ensure_ascii=False)
                bundle = ("document.getElementById('site-public-data').textContent=" + payload + ";").encode()
                filename = 'home-documents.' + fingerprint(bundle) + '.js'
                (runtime / filename).write_bytes(bundle)
                # The inline carrier recovery runs before deferred scripts.
                snapshot['documents'] = {key: value for key, value in snapshot['documents'].items() if key == 'content/appearance.json'}
                inline = '<script id="site-public-data" type="application/json">' + json.dumps(snapshot, ensure_ascii=True, separators=(',', ':')).replace('<', r'\u003c').replace('>', r'\u003e').replace('&', r'\u0026') + '</script>'
                text = text.replace(snapshot_match[0], inline, 1)
                text = text.replace('</title>', '</title><script defer src="/assets/runtime/' + filename + '"></script>', 1)
            text = re.sub(r'(<img class="post-cover"[^>]* src=")([^"]+)(")', lambda m: m[1]+article_images.get(m[2],m[2])+m[3], text)
        if page.is_relative_to(site/'articles'):
            def responsive_cover(match):
                original = match[1]
                preview = article_images.get(original)
                if not preview:
                    return match[0]
                from PIL import Image
                with Image.open(site/preview.lstrip('/')) as thumbnail:
                    width,height=thumbnail.size
                image = match[0].replace('<img ', f'<img width="{width}" height="{height}" ', 1)
                return '<picture><source media="(max-width: 540px)" srcset="'+preview+'">'+image+'</picture>'
            text = re.sub(r'<img src="([^"]+)"[^>]+fetchpriority="high"[^>]*>', responsive_cover, text)
        def reference(match):
            target=resolve(match[2],page)
            url=mapping.get(target)
            if target and '/'+target.relative_to(site).as_posix() in images:url=images['/'+target.relative_to(site).as_posix()]
            return match[1]+url+'"' if url else match[0]
        text=re.sub(r'((?:src|href)=")([^"\s]+)"',reference,text)
        # A synchronous theme script after a stylesheet also waits for that
        # stylesheet: one stalled CSS request can leave even the body unparsed.
        # Embed the exact reviewed public CSS in place, retaining its cascade and
        # fingerprinted font/image URLs. Other app/admin documents stay untouched.
        css_bytes=0
        def inline_style(match):
            nonlocal css_bytes
            href=re.search(r'\bhref="([^"]+)"',match[0])
            target=resolve(href[1],page) if href else None
            if not target or target.parent!=runtime or target.suffix!='.css':
                raise ValueError('Public stylesheet requires a reviewed local inline adapter')
            css=target.read_text()
            if re.search(r'</style|@import\b',css,re.I) or re.search(r'\bmedia\s*=',match[0],re.I):
                raise ValueError('Public stylesheet requires a reviewed safe inline adapter')
            css_bytes+=len(css.encode())
            if css_bytes>98304:raise ValueError('Public inline CSS exceeds the first-response budget')
            return '<style data-public-stylesheet="/'+target.relative_to(site).as_posix()+'">'+css+'</style>'
        text=re.sub(r'<link\b(?=[^>]*\brel="stylesheet")[^>]*>',inline_style,text,flags=re.I)
        text=re.sub(r'(<style\b[^>]*>)(.*?)(</style>)',lambda m:m[1]+controlled_public_css(m[2],mirrors)+m[3],text,flags=re.S|re.I)
        text=re.sub(r'<link\b[^>]*>',lambda m:'' if 'as="font"' in m[0] and font_url in m[0] else m[0],text)
        def lazy_art(match):
            tag=match[0];src=re.search(r'\bsrc="([^"]+)"',tag)
            if not src or urlsplit(src[1]).path not in mirrors:return tag
            tag=re.sub(r'\sloading="[^"]*"','',tag)
            return tag[:-1]+' loading="lazy">'
        text=re.sub(r'<img\b[^>]*>',lazy_art,text,flags=re.I)
        inline_css_max_bytes=max(inline_css_max_bytes,css_bytes)
        text=text.replace('</head>',''.join('<link rel="modulepreload" href="'+url+'">' for url in preloads)+'</head>',1)
        page.write_text(text)
    with (site/'_headers').open('a') as handle:
        handle.write('/assets/runtime/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/optimized/*\n  Cache-Control: public, max-age=31536000, immutable\n')
    return {'images':manifest['bytes'],'runtime_files':len(mapping),'public_pages':len(pages),'render_blocking_stylesheets':0,'inline_css_max_bytes':inline_css_max_bytes}
