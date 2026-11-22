"""Static, crawlable pages for the pinned taxonomy and approved public articles only."""
import html,json,re,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
SITE='https://drgerami-md.ir'
def generate(root,output):
 from site_studio import TOPIC_ART, bake_settings
 root,output=Path(root),Path(output);escape=lambda s:html.escape(str(s),quote=True)
 data=json.loads((root/'backend/editorial/functions/gerami-editorial/taxonomy.json').read_text())
 topics={t['source_id']:(c,t) for c in data['categories'] for t in c['topics']}
 posts=[p for p in json.loads((root/'content/articles.json').read_text())['articles'] if p.get('status')=='published']
 def topic_path(c,t=None):return '/topics/'+c['root']['id']+'/'+(t['id']+'/' if t else '')
 def post_path(p):
  if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',p.get('slug','')):raise ValueError('Invalid article slug')
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
 def page(path,title,description,body,crumbs,indexable=True,article=None,atlas_header=None):
  text=re.sub(r' data-(?:content|link)-key="[^"]+"','',template)
  text=re.sub(r'<title[^>]*>.*?</title>',lambda _:'<title>'+escape(title)+' | دکتر گرامی</title>',text,count=1)
  text=re.sub(r'<meta name="description"[^>]*>',lambda _:'<meta name="description" content="'+escape(description[:240])+'">',text,count=1)
  text=re.sub(r'<link rel="canonical"[^>]*>',lambda _:'<link rel="canonical" href="'+SITE+escape(path)+'">',text,count=1)
  # The template's service-specific social attributes must not describe an article.
  text=re.sub(r'<meta[^>]+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>','',text)
  trail='<nav aria-label="مسیر موضوع"><a href="/">خانه</a> / '+' / '.join('<a href="'+escape(u)+'">'+escape(n)+'</a>' for n,u in crumbs)+'</nav>'
  main='<main id="main" tabindex="-1"><section class="container section">'+trail+'<h1>'+escape(title)+'</h1>'+body+'</section></main>'
  if atlas_header:
   main='<main class="container topic-atlas" id="main" tabindex="-1">'+atlas_header+body+'</main>'
   text=text.replace('</head>','<link rel="stylesheet" href="/css/catalog.css"></head>',1)
  if article:
   trail='<nav aria-label="مسیر مطلب"><a href="/">خانه</a>'+''.join('<span aria-hidden="true">/</span><a href="'+escape(u)+'">'+escape(n)+'</a>' for n,u in crumbs[:-1])+'</nav>'
   header='<header>'+trail+'<h1 dir="auto">'+escape(title)+'</h1><p class="byline">'+escape(article.get('author',''))+' · <time dir="ltr">'+escape(article.get('published_at',''))+'</time></p></header>'
   discussion='<section class="discussion" data-discussion="'+escape(article['slug'])+'" id="discussion"><h2 data-fa="دیدگاه خوانندگان" data-en="Reader discussion">دیدگاه خوانندگان</h2><div data-discussion-ui></div><noscript>برای ثبت دیدگاه یا پسندیدن، جاوااسکریپت را فعال کنید.</noscript></section>'
   main='<main class="reader" id="main" tabindex="-1"><article class="reader-sheet">'+header+body+'</article>'+discussion+'</main>'
   text=text.replace('</head>','<link rel="stylesheet" href="/css/article.css"><script type="module" src="/js/discussion.js"></script></head>',1)
  text=re.sub(r'<main\b.*?</main>',lambda _:main,text,count=1,flags=re.S)
  graph=[{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+u} for i,(n,u) in enumerate([('خانه','/'),*crumbs])]}]
  if article:
   node={'@type':'Article','headline':title,'description':description[:240],'inLanguage':'fa-IR' if article.get('title_fa') else 'en','mainEntityOfPage':SITE+path,'datePublished':article.get('published_at'),'author':{'@type':'Person','name':article.get('author',''),'url':SITE+'/pages/about.html'},'citation':'Harrison 2025' if article.get('source_topic_id') else [s.get('title','') for s in article.get('sources',[])]}
   if article.get('image'):node['image']=SITE+article['image'] if article['image'].startswith('/') else article['image']
   graph.append(node)
  ld=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
  extra='<meta property="og:title" content="'+escape(title)+'"><meta property="og:description" content="'+escape(description[:240])+'"><meta property="og:url" content="'+SITE+escape(path)+'"><meta property="og:type" content="'+('article' if article else 'website')+'"><script type="application/ld+json">'+ld+'</script>'
  if article and article.get('editorial_hash'):extra+='<meta name="editorial-snapshot" content="'+escape(article['editorial_hash'])+'"><meta name="editorial-slug" content="'+escape(article['slug'])+'">'
  if article and article.get('image'):extra+='<meta property="og:image" content="'+escape(SITE+article['image'] if article['image'].startswith('/') else article['image'])+'">'
  if not indexable:extra+='<meta name="robots" content="noindex,follow">'
  text=text.replace('</head>',extra+'</head>',1);target=output/path.strip('/')/'index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(bake_settings(root,text,'extra'))
  if indexable:added.append(path)
 def label(fa,en):
  if fa==en:return '<span dir="auto">'+escape(fa)+'</span>'
  return '<span dir="auto" data-fa="'+escape(fa)+'" data-en="'+escape(en)+'">'+escape(fa)+'</span>'
 def topic_image(category):
  node=category['root']
  path=('/assets/optimized/medication.865ad3c47438d67a.webp' if node['id']=='toxicology' else
        '/assets/topics/'+TOPIC_ART.get(node['icon'],'stethoscope')+'.webp')
  return '<img width="64" height="64" loading="lazy" decoding="async" alt="" src="'+path+'">'
 def atlas_header(fa,en,parents,category=None,lead=''):
  crumbs=[('خانه','Home','/'),*parents]
  trail=''.join('<a href="'+escape(url)+'">'+label(f,e)+'</a><span aria-hidden="true">/</span>' for f,e,url in crumbs)
  heading='<h1>'+label(fa,en)+'</h1>'
  return ('<header class="atlas-heading glass-surface"><nav aria-label="مسیر صفحه" data-label-fa="مسیر صفحه" data-label-en="Breadcrumb">'+trail+
          '<span aria-current="page">'+label(fa,en)+'</span></nav><div class="atlas-category">'+
          (topic_image(category) if category else '')+heading+'</div>'+lead+'</header>')
 def atlas_group(fa,en,body):
  return '<section class="atlas-listing glass-surface"><h2>'+label(fa,en)+'</h2>'+body+'</section>'
 def article_list(rows):
  if not rows:
   return '<p>'+label('هنوز مطلبی در این مبحث منتشر نشده است.','No articles have been published on this topic yet.')+'</p>'
  return '<ul class="atlas-links">'+''.join(map(linked,rows))+'</ul>'
 directory=('موضوعات','Topics','/topics/')
 cards=[]
 for c in data['categories']:
  node=c['root'];root_url=topic_path(c)
  ids={t['source_id'] for t in c['topics']};members=[p for p in posts if p.get('source_topic_id') in ids]
  links='<ul class="atlas-links">'+''.join('<li><a href="'+topic_path(c,t)+'">'+label(t['fa'],t['en'])+'</a></li>' for t in c['topics'])+'</ul>'
  card='<article class="atlas-card glass-surface"><div class="atlas-category">'+topic_image(c)+'<h2><a href="'+root_url+'">'+label(node['fa'],node['en'])+'</a></h2></div>'
  cards.append(card+'<details><summary>'+label('زیرموضوع‌ها','Subtopics')+' ('+str(len(c['topics']))+')</summary>'+links+'</details></article>')
  parent=(node['fa'],node['en'],root_url)
  page(root_url,node['fa'],'مطالب آموزشی و زیرموضوع‌های '+node['fa'],
       atlas_group('زیرموضوع‌ها','Subtopics',links)+atlas_group('مطالب این شاخه','Articles in this specialty',article_list(members)),
       [('موضوعات','/topics/'),(node['fa'],root_url)],bool(members),atlas_header=atlas_header(node['fa'],node['en'],[directory],c))
  for t in c['topics']:
   matches=[p for p in members if p.get('source_topic_id')==t['source_id']]
   page(topic_path(c,t),t['fa'],'مطالب آموزشی '+t['fa']+' در '+node['fa'],
        atlas_group('مطالب این مبحث','Articles on this topic',article_list(matches)),
        [('موضوعات','/topics/'),(node['fa'],root_url),(t['fa'],topic_path(c,t))],bool(matches),
        atlas_header=atlas_header(t['fa'],t['en'],[directory,parent],c))
 title='موضوعات و زیرشاخه‌های پزشکی'
 lead='<p>'+label('یک شاخه را باز کنید تا زیرموضوع‌ها و مطالب آن را ببینید.','Choose a specialty to explore its topics and articles.')+'</p>'
 page('/topics/',title,'فهرست مباحث پزشکی و مطالب منتشرشده در هر مبحث.','<div class="atlas-grid">'+''.join(cards)+'</div>',
      [('موضوعات','/topics/')],atlas_header=atlas_header(title,'Medical topics and specialties',[],lead=lead))
 for p in posts:
  title=p.get('title_fa') or p.get('title_en');body=p.get('body_fa') or p.get('body_en') or '';description=re.sub(r'[#*_>`]','',body.split('\n')[0])[:240];markup=''
  image=p.get('image','')
  if image.startswith('/assets/') or urlsplit(image).scheme=='https':
   markup+='<a class="article-cover" href="'+escape(image)+'"><img src="'+escape(image)+'" alt="'+escape(title)+'" decoding="async" fetchpriority="high" referrerpolicy="no-referrer"></a>'
  markup+='<div class="article-body" dir="'+('rtl' if p.get('body_fa') else 'ltr')+'">'+''.join('<p>'+escape(x).replace('\n','<br>')+'</p>' for x in body.split('\n\n') if x.strip())+'</div>'
  # Preserve the static reading copy; progressively render the editor's Markdown
  # and its second language when one was supplied by the author.
  copies={lang:{'title':p['title_'+lang],'body':p['body_'+lang]} for lang in ('fa','en') if p.get('title_'+lang) and p.get('body_'+lang)}
  if len(copies)>1 or re.search(r'(?m)^#|^>|^[-*] |^\d+\. |\*|\]\(|`',body):
   encoded=json.dumps(copies,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
   markup+='<script type="application/json" id="article-copies">'+encoded+'</script>'
  if p.get('source_topic_id'):markup+='<p class="article-source">منبع: <span lang="en" dir="ltr">Harrison 2025</span></p>'
  else:markup+=''.join('<p class="article-source"><a rel="noopener noreferrer" href="'+escape(s['url'])+'">'+escape(s.get('title') or s['url'])+'</a></p>' for s in p.get('sources',[]) if urlsplit(s.get('url','')).scheme=='https')
  if p.get('hashtags'):markup+='<p class="article-tags">'+escape(' '.join(p['hashtags']))+'</p>'
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
