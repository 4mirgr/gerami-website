"""Public identity and project references shared by HTML, articles and discovery text."""
import json
import re

SITE = 'https://drgerami-md.ir'
PROFILE = SITE + '/pages/about'
PERSON = PROFILE + '#physician'
PORTFOLIO = SITE + '/projects'
NAME = 'دکتر امیرهوشنگ گرامی'
ENGLISH = 'Amir Houshang Gerami'
DOI = 'https://doi.org/10.3389/fmed.2022.872528'
PROJECTS = (
    ('intmed', '/intmed/', 'EducationalApplication', 'IntMed', 'A study platform for internal medicine and cardiology with lessons, flashcards and exam simulations.'),
    ('ventilator', '/projects#ventilator', 'EducationalApplication', 'Respiratory Ventilator Simulator', 'An educational simulator for exploring pressure, flow and volume waveforms in fictional clinical cases.'),
    ('spirometry', '/respiratory/spirometry/', 'EducationalApplication', 'Spirometry Lab',
     'A Persian and English spirometry course with interactive curves, lung volumes and fictional clinical cases for internal medicine residents.'),
    ('clinic-demo', '/projects#clinic-demo', 'HealthApplication', 'Patient Health Record Preview',
     'A demonstration of organizing symptoms, medications and history before a visit, using fictional records.'),
)


def article_author(name):
    if not name:
        return None
    node = {'@type': 'Person', 'name': name}
    if name in (NAME, ENGLISH, 'Dr. ' + ENGLISH):
        node.update({'@id': PERSON, 'url': PROFILE})
    return node


def profile_markup(page):
    if page == 'home':
        nodes = [{'@type': 'WebSite', '@id': SITE + '/#website', 'url': SITE + '/',
                  'name': NAME, 'publisher': {'@id': PERSON, '@type': 'Person', 'name': NAME, 'url': PROFILE}}]
    elif page == 'about':
        nodes = [
            {'@type': 'ProfilePage', '@id': PROFILE, 'url': PROFILE, 'mainEntity': {'@id': PERSON}},
            {'@type': 'Person', '@id': PERSON, 'name': NAME, 'alternateName': ENGLISH,
             'url': PROFILE, 'jobTitle': 'متخصص بیماری‌های داخلی',
             'identifier': {'@type': 'PropertyValue', 'propertyID': 'Iran Medical Council', 'value': '190947'},
             'image': SITE + '/assets/optimized/gerami-portrait.e236052487cb3fc1.webp',
             'knowsAbout': ['Internal medicine', 'Digital health systems', 'Medical education software'],
             'sameAs': ['https://www.linkedin.com/in/amir-houshang-gerami-2424a9b5/'],
             'subjectOf': {'@id': PROFILE}},
            {'@type': 'ScholarlyArticle', '@id': DOI, 'url': DOI, 'datePublished': '2022-05-19',
             'name': 'Clinical, Laboratory, and Electrocardiographic Findings in Colchicine Toxicity: 10 Years of Experience',
             'author': [{'@type': 'Person', 'name': name} if name != ENGLISH else {'@id': PERSON}
                        for name in ('Mehdi Sheibani', 'Nasim Zamani', ENGLISH, 'Hossein Akhondi', 'Hossein Hassanian-Moghaddam')]}
        ]
    elif page == 'projects':
        nodes = [{'@type': 'CollectionPage', '@id': PORTFOLIO, 'url': PORTFOLIO,
                  'name': 'پروژه‌های آموزش پزشکی دکتر امیرهوشنگ گرامی',
                  'hasPart': [{'@id': PORTFOLIO + '#' + slug} for slug, *_ in PROJECTS]}]
        for slug, path, category, name, description in PROJECTS:
            nodes.append({'@type': 'WebApplication', '@id': PORTFOLIO + '#' + slug,
                          'name': name, 'url': SITE + path, 'description': description,
                          'applicationCategory': category,
                          'creator': {'@id': PERSON, '@type': 'Person', 'name': NAME, 'url': PROFILE}})
    else:
        return ''
    payload = json.dumps({'@context': 'https://schema.org', '@graph': nodes}, ensure_ascii=False, separators=(',', ':'))
    return '<script type="application/ld+json">' + payload.replace('<', r'\u003c') + '</script>'


def write_discovery(output, posts, post_path):
    lines = ['# Dr. Amir Houshang Gerami | دکتر امیرهوشنگ گرامی', '',
             '> Internal medicine specialist and developer of medical education software.',
             '', '## Physician and research',
             f'- [Physician profile]({PROFILE}): Clinical background, medical registration and publications.',
             f'- [Colchicine toxicity research]({DOI}): Peer-reviewed study co-authored by Dr. Gerami.',
             '', '## Public projects',
             f'- [Medical education portfolio]({PORTFOLIO}): Project descriptions and creator attribution.']
    for slug, path, category, name, description in PROJECTS:
        lines.append(f'- [{name}]({SITE}{path}): {description}')
    lines.extend(['', '## Medical articles', f'- [Browse by topic]({SITE}/topics/)'])
    for post in sorted(posts, key=lambda p: (p.get('published_at', ''), p['slug']), reverse=True)[:20]:
        title = ' '.join((post.get('title_fa') or post.get('title_en') or '').split())
        title = re.sub(r'([\\\[\]<>])', r'\\\1', title)
        lines.append(f'- [{title}]({SITE}{post_path(post)})')
    lines.extend(['', f'[Complete public sitemap]({SITE}/sitemap.xml)', ''])
    (output / 'llms.txt').write_text('\n'.join(lines), encoding='utf-8')
