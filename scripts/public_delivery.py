"""Deliver the reviewed public design without font/image/module HTTP fan-out.

This adapter only accepts the site's small, named-import ESM graph. Unsupported
syntax fails the build; protected admin and independently mounted apps never enter
this adapter. Original files remain available for no-JS and large-asset fallbacks.
"""
import base64
import gzip
import hashlib
import html
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

MIMES={'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'}
IMPORT=re.compile(r'^import\s+\{([^}]+)\}\s+from\s+([\'"])([^\'"]+)\2\s*;\s*$',re.M)
EXPORT=re.compile(r'^export\s+(?:(?:async\s+)?function|const|class)\s+([A-Za-z_$][\w$]*)',re.M)


def safe_json(value):
    text=json.dumps(value,ensure_ascii=False,separators=(',',':'))
    for char in ('<','>','&','\u2028','\u2029'):
        text=text.replace(char,'\\u'+format(ord(char),'04x'))
    return text


def deliver_page(site,page,module_urls,font_url,topic_urls):
    site=Path(site);text=page.read_text();images={};variables={};encoded={};asset_bytes=0
    def asset_data(path):
        nonlocal asset_bytes
        reference=urlsplit(path)
        if reference.scheme or reference.netloc:return None
        path=reference.path
        if path in encoded:return encoded[path]
        target=(site/path.lstrip('/')).resolve()
        if not path.startswith('/assets/') or not target.is_relative_to(site/'assets') or not target.is_file() or target.suffix.lower() not in MIMES:return None
        data=target.read_bytes()
        if len(data)>131072 or asset_bytes+len(data)>524288:return None
        asset_bytes+=len(data)
        encoded[path]='data:'+MIMES[target.suffix.lower()]+';base64,'+base64.b64encode(data).decode()
        return encoded[path]
    def image(path):
        if urlsplit(path).scheme or urlsplit(path).netloc:return None
        path=urlsplit(path).path
        data=asset_data(path)
        if data:images[path]=data
        return data
    def css_reference(match):
        path=match[2]
        if path==font_url:
            data=asset_data(path)
            if not data:raise ValueError('Reviewed public font exceeds the embedded-asset budget')
            return 'url("'+data+'")'
        if not image(path):return match[0]
        name='--site-media-'+hashlib.sha256(path.encode()).hexdigest()[:12]
        variables[path]=name
        return 'var('+name+',none)'
    text=re.sub(r'url\(\s*([\'"]?)(/assets/[^)\'\"]+)\1\s*\)',css_reference,text)
    # The same variable font is already in @font-face, not a second HTTP preload.
    text=re.sub(r'<link\b(?=[^>]*\bas="font")(?=[^>]*\bhref="'+re.escape(font_url)+r'")[^>]*>','',text)
    text=re.sub(r'<link\b(?=[^>]*\brel="modulepreload")[^>]*>','',text)

    def img_tag(match):
        tag=match[0];src=re.search(r'\bsrc="([^"]+)"',tag)
        if not src or not image(src[1]):return tag
        for source in re.findall(r'\bdata-theme-(?:light|dark)="([^"]+)"',tag):image(source)
        # Templates prevent the parser from starting an uncancellable image
        # request. No-JS parsing sees exactly one real image, not duplicate logos.
        template=tag.replace(src[0],'data-site-asset-src="'+src[1]+'"',1)
        return '<template data-public-image>'+template+'</template><noscript>'+tag+'</noscript>'
    text=re.sub(r'<img\b[^>]*>',img_tag,text)
    if page.name in ('index.html','blog.html'):
        for path in topic_urls:image(path)
    def icon_tag(match):
        tag=match[0];href=re.search(r'\bhref="([^"]+)"',tag)
        if not href:return tag
        if urlsplit(href[1]).scheme or urlsplit(href[1]).netloc:return tag
        url=urlsplit(href[1]).path
        path='/' +(page.parent/url).relative_to(site).as_posix() if not url.startswith('/') else url
        data=asset_data(path)
        return tag.replace(href[0],'href="'+data+'"',1) if data else tag
    text=re.sub(r'<link\b(?=[^>]*\brel="icon")[^>]*>',icon_tag,text)

    modules={};visiting=set()
    def adapt(code):
        def dependency(match):
            names=[name.strip() for name in match[1].split(',')]
            if any(not re.fullmatch(r'[A-Za-z_$][\w$]*',name) for name in names) or match[3] not in module_urls:
                raise ValueError('Review the public named-import adapter before building')
            declared=EXPORT.findall((site/match[3].lstrip('/')).read_text())
            if any(name not in declared for name in names):raise ValueError('Review the public named-export adapter before building')
            add_module(match[3])
            return 'const {'+','.join(names)+'}=modules['+json.dumps(match[3])+'];'
        code=IMPORT.sub(dependency,code)
        code=code.replace("new URL('/'+path,import.meta.url)","new URL('/'+path,location.href)")
        if re.search(r'^\s*import\b|import\.meta|</script',code,re.M|re.I):
            raise ValueError('Public runtime requires a reviewed safe inline adapter')
        return code
    def add_module(url):
        if url in modules:return
        if url in visiting:raise ValueError('Public module cycle requires review')
        visiting.add(url);code=(site/url.lstrip('/')).read_text()
        exports=EXPORT.findall(code);code=adapt(code)
        code=re.sub(r'^export\s+(?=(?:(?:async\s+)?function|const|class)\s+[A-Za-z_$])','',code,flags=re.M)
        if re.search(r'^\s*export\b',code,re.M):raise ValueError('Review the public export adapter before building')
        if '/topics.' in url:
            needle="image.src=topicImageSources[topicArt[name]]||'/assets/topics/'+topicArt[name]+'.webp';"
            if code.count(needle)!=1:raise ValueError('Review embedded topic art adapter')
            code=code.replace(needle,"image.src=embeddedURL(topicImageSources[topicArt[name]]||'/assets/topics/'+topicArt[name]+'.webp');")
        modules[url]='modules['+json.dumps(url)+']=(()=>{'+code+'\nreturn {'+','.join(exports)+'};})();'
        visiting.remove(url)
    entries=[]
    def script_tag(match):
        tag=match[0];src=re.search(r'\bsrc="([^"]+)"',tag)
        if not src:return tag
        path=urlsplit(src[1]).path
        if not path.startswith('/assets/runtime/') and path!='/legacy-intmed-links.js':
            raise ValueError('Review an external public script before inlining')
        target=site/path.lstrip('/');code=adapt(target.read_text())
        if 'site-customizer.' in path:
            needle='const source=url=>previewAssets[url]||url;'
            if code.count(needle)!=1:raise ValueError('Review embedded owner-art adapter')
            code=code.replace(needle,'const source=url=>previewAssets[url]||embeddedURL(url);')
        if 'content.' in path:
            needle='const imageSource=src=>previewAssets[src]||src;'
            if code.count(needle)!=1:raise ValueError('Review embedded article-art adapter')
            code=code.replace(needle,'const imageSource=src=>previewAssets[src]||embeddedURL(src);')
        entries.append(('void (async()=>{'+code+'\n})();') if re.search(r'\btype="module"',tag) else '(()=>{'+code+'\n})();')
        return ''
    text=re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*</script>',script_tag,text)
    startup="""(()=>{
const embeddedAssets=JSON.parse(document.getElementById('site-embedded-assets').textContent);
const embeddedURL=path=>embeddedAssets[path]||path;
const cssImages=CSS_IMAGES;
for(const [path,name] of Object.entries(cssImages))document.documentElement.style.setProperty(name,'url("'+embeddedURL(path)+'")');
for(const template of document.querySelectorAll('template[data-public-image]')){
 const img=template.content.firstElementChild;
 img.src=embeddedURL(img.getAttribute('data-site-asset-src'));img.removeAttribute('data-site-asset-src');
 for(const attribute of ['data-theme-light','data-theme-dark'])if(img.hasAttribute(attribute))img.setAttribute(attribute,embeddedURL(img.getAttribute(attribute)));
 template.replaceWith(img);
}
const modules=Object.create(null);
""".replace('CSS_IMAGES',safe_json(variables))+'\n'.join(modules.values())+'\n'+'\n'.join(entries)+'\n})();'
    # Compile-check the actual delivered program, not just the original modules.
    checked=subprocess.run(['node','--check','--input-type=commonjs'],input=startup,text=True,capture_output=True)
    if checked.returncode:raise ValueError('Public delivery script failed syntax validation: '+checked.stderr[:500])
    noscript=''.join(name+':url("'+html.escape(path,quote=True)+'");' for path,name in variables.items())
    text=text.replace('</head>','<noscript><style>:root{'+noscript+'}</style></noscript></head>',1)
    payload='<script id="site-embedded-assets" type="application/json">'+safe_json(images)+'</script><script id="site-public-runtime">'+startup+'</script>'
    text=text.replace('</body>',payload+'</body>',1)
    raw=text.encode();compressed=len(gzip.compress(raw))
    if len(raw)>1500000 or compressed>524288:raise ValueError('Public first-response delivery exceeds its bounded document budget')
    page.write_bytes(raw)
    return {'raw_bytes':len(raw),'gzip_bytes':compressed,'embedded_asset_bytes':asset_bytes,'embedded_images':len(images)}
