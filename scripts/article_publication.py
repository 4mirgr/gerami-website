"""Build crawlable public articles; drafts never enter the deployed article feed."""
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from validate_content import remote_article_image

ORIGIN = 'https://drgerami-md.ir'
escape = lambda value: html.escape(str(value), quote=True)


def safe_link(value):
    url = urlsplit(value)
    return bool((url.scheme == 'https' and url.hostname and not url.username and not url.password)
                or (value.startswith('/') and not value.startswith('//') and '\\' not in value))


def inline(text):
    pattern = re.compile(r'\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`')
    chunks, offset = [], 0
    for match in pattern.finditer(text):
        chunks.append(escape(text[offset:match.start()]))
        if match[1] and safe_link(match[2]):
            chunks.append(f'<a href="{escape(match[2])}" rel="noopener noreferrer">{escape(match[1])}</a>')
        elif match[3]:
            chunks.append('<strong>'+escape(match[3])+'</strong>')
        elif match[4]:
            chunks.append('<code>'+escape(match[4])+'</code>')
        else:
            chunks.append(escape(match[0]))
        offset = match.end()
    return ''.join(chunks)+escape(text[offset:])


def markdown(source):
    result, listing = [], None
    for line in source.splitlines():
        bullet = re.match(r'^\s*(?:[-*] |\d+\. )(.*)$', line)
        if bullet:
            if not listing:
                result.append('<ul>'); listing = True
            result.append('<li>'+inline(bullet[1])+'</li>')
            continue
        if listing:
            result.append('</ul>'); listing = None
        if not line.strip():
            continue
        heading = re.match(r'^(#{1,4}) (.*)$', line)
        tag = 'h'+str(min(5,len(heading[1])+1)) if heading else 'p'
        result.append('<'+tag+'>'+inline(heading[2] if heading else line)+'</'+tag+'>')
    if listing:
        result.append('</ul>')
    return '\n'.join(result)


def article_copy(item, preferred='fa'):
    for language in (preferred, 'en' if preferred == 'fa' else 'fa'):
        if item.get('title_'+language, '').strip() and item.get('body_'+language, '').strip():
            return {'language': language, 'title': item['title_'+language], 'body': item['body_'+language]}
    raise ValueError('Published article needs one complete title/body language pair')


def description(item, language):
    text = re.sub(r'[#*`\[\]<>]', '', article_copy(item, language)['body'])
    return ' '.join(text.split())[:160]


def translate(tag, fa, en, **attrs):
    attributes = ''.join(f' {key}="{escape(value)}"' for key,value in attrs.items())
    return f'<{tag}{attributes} data-fa="{escape(fa)}" data-en="{escape(en)}">{escape(fa)}</{tag}>'


def article_page(template, item):
    url = ORIGIN+'/articles/'+item['slug']+'/'
    copies = {language: article_copy(item, language) for language in ('fa', 'en')}
    primary = copies['fa']
    image=item.get('image','')
    valid_image=remote_article_image(image) or isinstance(image,str) and bool(re.fullmatch(r'/assets/uploads/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g|avif|gif|svg)',image,re.I)) and '..' not in image
    image_url=urljoin(ORIGIN,image) if valid_image else ''
    # Blog templates use relative assets. Resolve them before nesting the page.
    template = re.sub(r'\b(href|src)="([^"\s]+)"', lambda m: m[0] if m[2].startswith(('#','/')) or urlsplit(m[2]).scheme
                      else m[1]+'="'+escape(urljoin('/pages/blog.html',m[2]))+'"', template)
    template = re.sub(r' data-(?:content|link)-key="[^"]+"', '', template)
    titles = [copies['fa']['title']+' | دکتر گرامی', copies['en']['title']+' | Dr. Gerami']
    template = re.sub(r'<title\b[^>]*>.*?</title>',lambda _:translate('title',*titles),template,count=1,flags=re.S)
    template = re.sub(r'<meta name="description"[^>]*>',lambda _:'<meta name="description" content="'+escape(description(item,'fa'))+'" data-fa="'+escape(description(item,'fa'))+'" data-en="'+escape(description(item,'en'))+'">',template,count=1)
    template = re.sub(r'<link rel="canonical"[^>]*>',lambda _:'<link rel="canonical" href="'+url+'">',template,count=1)
    schema = {'@context':'https://schema.org','@type':'Article','headline':primary['title'],
              'description':description(item,'fa'),'url':url,'mainEntityOfPage':url,'inLanguage':primary['language'],
              'datePublished':item['published_at'],'dateModified':item.get('reviewed_at') or item['published_at'],
              'citation':[s['url'] for s in item.get('sources',[])]}
    if item.get('author', '').strip():
        schema['author'] = {'@type':'Person','name':item['author']}
    if image_url:
        schema['image']=image_url
    metadata = ('<meta property="og:type" content="article"><meta property="og:url" content="'+url+'">'
                '<meta property="og:title" content="'+escape(primary['title'])+'">'
                '<meta property="og:description" content="'+escape(description(item,'fa'))+'">'
                '<script type="application/ld+json">'+json.dumps(schema,ensure_ascii=False).replace('<','\\u003c')+'</script>'
                '<script type="module" src="/js/article-page.mjs"></script>')
    if image_url:
        metadata+='<meta property="og:image" content="'+escape(image_url)+'">'
    template = template.replace('</head>',metadata+'\n</head>',1)
    sources = ''.join('<li><a rel="noopener noreferrer" href="'+escape(s['url'])+'">'+escape(s['title'])+'</a></li>' for s in item.get('sources',[]) if safe_link(s['url']))
    author = '<span>'+escape(item['author'])+'</span>' if item.get('author', '').strip() else ''
    reviewed = '<span>'+translate('span','بازبینی: ','Reviewed: ')+'<time dir="ltr" datetime="'+escape(item['reviewed_at'])+'">'+escape(item['reviewed_at'])+'</time></span>' if item.get('reviewed_at') else ''
    bodies = ''.join('<div class="article-body" data-article-language="'+language+'" lang="'+copy['language']+'" dir="'+('rtl' if copy['language']=='fa' else 'ltr')+'"'+(' hidden' if language=='en' else '')+'>'+markdown(copy['body'])+'</div>' for language,copy in copies.items())
    cover='<img class="article-cover-image" src="'+escape(image)+'" alt="'+escape(primary['title'])+'" data-alt-fa="'+escape(copies['fa']['title'])+'" data-alt-en="'+escape(copies['en']['title'])+'" data-copy-fa="'+copies['fa']['language']+'" data-copy-en="'+copies['en']['language']+'" lang="'+primary['language']+'" referrerpolicy="no-referrer" loading="lazy" style="display:block;max-width:100%;height:auto;max-height:480px;object-fit:contain;margin-block:24px">' if image_url else ''
    main = ('<main id="main" tabindex="-1"><article class="container section" data-article-page="'+escape(item['slug'])+'" data-article-category="'+escape(item.get('category', ''))+'">'
            '<a href="/pages/blog.html">'+translate('span','مطالب آموزشی','Education')+'</a>'
            +translate('h1',copies['fa']['title'],copies['en']['title'], **{'data-copy-fa':copies['fa']['language'],'data-copy-en':copies['en']['language'],'lang':primary['language'],'dir':'rtl' if primary['language']=='fa' else 'ltr'})
            +'<p class="article-meta">'+author+'<time dir="ltr" datetime="'+escape(item['published_at'])+'">'+escape(item['published_at'])+'</time>'+reviewed+'</p>'
            +cover+bodies
            +(translate('h2','منابع','Sources')+'<ul>'+sources+'</ul>' if sources else '')
            +'<aside class="notice">'+translate('p','این مطلب آموزشی است؛ تصمیم درمانی به ارزیابی فردی پزشک نیاز دارد.','Educational information; treatment decisions require an individual medical assessment.')
            +'<div class="actions"><a class="button" href="/account/?mode=signup#newsletter">'+translate('span','عضویت و خبرنامهٔ اختیاری','Account and optional newsletter')+'</a>'
            +'<a class="button button-secondary" href="/account/?next=%2Fdash%2Fportal%2F">'+translate('span','ورود به پرتال و تکمیل پرونده','Open your patient portal')+'</a></div></aside></article></main>')
    return re.sub(r'<main\b.*?</main>',lambda _:main,template,count=1,flags=re.S)


def generate(output):
    data = json.loads((output/'content/articles.json').read_text())
    published = [item for item in data['articles'] if item['status']=='published']
    for item in published:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',item['slug']):
            raise ValueError('Unsafe public article slug')
    template = (output/'pages/blog.html').read_text()
    for item in published:
        target=output/'articles'/item['slug']/'index.html'
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(article_page(template,item),encoding='utf-8')
    (output/'content/articles.json').write_text(json.dumps({'articles':published},ensure_ascii=False)+'\n',encoding='utf-8')
    ordered = sorted(published,key=lambda i:(i['published_at'],i['slug']),reverse=True)
    for file in [output/'index.html',output/'pages/blog.html']:
        entries=ordered[:3] if file.name=='index.html' else ordered
        if entries:
            links=''.join('<li><a href="/articles/'+item['slug']+'/" dir="'+('rtl' if article_copy(item)['language']=='fa' else 'ltr')+'">'+escape(article_copy(item)['title'])+'</a></li>' for item in entries)
            page_html=re.sub(r'<article\b[^>]*class="[^"]*\barticle-topic\b[^"]*"[^>]*>.*?</article>', '', file.read_text(), flags=re.S)
            html=page_html.replace('</main>','<section class="container section" data-static-articles><h2>مطالب آموزشی</h2><ul>'+links+'</ul></section></main>',1)
            file.write_text(html,encoding='utf-8')
    urls=[ORIGIN+'/']
    for file in sorted((output/'pages').glob('*.html')):
        if file.name=='studio-preview.html' or re.search(r'<meta name="robots"[^>]*noindex',file.read_text()):
            continue
        urls.append(ORIGIN+'/pages/'+file.name)
    urls += [ORIGIN+'/articles/'+item['slug']+'/' for item in ordered]
    namespace='http://www.sitemaps.org/schemas/sitemap/0.9'
    ET.register_namespace('',namespace)
    root=ET.Element('{'+namespace+'}urlset')
    for url in urls:
        node=ET.SubElement(root,'{'+namespace+'}url')
        ET.SubElement(node,'{'+namespace+'}loc').text=url
    (output/'sitemap.xml').write_bytes(ET.tostring(root,encoding='utf-8',xml_declaration=True))
    (output/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nDisallow: /dash\nDisallow: /aus\nDisallow: /api/\nDisallow: /newsletter/\nSitemap: '+ORIGIN+'/sitemap.xml\n')
