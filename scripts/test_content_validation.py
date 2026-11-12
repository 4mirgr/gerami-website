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

    def test_automatic_updates_cannot_change_repository_or_mount(self):
        pins = json.loads((self.root / 'deploy/projects.json').read_text())
        pins['aus']['mount'] = 'intmed'
        self.write('deploy/projects.json', pins)
        with self.assertRaises(ValueError):
            validate(self.root)


if __name__ == '__main__':
    unittest.main()
