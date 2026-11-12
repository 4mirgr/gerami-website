"""Validate public CMS content and immutable integration boundaries before build."""
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = {
    'intmed': ('https://github.com/4mirgr/intMed-study-plan.git', 'docs'),
    'aus': ('https://github.com/4mirgr/immi-arash-amir.git', 'dist'),
}


def https(value):
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password


def validate(root=ROOT):
    profile = json.loads((root / 'content/site.json').read_text())
    data = json.loads((root / 'content/articles.json').read_text())
    pins = json.loads((root / 'deploy/projects.json').read_text())
    if not isinstance(profile, dict) or not isinstance(data, dict) or not isinstance(data.get('articles'), list):
        raise ValueError('Content must contain a profile object and an articles list')
    if set(pins) != set(PROJECTS):
        raise ValueError('Keep the independent IntMed/AUS integrations')
    for name, (repository, directory) in PROJECTS.items():
        spec = pins[name]
        if (spec.get('repository'), spec.get('public_directory'), spec.get('mount')) != (repository, directory, name):
            raise ValueError(f'{name}: integration repository, public directory and mount are protected')
        if not re.fullmatch(r'[0-9a-f]{40}', spec.get('commit', '')):
            raise ValueError(f'{name}: pin must be an immutable full commit SHA')
    for field in ('bio_fa', 'bio_en', 'email', 'phone', 'linkedin', 'appointment'):
        if not isinstance(profile.get(field), str):
            raise ValueError(f'Profile {field} must be text')
    if profile['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', profile['email']):
        raise ValueError('Invalid public email')
    if profile['phone'] and not re.fullmatch(r'\+?[0-9 -]{7,20}', profile['phone']):
        raise ValueError('Invalid public phone')
    for field in ('linkedin', 'appointment'):
        if profile[field] and not https(profile[field]):
            raise ValueError(f'{field} must be an HTTPS URL without credentials')
    if profile['linkedin'] and not re.fullmatch(r'(www\.)?linkedin\.com', urlsplit(profile['linkedin']).hostname):
        raise ValueError('LinkedIn must use linkedin.com')
    if not isinstance(profile.get('cv'), list):
        raise ValueError('CV must be a list')
    for item in profile['cv']:
        if not isinstance(item, dict) or any(not isinstance(item.get(key), str) or not item[key].strip() for key in ('title_fa', 'title_en', 'detail_fa', 'detail_en')):
            raise ValueError('CV entries require bilingual title and detail')
    seen = set()
    for item in data['articles']:
        if not isinstance(item, dict) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', item.get('slug', '')):
            raise ValueError('Article slug must contain lowercase letters, numbers and hyphens')
        if item['slug'] in seen:
            raise ValueError('Duplicate article slug')
        seen.add(item['slug'])
        if item.get('status') not in ('draft', 'published') or item.get('audience') not in ('patients', 'professional'):
            raise ValueError('Invalid article status or audience')
        required = ('title_fa', 'title_en', 'body_fa', 'body_en', 'author', 'category')
        for key in required:
            if not isinstance(item.get(key, ''), str) or (item['status'] == 'published' and not item.get(key, '').strip()):
                raise ValueError(f'Published article requires {key}')
        for key in ('published_at', 'reviewed_at'):
            value = item.get(key, '')
            if value or item['status'] == 'published':
                if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                    raise ValueError('Article dates must use YYYY-MM-DD')
                date.fromisoformat(value)
        if item.get('published_at') and item.get('reviewed_at') and item['reviewed_at'] < item['published_at']:
            raise ValueError('Article review cannot precede publication')
        image = item.get('image', '')
        if image:
            target = (root / image.lstrip('/')).resolve()
            uploads = (root / 'assets/uploads').resolve()
            if not image.startswith('/assets/uploads/') or '..' in image or not target.is_relative_to(uploads) or not target.is_file():
                raise ValueError('Article image must exist within assets/uploads')
        if not isinstance(item.get('sources', []), list):
            raise ValueError('Article sources must be a list')
        for source in item.get('sources', []):
            if not isinstance(source, dict) or not isinstance(source.get('url'), str) or not https(source['url']) or not isinstance(source.get('title'), str):
                raise ValueError('Article sources require title and safe HTTPS URLs')
    return len(seen)


if __name__ == '__main__':
    print(f'PASS: CMS content and protected integration boundaries ({validate()} articles).')
