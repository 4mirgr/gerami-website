import json
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from article_publication import generate

ROOT = Path(__file__).resolve().parent.parent


class ArticlePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('content', 'pages'):
            shutil.copytree(ROOT/name, self.root/name)
        shutil.copy2(ROOT/'index.html', self.root/'index.html')
        self.item = dict(slug='synthetic-education', status='published', audience='patients',
            title_fa='عنوان آموزشی <script>', title_en='Educational article',
            body_fa='# سؤال اصلی\n\nپاسخ **مستند**.\n\n<script>danger()</script>\n\n[پیوند](javascript:bad)',
            body_en='# A question\n\nA sourced answer.', author='Synthetic reviewer', category='آموزش',
            published_at='2026-11-16', reviewed_at='2026-11-16',
            sources=[dict(title='Synthetic reference',url='https://example.test/reference')])

    def test_published_article_has_initial_html_metadata_and_safe_navigation(self):
        (self.root/'content/articles.json').write_text(json.dumps({'articles':[self.item]}))
        generate(self.root)
        page = (self.root/'articles/synthetic-education/index.html').read_text()
        self.assertIn('<h2>سؤال اصلی</h2>', page)
        self.assertIn('<strong>مستند</strong>', page)
        self.assertIn('href="https://drgerami-md.ir/articles/synthetic-education/"',page)
        self.assertIn('"@type": "Article"', page)
        self.assertIn('href="/account/?mode=signup#newsletter"',page)
        self.assertIn('href="/account/?next=%2Fdash%2Fportal%2F"',page)
        self.assertNotIn('<script>danger()', page)
        self.assertNotIn('href="javascript:', page)
        self.assertNotIn('src="../',page)
        self.assertIn('/articles/synthetic-education/',(self.root/'pages/blog.html').read_text())
        self.assertNotIn('article-topic',(self.root/'pages/blog.html').read_text())
        self.assertIn('datetime="2026-11-16"',page)

    def test_drafts_and_private_surfaces_are_absent_from_public_output(self):
        draft = dict(self.item,slug='private-draft',status='draft',body_fa='UNREVIEWED-SENTINEL')
        (self.root/'content/articles.json').write_text(json.dumps({'articles':[self.item,draft]}))
        generate(self.root)
        self.assertFalse((self.root/'articles/private-draft').exists())
        self.assertNotIn('UNREVIEWED-SENTINEL',(self.root/'content/articles.json').read_text())
        tree=ET.parse(self.root/'sitemap.xml')
        locations=[node.text for node in tree.findall('.//{*}loc')]
        self.assertIn('https://drgerami-md.ir/articles/synthetic-education/',locations)
        self.assertFalse(any('/account/' in url or '/dash' in url or '/aus' in url or 'private-draft' in url for url in locations))
        self.assertIn('Sitemap: https://drgerami-md.ir/sitemap.xml',(self.root/'robots.txt').read_text())

    def test_malformed_slug_cannot_write_outside_the_article_directory(self):
        item=dict(self.item,slug='../account')
        (self.root/'content/articles.json').write_text(json.dumps({'articles':[item]}))
        with self.assertRaises(ValueError):
            generate(self.root)


if __name__ == '__main__':
    unittest.main()
