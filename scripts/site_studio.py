"""Validate owner-editable settings and generate safe static custom pages."""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def validate(root=ROOT):
    # The browser and publishing gates run the exact same schema validator.
    script = """
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.argv[1];
const {managedPaths,validateSite}=await import(pathToFileURL(root+'/js/site-model.mjs'));
validateSite(Object.fromEntries(managedPaths.map(path=>[path,JSON.parse(readFileSync(root+'/'+path,'utf8'))])));
"""
    subprocess.run(['node', '--input-type=module', '-e', script, str(root)], check=True, capture_output=True, text=True)
    appearance = json.loads((root / 'content/appearance.json').read_text())
    extra = json.loads((root / 'content/extra-pages.json').read_text())
    for group in [appearance['light'], appearance['dark'], *extra['pages']]:
        for key in ('logo', 'wallpaper', 'background', 'image'):
            value = group.get(key)
            if value:
                target = (root / value.lstrip('/')).resolve()
                if not target.is_relative_to((root / 'assets').resolve()) or not target.is_file():
                    raise ValueError('Site Studio image does not exist: ' + value)
    published = {page['slug'] for page in extra['pages'] if page['published']}
    for path in sorted((root / 'content/pages').glob('*.json')):
        ident = path.stem
        template = root / ('index.html' if ident == 'home' else 'pages/' + ident + '.html')
        keys = set(re.findall(r'data-content-key="([^"]+)"', template.read_text()))
        if set(json.loads(path.read_text())['blocks']) != keys:
            raise ValueError('Page text keys differ from the template: ' + ident)
        link_keys = set(re.findall(r'data-link-key="([^"]+)"', template.read_text()))
        if set(json.loads(path.read_text())['links']) != link_keys:
            raise ValueError('Page link keys differ from the template: ' + ident)
    def links(items):
        for item in items:
            if item['url'].startswith('/pages/'):
                target = item['url'].split('?', 1)[0].split('#', 1)[0]
                if not (root / target.lstrip('/')).is_file() and Path(target).stem not in published:
                    raise ValueError('Menu links to a missing or unpublished page: ' + target)
            links(item.get('children', []))
    navigation = json.loads((root / 'content/navigation.json').read_text())
    links(navigation['header'])
    links(navigation['footer'])


def render_page(template, page):
    text = re.sub(r' data-(?:content|link)-key="[^"]+"', '', template)
    text = text.replace('data-page="services"', 'data-page="extra" data-extra-page="' + page['slug'] + '"')
    escape = lambda value: html.escape(value, quote=True)
    text = re.sub(r'<title[^>]*>.*?</title>', lambda _: '<title>' + escape(page['title_fa']) + '</title>', text, count=1)
    text = re.sub(r'<meta name="description"[^>]*>', lambda _: '<meta name="description" content="' + escape(page['description_fa']) + '">', text, count=1)
    text = re.sub(r'<link rel="canonical"[^>]*>', '<link rel="canonical" href="https://drgerami-md.ir/pages/' + page['slug'] + '.html">', text, count=1)
    image = '<img src="' + escape(page['image']) + '" alt="">' if page.get('image') else ''
    main = '<main id="main" tabindex="-1"><section class="page-intro"><div class="container"><h1>' + escape(page['title_fa']) + '</h1></div></section><section class="container section" data-extra-body>' + image + '<p>' + escape(page['body_fa']).replace('\n', '<br>') + '</p></section></main>'
    return re.sub(r'<main\b.*?</main>', lambda _: main, text, count=1, flags=re.S)


def generate(root, output):
    apply_static_settings(root, output)
    template = (root / 'pages/services.html').read_text()
    data = json.loads((root / 'content/extra-pages.json').read_text())
    for page in data['pages']:
        if page['published']:
            (output / 'pages' / (page['slug'] + '.html')).write_text(bake_settings(root, render_page(template, page), 'extra'))
    preview = dict(slug='studio-preview', title_fa='پیش‌نمایش صفحه', description_fa='', body_fa='', image='')
    text = render_page(template, preview).replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
    (output / 'pages/studio-preview.html').write_text(bake_settings(root, text, 'extra'))


def topic_markup(root, directory=False):
    catalog = json.loads((root / 'content/topics.json').read_text())
    articles = json.loads((root / 'content/articles.json').read_text())['articles']
    escape = lambda value: html.escape(str(value), quote=True)
    label = lambda tag, fa, en: '<' + tag + ' data-fa="' + escape(fa) + '" data-en="' + escape(en) + '">' + escape(fa) + '</' + tag + '>'
    result = ''
    for topic in catalog['topics']:
        ident = topic['id']
        tag = 'article' if directory else 'li'
        result += '<' + tag + ' class="topic-tile glass-surface" data-topic-id="' + escape(ident) + '">'
        result += '<a class="topic-link"' + ('' if directory else ' data-topic-card="' + escape(ident) + '"') + ' href="/pages/blog.html?topic=' + escape(ident) + '">'
        result += label('h3', topic['fa'], topic['en'])
        if not directory:
            result += label('p', topic['description_fa'], topic['description_en'])
        ids = {ident, *(child['id'] for child in topic['children'])}
        count = sum(1 for item in articles if item.get('status') == 'published' and item.get('topic') in ids)
        if count:
            result += label('small', str(count) + ' مطلب', str(count) + ' posts')
        result += '</a>'
        if directory:
            result += '<div class="subtopic-links">'
            for child in topic['children']:
                result += '<a href="/pages/blog.html?topic=' + escape(child['id']) + '">' + label('span', child['fa'], child['en']) + '</a>'
            result += '</div>'
        result += '</' + tag + '>'
    if not catalog['topics']:
        result += '<' + ('p' if directory else 'li') + '>موضوعات آموزشی در حال تنظیم هستند.</' + ('p' if directory else 'li') + '>'
    return result


def home_bootstrap(root, text):
    # These documents are already public. Freeze only a bounded home-page subset
    # in the same deployment as its HTML; large feeds keep the network fallback.
    snapshot = {'version': 1, 'documents': {}}
    paths = ('content/appearance.json', 'content/navigation.json', 'content/pages/home.json',
             'content/site.json', 'content/topics.json', 'content/articles.json')
    def serialize(value):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        for char in ('<', '>', '&', '\u2028', '\u2029'):
            value = value.replace(char, '\\u' + format(ord(char), '04x'))
        return value
    for path in paths:
        value = json.loads((root / path).read_text())
        snapshot['documents'][path] = value
        if len(serialize(snapshot).encode('utf-8')) > 65536:
            del snapshot['documents'][path]
    text = re.sub(r'<script id="site-public-data" type="application/json">.*?</script>', '', text, flags=re.S)
    data = '<script id="site-public-data" type="application/json">' + serialize(snapshot) + '</script>'
    text = text.replace('</head>', data + '</head>', 1)
    # Exact repository-owned theme code stays before paint without a blocking
    # HTTP round trip. UI handlers and storage/media preferences stay identical.
    theme = root / 'js/theme.js'
    if theme.is_file():
        code = theme.read_text()
        if re.search(r'</script', code, re.I):
            raise ValueError('Theme script requires a reviewed safe inline adapter')
        text = re.sub(r'<script src="(?:/)?js/theme\.js(?:\?[^"<>]*)?"></script>',
                      lambda _: '<script id="site-theme-bootstrap">' + code + '</script>', text, count=1)
    return text


def bake_settings(root, text, ident):
    if ident == 'home':
        for marker, directory in [('topic-rail', False), ('topic-directory', True)]:
            text = re.sub(r'<!--' + marker + r':start-->.*?<!--' + marker + r':end-->', lambda _: '<!--' + marker + ':start-->' + topic_markup(root, directory) + '<!--' + marker + ':end-->', text, flags=re.S)
    escape = lambda value: html.escape(str(value), quote=True)
    appearance = json.loads((root / 'content/appearance.json').read_text())
    navigation = json.loads((root / 'content/navigation.json').read_text())
    content_path = root / ('content/pages/' + ident + '.json')
    data = json.loads(content_path.read_text()) if content_path.exists() else {'blocks': {}, 'links': {}}

    def attr(tag, key, value):
        pattern = re.compile(r'\b' + re.escape(key) + r'="[^"]*"')
        return pattern.sub(lambda _: key + '="' + escape(value) + '"', tag)

    def block(match):
        opening, tag, key, _, closing = match.groups()
        value = data['blocks'].get(key)
        if not value:
            return match[0]
        opening = attr(attr(opening, 'data-fa', value['fa']), 'data-en', value['en'])
        return opening + escape(value['fa']) + closing

    text = re.sub(r'(<([a-z0-9]+)\b[^>]*data-content-key="([^"]+)"[^>]*>)(.*?)(</\2>)', block, text, flags=re.S)

    def metadata(match):
        tag = match[0]
        key = re.search(r'data-content-key="([^"]+)"', tag)[1]
        value = data['blocks'].get(key)
        return attr(attr(attr(tag, 'content', value['fa']), 'data-fa', value['fa']), 'data-en', value['en']) if value else tag

    text = re.sub(r'<meta\b[^>]*data-content-key="[^"]+"[^>]*>', metadata, text)
    text = re.sub(r'<a\b[^>]*data-link-key="([^"]+)"[^>]*>', lambda match: attr(match[0], 'href', data['links'][match[1]]) if match[1] in data['links'] else match[0], text)

    def menu(items):
        result = ''
        for item in items:
            label = '<span data-fa="' + escape(item['fa']) + '" data-en="' + escape(item['en']) + '">' + escape(item['fa']) + '</span>'
            link = '<a href="' + escape(item['url']) + '">' + label + '</a>'
            if item.get('children'):
                result += '<details class="nav-group"><summary data-fa="' + escape(item['fa']) + '" data-en="' + escape(item['en']) + '">' + escape(item['fa']) + '</summary><div class="nav-submenu">' + link + menu(item['children']) + '</div></details>'
            else:
                result += link
        return result

    def nav(match):
        opening = match[1]
        if 'class="desktop-nav"' in opening or 'aria-label="منوی موبایل"' in opening:
            return opening + menu(navigation['header']) + '</nav>'
        if 'aria-label="پیوندهای پایین صفحه"' in opening:
            return opening + menu(navigation['footer']) + '</nav>'
        return match[0]

    text = re.sub(r'(<nav\b[^>]*>).*?</nav>', nav, text, flags=re.S)
    def identity(match):
        tag = match[0]
        key = re.search(r'data-site-image="(logo|wallpaper)"', tag)[1]
        return attr(attr(attr(tag, 'data-theme-light', appearance['light'][key]), 'data-theme-dark', appearance['dark'][key]), 'src', appearance['light'][key])
    text = re.sub(r'<img\b[^>]*data-site-image="(?:logo|wallpaper)"[^>]*>', identity, text)
    families = {'Vazirmatn': 'Vazirmatn,Tahoma,sans-serif', 'Tahoma': 'Tahoma,sans-serif', 'Arial': 'Arial,sans-serif', 'system': 'system-ui,sans-serif'}
    css = ':root{--site-font:' + families[appearance['font']] + ';'
    for key, value in [('site-font-size', str(appearance['fontSize']) + 'px'), ('site-line-height', appearance['lineHeight']), ('heading-weight', appearance['headingWeight']), ('radius', str(appearance['radius']) + 'px'), ('site-width', str(appearance['width']) + 'px')]:
        css += '--' + key + ':' + str(value) + ';'
    css += '}'
    for mode in ('light', 'dark'):
        value = appearance[mode]
        css += ':root' + ('[data-theme=dark]' if mode == 'dark' else ':not([data-theme=dark])') + '{'
        css += ''.join('--' + key + ':' + value[key] + ';' for key in ('paper', 'white', 'ink', 'muted', 'wash', 'line', 'teal', 'button', 'buttonText'))
        css += '--glass-art:url("' + value['wallpaper'] + '");'
        css += '--site-background:' + ('url("' + value['background'] + '")' if value['background'] else 'none') + ';}'
    text = re.sub(r'<style id="site-settings">.*?</style>', '', text, flags=re.S)
    text = text.replace('</head>', '<style id="site-settings">' + css + '</style></head>')
    return home_bootstrap(root, text) if ident == 'home' else text


def apply_static_settings(root, output):
    for path in [output / 'index.html', *sorted((output / 'pages').glob('*.html'))]:
        if path.name == 'studio-preview.html':
            continue
        ident = 'home' if path.name == 'index.html' else path.stem
        path.write_text(bake_settings(root, path.read_text(), ident))
