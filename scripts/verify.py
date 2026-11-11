"""Dependency-free checks for static navigation, translation structure and budgets."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
errors = []


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.refs = []
        self.h1 = 0
        self.main = 0
        self.external_resources = []
        self.app_entries = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if 'data-app-entry' in data:
            self.app_entries.append((data['data-app-entry'], data.get('href')))
        if tag == 'h1':
            self.h1 += 1
        if tag == 'main':
            self.main += 1
        if 'id' in data:
            if data['id'] in self.ids:
                errors.append(f'duplicate id: {data["id"]}')
            self.ids.add(data['id'])
        if ('data-fa' in data) != ('data-en' in data):
            errors.append(f'incomplete translation on {tag}')
        for attr in ('href', 'src'):
            if attr in data:
                value = data[attr]
                self.refs.append(value)
                if value == '#':
                    errors.append('empty fragment link')
                if (attr == 'src' or tag == 'link' and data.get('rel') in ('stylesheet', 'preconnect')) and value.startswith(('http:', 'https:', '//')):
                    self.external_resources.append(value)


pages = {}
for file in [ROOT / 'index.html', *sorted((ROOT / 'pages').glob('*.html'))]:
    page = Page()
    page.feed(file.read_text(encoding='utf-8'))
    pages[file.resolve()] = page
    if page.h1 != 1 or page.main != 1:
        errors.append(f'{file.relative_to(ROOT)}: expected one h1 and one main')
    if page.external_resources:
        errors.append(f'{file.relative_to(ROOT)}: external resources {page.external_resources}')

for path in ('index.html', 'pages/projects.html'):
    expected = [('intmed', 'https://drgerami-md.ir/intmed/'), ('aus', 'https://drgerami-md.ir/aus/')]
    if pages[(ROOT / path).resolve()].app_entries != expected:
        errors.append(f'{path}: expected two direct project buttons on the .ir domain')

for file, page in pages.items():
    for reference in page.refs:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            continue
        path = unquote(url.path)
        target = ((ROOT / path.lstrip('/')) if path.startswith('/') else (file.parent / path)).resolve() if path else file
        if not target.is_relative_to(ROOT):
            errors.append(f'{file.name}: path escapes site: {reference}')
            continue
        if target.is_dir():
            target /= 'index.html'
        if not target.exists():
            errors.append(f'{file.relative_to(ROOT)}: missing target {reference}')
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f'{file.relative_to(ROOT)}: missing anchor {reference}')

entry = sum((ROOT / path).stat().st_size for path in ('index.html', 'css/style.css', 'js/main.js', 'js/links.js', 'js/theme.js', 'js/content.js', 'assets/favicon.ico'))
if entry > 60 * 1024:
    errors.append(f'initial resource budget exceeded: {entry} bytes')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(pages)} pages; local links and anchors; one h1/main; translation pairs; no external assets.')
print(f'Initial HTML/CSS/JS/icon (images excluded): {entry:,} bytes uncompressed (budget: 61,440).')
