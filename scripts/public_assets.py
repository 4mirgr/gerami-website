"""Publish fingerprinted public assets without changing protected or mounted apps."""
import hashlib,json,re,shutil
from pathlib import Path
from urllib.parse import urlsplit,unquote


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
    (site/'assets/optimized/manifest.json').unlink()
    runtime=site/'assets/runtime';runtime.mkdir()
    fingerprint=lambda data:hashlib.sha256(data).hexdigest()[:16]
    font=site/'assets/fonts/Vazirmatn.woff2'
    font_url='/assets/runtime/Vazirmatn.'+fingerprint(font.read_bytes())+'.woff2'
    shutil.copy2(font,site/font_url.lstrip('/'))
    mapping={font:font_url}
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
            text=re.sub(r"((?:\bfrom\s*|\bimport\s*)['\"])(\.[^'\"]+)(['\"])",dependency,text)
            # Source modules live under /js; emitted ones live under /assets/runtime.
            text=re.sub(r"new URL\(['\"]\.\./['\"],\s*import\.meta\.url\)","new URL('/',import.meta.url)",text)
            text=re.sub(r"new URL\(['\"]\.\./['\"]\s*\+\s*path,\s*import\.meta\.url\)","new URL('/'+path,import.meta.url)",text)
        else:
            def css_url(match):
                reference=match[2];target=resolve(reference,path)
                if not target:return match[0]
                url=images.get('/'+target.relative_to(site).as_posix()) or mapping.get(target) or '/'+target.relative_to(site).as_posix()
                return 'url("'+url+'")'
            text=re.sub(r'url\(\s*([\'\"]?)([^)\'\"]+)\1\s*\)',css_url,text)
        data=text.encode();url='/assets/runtime/'+path.stem+'.'+fingerprint(data)+path.suffix
        (site/url.lstrip('/')).write_bytes(data);mapping[path]=url;visiting.remove(path);return url

    for path in sources:emit(path)
    pages=[site/'index.html',*sorted((site/'pages').glob('*.html'))]
    preloads=[mapping[p] for p in sources if p.suffix=='.mjs']
    for page in pages:
        text=page.read_text()
        def reference(match):
            target=resolve(match[2],page)
            url=mapping.get(target)
            if target and '/'+target.relative_to(site).as_posix() in images:url=images['/'+target.relative_to(site).as_posix()]
            return match[1]+url+'"' if url else match[0]
        text=re.sub(r'((?:src|href)=")([^"\s]+)"',reference,text)
        text=text.replace('</head>',''.join('<link rel="modulepreload" href="'+url+'">' for url in preloads)+'</head>',1)
        page.write_text(text)
    with (site/'_headers').open('a') as handle:
        handle.write('/assets/runtime/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/optimized/*\n  Cache-Control: public, max-age=31536000, immutable\n')
    return {'images':manifest['bytes'],'runtime_files':len(mapping),'public_pages':len(pages)}
