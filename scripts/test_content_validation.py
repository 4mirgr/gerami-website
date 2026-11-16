import json
import shutil
import tempfile
import unittest
from pathlib import Path
from validate_content import ROOT, validate


class ContentValidation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for folder in ('content', 'deploy'):
            (self.root / folder).mkdir()
        for name in ('content/site.json', 'content/articles.json', 'deploy/projects.json'):
            shutil.copy2(ROOT / name, self.root / name)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, data):
        (self.root / name).write_text(json.dumps(data))

    def test_empty_site_is_valid_without_invented_content(self):
        self.write('content/articles.json', {'articles':[]})
        self.assertEqual(validate(self.root), 0)

    def test_missing_translations_and_bad_links_block_publication(self):
        item = {'slug':'sample', 'status':'published', 'audience':'patients'}
        self.write('content/articles.json', {'articles':[item]})
        with self.assertRaises(ValueError):
            validate(self.root)
        profile = json.loads((self.root / 'content/site.json').read_text())
        profile['appointment'] = 'javascript:alert(1)'
        self.write('content/site.json', profile)
        with self.assertRaises(ValueError):
            validate(self.root)

    def test_draft_can_be_incomplete_but_slug_is_unique(self):
        item = {'slug':'draft', 'status':'draft', 'audience':'professional'}
        self.write('content/articles.json', {'articles':[item]})
        self.assertEqual(validate(self.root), 1)
        self.write('content/articles.json', {'articles':[item, item]})
        with self.assertRaises(ValueError):
            validate(self.root)

    def test_publication_dates_use_sortable_iso_format(self):
        item={'slug':'dated', 'status':'published', 'audience':'patients',
              **{key:'Verified' for key in ('title_fa','title_en','body_fa','body_en','author','category')},
              'published_at':'2026-11-12','reviewed_at':'2026-11-12','sources':[{'title':'Synthetic source','url':'https://example.test/reference'}]}
        self.write('content/articles.json', {'articles':[item]})
        self.assertEqual(validate(self.root), 1)
        item['published_at']='20261112'
        self.write('content/articles.json', {'articles':[item]})
        with self.assertRaises(ValueError):
            validate(self.root)

    def test_published_medical_content_requires_sources(self):
        item={'slug':'missing-source','status':'published','audience':'patients',
              **{key:'Synthetic' for key in ('title_fa','title_en','body_fa','body_en','author','category')},
              'published_at':'2026-11-16','reviewed_at':'2026-11-16','sources':[]}
        self.write('content/articles.json',{'articles':[item]})
        with self.assertRaisesRegex(ValueError,'source'):
            validate(self.root)

    def test_automatic_updates_cannot_change_repository_or_mount(self):
        pins = json.loads((self.root / 'deploy/projects.json').read_text())
        pins['aus']['mount'] = 'intmed'
        self.write('deploy/projects.json', pins)
        with self.assertRaises(ValueError):
            validate(self.root)

    def test_a_persian_post_does_not_require_translation_or_a_claimed_review(self):
        item={'slug':'persian-post','status':'published','audience':'patients',
              'title_fa':'عنوان آزمایشی','body_fa':'متن آزمایشی','published_at':'2026-11-16',
              'title_en':'','body_en':'','author':'','category':'','reviewed_at':'','sources':[]}
        self.write('content/articles.json',{'articles':[item]})
        self.assertEqual(validate(self.root),1)
        item['body_fa']=''
        self.write('content/articles.json',{'articles':[item]})
        with self.assertRaises(ValueError):validate(self.root)


if __name__ == '__main__':
    unittest.main()
