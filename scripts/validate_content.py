"""Validate public CMS content and immutable integration boundaries before build."""
import json
import hashlib
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = {
    'intmed': ('https://github.com/4mirgr/intMed-study-plan.git', 'docs'),
    'aus': ('https://github.com/4mirgr/immi-arash-amir.git', 'dist'),
    'ventilator': ('https://github.com/4mirgr/Respiratory-ventilator.git', '.'),
}


def https(value):
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password


def remote_article_image(value):
    if not isinstance(value, str) or len(value) > 2000 or re.search(r'[\s\\\x00-\x1f]', value):
        return False
    try:
        parsed = urlsplit(value)
        parsed.port  # Reject malformed/out-of-range ports as the browser does.
        return value.lower().startswith('https://') and https(value)
    except ValueError:
        return False


def validate(root=ROOT):
    profile = json.loads((root / 'content/site.json').read_text())
    data = json.loads((root / 'content/articles.json').read_text())
    pins = json.loads((root / 'deploy/projects.json').read_text())
    if not isinstance(profile, dict) or not isinstance(data, dict) or not isinstance(data.get('articles'), list):
        raise ValueError('Content must contain a profile object and an articles list')
    if set(pins) != set(PROJECTS):
        raise ValueError('Unexpected set of independent project integrations')
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
            if not isinstance(item.get(key, ''), str):
                raise ValueError(f'Invalid article text: {key}')
        if item['status']=='published' and not any(item.get('title_'+lang,'').strip() and item.get('body_'+lang,'').strip() for lang in ('fa','en')):
            raise ValueError('Published article requires a title and body in at least one language')
        for key in ('published_at', 'reviewed_at'):
            value = item.get(key, '')
            if value or (key=='published_at' and item['status']=='published'):
                if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                    raise ValueError('Article dates must use YYYY-MM-DD')
                date.fromisoformat(value)
        image = item.get('image', '')
        if image and re.fullmatch(r'/assets/optimized/[a-z-]+\.[a-f0-9]{16}\.webp', image):
            target = root / image.lstrip('/')
            if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()[:16] != image.split('.')[-2]:
                raise ValueError('Reviewed article artwork must match its fingerprint')
        elif image and not remote_article_image(image):
            if not isinstance(image, str) or not re.fullmatch(r'/assets/uploads/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g|avif|gif|svg)', image, re.I):
                raise ValueError('Article image needs an uploaded file or a direct HTTPS URL')
            target = (root / image.lstrip('/')).resolve()
            uploads = (root / 'assets/uploads').resolve()
            if not image.startswith('/assets/uploads/') or '..' in image or not target.is_relative_to(uploads) or not target.is_file():
                raise ValueError('Article image must exist within assets/uploads')
        for key in ('tags', 'hashtags'):
            tags = item.get(key, [])
            if not isinstance(tags, list) or len(tags) > 8 or any(not isinstance(t, str) or not re.fullmatch(r'[#\w \u200c-]{1,50}', t) for t in tags):
                raise ValueError('Invalid article tags')
        if not isinstance(item.get('sources', []), list):
            raise ValueError('Article sources must be a list')
        for source in item.get('sources', []):
            if not isinstance(source, dict) or not isinstance(source.get('url'), str) or not https(source['url']) or not isinstance(source.get('title'), str):
                raise ValueError('Article sources require title and safe HTTPS URLs')
    from site_studio import validate as validate_studio
    if (root / 'content/appearance.json').exists():
        validate_studio(root)
    return len(seen)


if __name__ == '__main__':
    print(f'PASS: CMS content and protected integration boundaries ({validate()} articles).')
