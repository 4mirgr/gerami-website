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


def bake_settings(root, text, ident):
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
    for key, marker in [('logo', 'brand-identity'), ('wallpaper', 'feature-image')]:
        pattern = r'(<(?:span|a)\b[^>]*class="[^"]*' + marker + r'[^>]*">\s*)(<img\b[^>]+>)'
        text = re.sub(pattern, lambda m: m[1] + attr(attr(attr(m[2], 'data-theme-light', appearance['light'][key]), 'data-theme-dark', appearance['dark'][key]), 'src', appearance['light'][key]), text)
    families = {'Vazirmatn': 'Vazirmatn,Tahoma,sans-serif', 'Tahoma': 'Tahoma,sans-serif', 'Arial': 'Arial,sans-serif', 'system': 'system-ui,sans-serif'}
    css = ':root{--site-font:' + families[appearance['font']] + ';'
    for key, value in [('site-font-size', str(appearance['fontSize']) + 'px'), ('site-line-height', appearance['lineHeight']), ('heading-weight', appearance['headingWeight']), ('radius', str(appearance['radius']) + 'px'), ('site-width', str(appearance['width']) + 'px')]:
        css += '--' + key + ':' + str(value) + ';'
    css += '}'
    for mode in ('light', 'dark'):
        value = appearance[mode]
        css += ':root' + ('[data-theme=dark]' if mode == 'dark' else ':not([data-theme=dark])') + '{'
        css += ''.join('--' + key + ':' + value[key] + ';' for key in ('paper', 'white', 'ink', 'muted', 'wash', 'line', 'teal', 'button', 'buttonText'))
        css += '--site-background:' + ('url("' + value['background'] + '")' if value['background'] else 'none') + ';}'
    text = re.sub(r'<style id="site-settings">.*?</style>', '', text, flags=re.S)
    return text.replace('</head>', '<style id="site-settings">' + css + '</style></head>')


def apply_static_settings(root, output):
    for path in [output / 'index.html', *sorted((output / 'pages').glob('*.html'))]:
        if path.name == 'studio-preview.html':
            continue
        ident = 'home' if path.name == 'index.html' else path.stem
        path.write_text(bake_settings(root, path.read_text(), ident))
