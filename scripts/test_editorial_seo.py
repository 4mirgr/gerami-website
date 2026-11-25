import json,re,shutil,tempfile,unittest
from pathlib import Path
from editorial_seo import generate
ROOT=Path(__file__).resolve().parent.parent
class EditorialSEO(unittest.TestCase):
 def test_static_topic_article_paths_and_no_draft_leaks(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)/'root';out=Path(folder)/'site';root.mkdir();out.mkdir()
   shutil.copytree(ROOT/'content',root/'content');(root/'pages').mkdir();shutil.copy2(ROOT/'pages/services.html',root/'pages/services.html');(root/'js').mkdir();shutil.copy2(ROOT/'js/theme.js',root/'js/theme.js');(root/'backend/editorial/functions/gerami-editorial').mkdir(parents=True);shutil.copy2(ROOT/'backend/editorial/functions/gerami-editorial/taxonomy.json',root/'backend/editorial/functions/gerami-editorial/taxonomy.json')
   base={'status':'published','audience':'patients','topic':'asthma','source_topic_id':'pulm-asthma','category':'ریه / آسم','title_fa':'آسم <script>bad()</script>','title_en':'','body_fa':'توضیح روشن درباره\u0654 آسم و شیو\u06c0 تأیید.\n\nمراقبت روزانه با راهنمایی پزشک.','body_en':'','author':'دکتر امیرهوشنگ گرامی','image':'https://example.test/cover.jpg','published_at':'2026-11-22','sources':[{'title':'Harrison 2025','url':'https://accessmedicine.mhmedical.com/'}],'hashtags':['#آسم','#سلامت'],'editorial_hash':'a'*64}
   posts=[dict(base,slug='asthma-first'),dict(base,slug='asthma-second',audience='professional',title_en='Clinical asthma',body_en='## Summary\n\nClinical assessment and treatment.',image='https://example.test/spirometry.webp',image_alt='آزمون ریه',image_alt_en='A patient during spirometry.'),dict(base,slug='manual-asthma',source_topic_id='',author='Guest Author'),dict(base,slug='manual-specialty',source_topic_id='',topic='pulmonology'),dict(base,slug='private-draft',status='draft')];(root/'content/articles.json').write_text(json.dumps({'articles':posts}));generate(root,out)
   first=out/'articles/pulmonology/asthma/asthma-first/index.html';self.assertTrue(first.exists());text=first.read_text();self.assertIn('توضیح روشن درباره آسم و شیوه تأیید.',text);self.assertIn('Harrison 2025',text);self.assertNotIn('<script>bad()</script>',text);self.assertIn('application/ld+json',text);self.assertIn('BreadcrumbList',text);self.assertIn('name="editorial-snapshot" content="'+'a'*64+'"',text);self.assertIn('name="editorial-slug" content="asthma-first"',text);self.assertIn('/articles/pulmonology/asthma/asthma-first/',text);self.assertNotIn('../css/',text)
   dated=(out/'articles/pulmonology/asthma/asthma-first/index.html').read_text()
   self.assertIn('datetime="2026-11-22" dir="auto" data-fa="۱ آذر ۱۴۰۵" data-en="November 22, 2026"',dated)
   self.assertIn('ویژه پزشکان',(out/'articles/pulmonology/asthma/asthma-second/index.html').read_text())
   from physician_profile import PERSON, profile_markup
   person=json.loads(profile_markup('about').split('>',1)[1].split('</script>')[0])['@graph'][1]
   self.assertEqual(person['@id'],PERSON)
   apps=json.loads(profile_markup('projects').split('>',1)[1].split('</script>')[0])['@graph'][1:]
   self.assertEqual({app['creator']['@id'] for app in apps},{PERSON})
   discovery=(out/'llms.txt').read_text()
   for app in apps:self.assertIn(app['url'],discovery)
   self.assertIn('/articles/pulmonology/asthma/asthma-first/',discovery)
   self.assertNotIn('private-draft',discovery)
   self.assertIn('rel="author"',text)
   self.assertIn(PERSON,text)
   guest=(out/'articles/manual-asthma/index.html').read_text()
   self.assertNotIn('rel="author"',guest)
   self.assertNotIn(PERSON,guest)
   self.assertIn('ارجاع به این مطلب',guest)
   topic=(out/'topics/pulmonology/asthma/index.html').read_text();self.assertIn('asthma-first',topic);self.assertIn('asthma-second',topic);self.assertNotIn('private-draft',topic);self.assertNotIn('noindex,follow',topic)
   public,clinical=topic.split('class="audience-shelf"',2)[1:]
   self.assertIn('asthma-first',public)
   self.assertNotIn('asthma-second',public)
   self.assertIn('asthma-second',clinical)
   self.assertIn('class="atlas-post-grid"',clinical)
   self.assertIn('class="card post-card glass-surface"',clinical)
   self.assertIn('data-alt-en="A patient during spirometry."',clinical)
   self.assertIn('src="https://example.test/spirometry.webp"',clinical)
   self.assertIn('class="post-excerpt"',clinical)
   self.assertIn('data-en="Clinical assessment and treatment."',clinical)
   self.assertIn('asthma-second/#discussion"',clinical)
   self.assertIn('href="/pages/appointments"',text)
   self.assertIn('href="/articles/manual-asthma/"',topic)
   self.assertNotIn('href="/articles/manual-specialty/"',topic)
   specialty=(out/'topics/pulmonology/index.html').read_text()
   asthma_tile=re.search(r'<a class="atlas-subtopic" href="/topics/pulmonology/asthma/">(.*?)</a>',specialty).group(1)
   self.assertIn('src="https://example.test/spirometry.webp"',asthma_tile)
   other_tile=re.search(r'<a class="atlas-subtopic" href="/topics/pulmonology/copd/">(.*?)</a>',specialty).group(1)
   self.assertNotIn('<img',other_tile)
   self.assertIn('href="/articles/manual-specialty/"',specialty)
   self.assertIn('href="/articles/manual-asthma/"',specialty)
   empty=(out/'topics/gastroenterology/dysphagia/index.html').read_text();self.assertIn('noindex,follow',empty)
   sitemap=(out/'sitemap.xml').read_text();self.assertIn('asthma-first',sitemap);self.assertIn('<lastmod>2026-11-22</lastmod>',sitemap);self.assertNotIn('private-draft',sitemap);self.assertNotIn('/topics/gastroenterology/dysphagia/',sitemap)
   index=(out/'topics/index.html').read_text();self.assertIn('دیسفاژی',index);self.assertIn('ازوتمی',index);self.assertEqual(len(list((out/'topics').glob('*/*/index.html'))),149)
   self.assertEqual(index.count('class="atlas-card glass-surface"'),12)
   self.assertEqual(index.count('<details>'),12)
   self.assertIn('src="/assets/topics/lungs.webp"',topic)
   banner=index.split('class="atlas-heading glass-surface"',1)[1].split('</header>',1)[0]
   self.assertIn('src="/assets/optimized/learning-book.6cea0e7729990418.webp"',banner)
   self.assertIn('href="/css/catalog.css"',index)
   self.assertIn('src="/assets/optimized/medication.',index)
if __name__=='__main__':unittest.main()
