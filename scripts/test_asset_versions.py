import tempfile
import unittest
from pathlib import Path
from version_assets import version_assets


class AssetVersions(unittest.TestCase):
    def test_changed_assets_change_url_and_external_resources_stay_exact(self):
        with tempfile.TemporaryDirectory() as temp:
            site = Path(temp)
            (site / 'index.html').write_text('<script src="app.js?v=old"></script><script src="https://example.org/cms.js" integrity="fixed"></script>')
            (site / 'app.js').write_text('old')
            version_assets(site)
            first = (site / 'index.html').read_text()
            (site / 'app.js').write_text('updated')
            version_assets(site)
            second = (site / 'index.html').read_text()
            self.assertNotEqual(first, second)
            self.assertIn('src="https://example.org/cms.js" integrity="fixed"', second)
            self.assertNotIn('v=old', first)


if __name__ == '__main__':
    unittest.main()
