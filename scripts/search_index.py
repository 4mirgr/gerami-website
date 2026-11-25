"""Build the lazy, same-origin search document from public editorial content only."""
import json
import re
from html.parser import HTMLParser

from editorial_seo import article_path
from site_studio import public_document, visible_entries

LANGUAGES = ('fa', 'en')
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
PAGES = ('about', 'appointments', 'beyond', 'blog', 'contact', 'privacy', 'projects', 'services')


def pair(record, field):
    return [record.get(field + '_' + lang, '') for lang in LANGUAGES]


def result(kind, path, titles, descriptions=(), body=(), keywords=()):
    return {'kind': kind, 'url': path, 'titles': titles, 'details': descriptions,
            'body': body, 'keywords': [word for word in keywords if word]}


class Portfolio(HTMLParser):
    """Read the same heading and paragraphs that appear in each public product card."""
    def __init__(self, blocks):
        super().__init__()
        self.blocks = blocks
        self.products = []
        self.product = None
        self.heading = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and 'project-feature' in attrs.get('class', '').split() and SLUG.fullmatch(attrs.get('id', '')):
            self.product = result('project', '/projects#' + attrs['id'], ['', ''], [], [[], []])
            self.products.append(self.product)
        if self.product and tag in ('h2', 'p'):
            self.heading = tag == 'h2'
            text = self.blocks.get(attrs.get('data-content-key'), {})
            values = [text.get(lang) or attrs.get('data-' + lang, '') for lang in LANGUAGES]
            if self.heading:
                self.product['titles'] = values
            elif all(values) and 'eyebrow' not in attrs.get('class', '').split():
                if not self.product['details']:
                    self.product['details'] = values
                for parts, value in zip(self.product['body'], values):
                    parts.append(value)

    def handle_data(self, data):
        if self.product and self.heading and not any(self.product['titles']) and data.strip():
            self.product['titles'] = [data.strip()] * 2

    def handle_endtag(self, tag):
        if tag == 'h2':
            self.heading = False
        elif tag == 'article':
            self.product = None


def search_document(root):
    read = lambda path: public_document(root / path)
    atlas = read('backend/editorial/functions/gerami-editorial/taxonomy.json')
    rows = [result('topic', '/topics/', ['موضوعات و زیرشاخه‌های پزشکی', 'Medical topics and specialties'])]
    topic_paths = {}
    for category in atlas['categories']:
        group = category['root']
        group_names = [group[lang] for lang in LANGUAGES]
        base = '/topics/' + group['id'] + '/'
        rows.append(result('topic', base, group_names, pair(group, 'description')))
        for topic in category['topics']:
            names = [topic[lang] for lang in LANGUAGES]
            rows.append(result('topic', base + topic['id'] + '/', names, group_names, keywords=pair(topic, 'description')))
            topic_paths[topic['source_id']] = (category, topic)

    feed = 'content/articles.json'
    for post in visible_entries(feed, read(feed))['articles']:
        path = article_path(post, topic_paths)
        source = post.get('source_topic_id')
        keywords = [post.get(k) for k in ('author', 'author_en', 'category', 'category_en')]
        if source:
            topic = topic_paths[source][1]
            keywords.extend(topic[lang] for lang in LANGUAGES)
        for key in ('hashtags', 'hashtags_en', 'tags', 'tags_en'):
            keywords.extend(post.get(key) or [])
        rows.append(result('article', path, pair(post, 'title'), body=pair(post, 'body'), keywords=keywords))

    feed = 'content/extra-pages.json'
    for page in visible_entries(feed, read(feed))['pages']:
        if SLUG.fullmatch(page.get('slug', '')):
            rows.append(result('page', '/pages/' + page['slug'] + '.html', pair(page, 'title'),
                               pair(page, 'description'), pair(page, 'body')))

    for name in PAGES:
        blocks = read('content/pages/' + name + '.json')['blocks']
        titles = [blocks['text-001'][lang].split('|')[0].strip() for lang in LANGUAGES]
        descriptions = [blocks['text-002'][lang] for lang in LANGUAGES] if name != 'privacy' else []
        path = '/projects' if name == 'projects' else '/pages/' + name + '.html'
        rows.append(result('page', path, titles, descriptions))
        if name == 'projects':
            catalog = Portfolio(blocks)
            catalog.feed((root / 'pages/projects.html').read_text())
            for product in catalog.products:
                product['body'] = [' '.join(parts) for parts in product['body']]
                rows.append(product)
    return {'version': 1, 'rows': rows}


def search_bytes(root):
    return json.dumps(search_document(root), separators=(',', ':'), ensure_ascii=False).encode()
