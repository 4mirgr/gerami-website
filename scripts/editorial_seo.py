"""Static, crawlable pages for the pinned taxonomy and approved public articles only."""
import html,json,re,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
SITE='https://drgerami-md.ir'
def generate(root,output):
 from site_studio import bake_settings
 root,output=Path(root),Path(output);escape=lambda s:html.escape(str(s),quote=True)
 data=json.loads((root/'backend/editorial/functions/gerami-editorial/taxonomy.json').read_text())
 topics={t['source_id']:(c,t) for c in data['categories'] for t in c['topics']}
 posts=[p for p in json.loads((root/'content/articles.json').read_text())['articles'] if p.get('status')=='published']
 def topic_path(c,t=None):return '/topics/'+c['root']['id']+'/'+(t['id']+'/' if t else '')
 def post_path(p):
  if p.get('source_topic_id'):
   c,t=topics[p['source_topic_id']]
   if p.get('topic')!=t['id']:raise ValueError('Article topic differs from pinned IntMed source')
   return '/articles/'+c['root']['id']+'/'+t['id']+'/'+p['slug']+'/'
  return '/articles/'+p['slug']+'/'
 def linked(p):return '<li><a href="'+escape(post_path(p))+'">'+escape(p.get('title_fa') or p.get('title_en'))+'</a></li>'
 template=(root/'pages/services.html').read_text().replace('data-page="services"','data-page="editorial"')
 # Nested generated paths need root-relative owned resources, never ../css or pages.
 template=re.sub(r'((?:href|src)=")\.\./',r'\1/',template)
 template=re.sub(r'href="(about|contact|blog|projects|appointments|privacy|services)\.html',r'href="/pages/\1.html',template)
 added=[]
 def page(path,title,description,body,crumbs,indexable=True,article=None):
  text=re.sub(r' data-(?:content|link)-key="[^"]+"','',template)
  text=re.sub(r'<title[^>]*>.*?</title>',lambda _:'<title>'+escape(title)+' | دکتر گرامی</title>',text,count=1)
  text=re.sub(r'<meta name="description"[^>]*>',lambda _:'<meta name="description" content="'+escape(description[:240])+'">',text,count=1)
  text=re.sub(r'<link rel="canonical"[^>]*>',lambda _:'<link rel="canonical" href="'+SITE+escape(path)+'">',text,count=1)
  # The template's service-specific social attributes must not describe an article.
  text=re.sub(r'<meta[^>]+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>','',text)
  trail='<nav aria-label="مسیر موضوع"><a href="/">خانه</a> / '+' / '.join('<a href="'+escape(u)+'">'+escape(n)+'</a>' for n,u in crumbs)+'</nav>'
  main='<main id="main" tabindex="-1"><section class="container section">'+trail+'<h1>'+escape(title)+'</h1>'+body+'</section></main>'
  text=re.sub(r'<main\b.*?</main>',lambda _:main,text,count=1,flags=re.S)
  graph=[{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+u} for i,(n,u) in enumerate([('خانه','/'),*crumbs])]}]
  if article:
   node={'@type':'Article','headline':title,'description':description[:240],'inLanguage':'fa-IR' if article.get('title_fa') else 'en','mainEntityOfPage':SITE+path,'datePublished':article.get('published_at'),'author':{'@type':'Person','name':article.get('author',''),'url':SITE+'/pages/about.html'},'citation':'Harrison 2025' if article.get('source_topic_id') else [s.get('title','') for s in article.get('sources',[])]}
   if article.get('image'):node['image']=SITE+article['image'] if article['image'].startswith('/') else article['image']
   graph.append(node)
  ld=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
  extra='<meta property="og:title" content="'+escape(title)+'"><meta property="og:description" content="'+escape(description[:240])+'"><meta property="og:url" content="'+SITE+escape(path)+'"><meta property="og:type" content="'+('article' if article else 'website')+'"><script type="application/ld+json">'+ld+'</script>'
  if article and article.get('image'):extra+='<meta property="og:image" content="'+escape(SITE+article['image'] if article['image'].startswith('/') else article['image'])+'">'
  if not indexable:extra+='<meta name="robots" content="noindex,follow">'
  text=text.replace('</head>',extra+'</head>',1);target=output/path.strip('/')/'index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(bake_settings(root,text,'extra'))
  if indexable:added.append(path)
 index='<p>فهرست شاخه‌ها و مباحث پزشکی؛ مطالب هر مبحث پس از بازبینی پزشک منتشر می‌شوند.</p>'
 for c in data['categories']:
  root_node=c['root'];members=[p for p in posts if p.get('source_topic_id') in {t['source_id'] for t in c['topics']}]
  links=''.join('<li><a href="'+topic_path(c,t)+'">'+escape(t['fa'])+'</a></li>' for t in c['topics'])
  index+='<section><h2><a href="'+topic_path(c)+'">'+escape(root_node['fa'])+'</a></h2><ul>'+links+'</ul></section>'
  page(topic_path(c),root_node['fa'],'مطالب آموزشی و زیرموضوع‌های '+root_node['fa'],'<ul>'+links+'</ul><ul>'+''.join(map(linked,members))+'</ul>',[('موضوعات','/topics/'),(root_node['fa'],topic_path(c))],bool(members))
  for t in c['topics']:
   matches=[p for p in members if p.get('source_topic_id')==t['source_id']]
   listing='<ul>'+''.join(map(linked,matches))+'</ul>' if matches else '<p>مطلبی در این زیرموضوع هنوز منتشر نشده است.</p>'
   page(topic_path(c,t),t['fa'],'مطالب آموزشی '+t['fa']+' در '+root_node['fa'],listing,[('موضوعات','/topics/'),(root_node['fa'],topic_path(c)),(t['fa'],topic_path(c,t))],bool(matches))
 page('/topics/','موضوعات و زیرشاخه‌های پزشکی','فهرست مباحث هم‌ساختار با IntMed؛ از شاخهٔ اصلی تا موضوع دقیق هر مطلب.',index,[('موضوعات','/topics/')])
 for p in posts:
  title=p.get('title_fa') or p.get('title_en');body=p.get('body_fa') or p.get('body_en') or '';description=re.sub(r'[#*_>`]','',body.split('\n')[0])[:240];markup=''
  image=p.get('image','')
  if image.startswith('/assets/') or urlsplit(image).scheme=='https':markup+='<img class="post-cover" src="'+escape(image)+'" alt="'+escape(title)+'" width="1200" height="800" decoding="async">'
  markup+='<div class="article-body" dir="'+('rtl' if p.get('body_fa') else 'ltr')+'">'+''.join('<p>'+escape(x).replace('\n','<br>')+'</p>' for x in body.split('\n\n') if x.strip())+'</div>'
  markup+='<p>'+escape(p.get('author',''))+' · '+escape(p.get('published_at',''))+'</p>'
  if p.get('source_topic_id'):markup+='<p>منبع: <span lang="en" dir="ltr">Harrison 2025</span></p>'
  else:markup+=''.join('<p>'+escape(s.get('title',''))+'</p>' for s in p.get('sources',[]))
  if p.get('hashtags'):markup+='<p>'+escape(' '.join(p['hashtags']))+'</p>'
  crumbs=[('همهٔ مطالب','/pages/blog.html')]
  if p.get('source_topic_id'):
   c,t=topics[p['source_topic_id']];crumbs=[('موضوعات','/topics/'),(c['root']['fa'],topic_path(c)),(t['fa'],topic_path(c,t))]
   related=[x for x in posts if x.get('source_topic_id')==p['source_topic_id'] and x['slug']!=p['slug']]
   if related:markup+='<h2>مطالب مرتبط</h2><ul>'+''.join(map(linked,related))+'</ul>'
  page(post_path(p),title,description,markup,[*crumbs,(title,post_path(p))],article=p)
 ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns)
 original=root/'sitemap.xml';tree=ET.parse(original) if original.exists() else ET.ElementTree(ET.Element('{'+ns+'}urlset'))
 existing={n.text for n in tree.findall('.//{'+ns+'}loc')}
 for path in added:
  if SITE+path not in existing:ET.SubElement(ET.SubElement(tree.getroot(),'{'+ns+'}url'),'{'+ns+'}loc').text=SITE+path
 tree.write(output/'sitemap.xml',encoding='utf-8',xml_declaration=True)
