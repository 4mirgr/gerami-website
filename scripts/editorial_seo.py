"""Static, crawlable pages for the pinned taxonomy and approved public articles only."""
import html,json,re,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
from physician_profile import SITE, NAME, ENGLISH, article_author, write_discovery
def generate(root,output):
 from site_studio import TOPIC_ART, bake_settings, public_document
 root,output=Path(root),Path(output);escape=lambda s:html.escape(str(s),quote=True)
 data=public_document(root/'backend/editorial/functions/gerami-editorial/taxonomy.json')
 topics={t['source_id']:(c,t) for c in data['categories'] for t in c['topics']}
 posts=[p for p in public_document(root/'content/articles.json')['articles'] if p.get('status')=='published']
 # Reuse the browser formatter for crawlable bilingual dates, including first paint without JS.
 dates=sorted({p['published_at'] for p in posts if p.get('published_at')})
 formatter="import {postDate} from './js/post-date.mjs';import fs from 'node:fs';const dates=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(Object.fromEntries(dates.map(d=>[d,[postDate(d,'fa'),postDate(d,'en')]]))))"
 date_labels=json.loads(subprocess.run(['node','--input-type=module','-e',formatter],cwd=Path(__file__).resolve().parent.parent,input=json.dumps(dates),text=True,capture_output=True,check=True).stdout) if dates else {}
 def topic_path(c,t=None):return '/topics/'+c['root']['id']+'/'+(t['id']+'/' if t else '')
 def post_path(p):
  if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',p.get('slug','')):raise ValueError('Invalid article slug')
  if p.get('source_topic_id'):
   c,t=topics[p['source_topic_id']]
   if p.get('topic')!=t['id']:raise ValueError('Article topic differs from pinned IntMed source')
   return '/articles/'+c['root']['id']+'/'+t['id']+'/'+p['slug']+'/'
  return '/articles/'+p['slug']+'/'
 audience_names={'patients':('برای عموم','For patients and families'),'professional':('ویژه پزشکان','For clinicians')}
 def english_author(p):
  return p.get('author_en') or ('Dr. '+ENGLISH if p.get('author')==NAME else p.get('author',''))
 def source_link(source):
  url=source.get('url','')
  if urlsplit(url).scheme!='https':return ''
  title=source.get('title') or url
  en=source.get('title_en') or (url if re.search(r'[\u0600-\u06ff]',title) else title)
  return '<p class="article-source"><a rel="noopener noreferrer" href="'+escape(url)+'">'+label(title,en)+'</a></p>'
 def linked(p):return '<li><a href="'+escape(post_path(p))+'">'+label(p.get('title_fa') or p['title_en'],p.get('title_en') or p['title_fa'])+'</a></li>'
 template=(root/'pages/services.html').read_text().replace('data-page="services"','data-page="editorial"')
 # Nested generated paths need root-relative owned resources, never ../css or pages.
 template=re.sub(r'((?:href|src)=")\.\./',r'\1/',template)
 template=re.sub(r'href="(about|contact|blog|projects|appointments|privacy|services)\.html',r'href="/pages/\1.html',template)
 added=[]
 def page(path,title,description,body,crumbs,indexable=True,article=None,atlas_header=None,*,title_en,description_en):
  text=re.sub(r' data-(?:content|link)-key="[^"]+"','',template)
  title_fa=title+' | دکتر گرامی'
  title_en=title_en+' | Dr. Amir Houshang Gerami'
  text=re.sub(r'<title[^>]*>.*?</title>',lambda _:'<title data-fa="'+escape(title_fa)+'" data-en="'+escape(title_en)+'">'+escape(title_fa)+'</title>',text,count=1)
  text=re.sub(r'<meta name="description"[^>]*>',lambda _:'<meta name="description" content="'+escape(description[:240])+'" data-fa="'+escape(description[:240])+'" data-en="'+escape(description_en[:240])+'">',text,count=1)
  text=re.sub(r'<link rel="canonical"[^>]*>',lambda _:'<link rel="canonical" href="'+SITE+escape(path)+'">',text,count=1)
  # The template's service-specific social attributes must not describe an article.
  text=re.sub(r'<meta[^>]+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>','',text)
  if atlas_header:
   main='<main class="container topic-atlas" id="main" tabindex="-1">'+atlas_header+body+'</main>'
   text=text.replace('</head>','<link rel="stylesheet" href="/css/catalog.css"></head>',1)
  if article:
   links=['<a href="'+escape(url)+'">'+label(fa,en)+'</a>' for fa,en,url in [('خانه','Home','/'),*crumbs[:-1]]]
   trail='<nav aria-label="مسیر مطلب" data-label-fa="مسیر مطلب" data-label-en="Article breadcrumb">'+'<span aria-hidden="true">/</span>'.join(links)+'</nav>'
   audience_label='<span data-fa="ویژه پزشکان" data-en="For clinicians">ویژه پزشکان</span> · ' if article.get('audience')=='professional' else '<span data-fa="برای عموم" data-en="For patients and families">برای عموم</span> · '
   author=article_author(article.get('author'))
   byline=label(author['name'],english_author(article)) if author else ''
   if author and 'url' in author:
    byline='<a rel="author" href="'+author['url']+'">'+byline+'</a>'
   day=article.get('published_at','')
   fa_date,en_date=date_labels.get(day,('',''))
   time='<time datetime="'+escape(day)+'" dir="auto" data-fa="'+escape(fa_date)+'" data-en="'+escape(en_date)+'">'+escape(fa_date)+'</time>'
   header='<header>'+trail+'<h1 dir="auto">'+escape(title)+'</h1><p class="byline">'+audience_label+(byline+' · ' if byline else '')+time+'</p></header>'
   discussion='<section class="discussion" data-discussion="'+escape(article['slug'])+'" id="discussion"><h2 data-fa="دیدگاه خوانندگان" data-en="Reader discussion">دیدگاه خوانندگان</h2><div data-discussion-ui></div><noscript>برای ثبت دیدگاه یا پسندیدن، جاوااسکریپت را فعال کنید.</noscript></section>'
   main='<main class="reader" id="main" tabindex="-1"><article class="reader-sheet">'+header+body+'</article>'+discussion+'</main>'
   text=text.replace('</head>','<link rel="stylesheet" href="/css/article.css"><script type="module" src="/js/discussion.js"></script></head>',1)
  text=re.sub(r'<main\b.*?</main>',lambda _:main,text,count=1,flags=re.S)
  graph=[{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+u} for i,(n,_,u) in enumerate([('خانه','Home','/'),*crumbs])]}]
  if article:
   node={'@type':'Article','headline':title,'description':description[:240],'inLanguage':'fa-IR' if article.get('title_fa') else 'en','mainEntityOfPage':SITE+path,'datePublished':article.get('published_at'),'citation':'Harrison 2025' if article.get('source_topic_id') else [s.get('title','') for s in article.get('sources',[])]}
   if author:node['author']=author
   node['audience']={'@type':'Audience','audienceType':audience_names.get(article.get('audience'),audience_names['patients'])[1]}
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
  content=('<nav aria-label="مسیر صفحه" data-label-fa="مسیر صفحه" data-label-en="Breadcrumb">'+trail+
           '<span aria-current="page">'+label(fa,en)+'</span></nav><div class="atlas-category">'+
           (topic_image(category) if category else '')+heading+'</div>'+lead)
  if not category:
   book='<img class="section-emblem" width="124" height="124" decoding="async" alt="" src="/assets/optimized/learning-book.6cea0e7729990418.webp">'
   content='<div class="catalog-banner"><div>'+content+'</div>'+book+'</div>'
  return '<header class="atlas-heading glass-surface">'+content+'</header>'
 def atlas_group(fa,en,body):
  return '<section class="atlas-listing glass-surface"><h2>'+label(fa,en)+'</h2>'+body+'</section>'
 def article_list(rows):
  if not rows:
   return '<p>'+label('هنوز مطلبی در این مبحث منتشر نشده است.','No articles have been published on this topic yet.')+'</p>'
  groups=[]
  for audience,(fa,en) in audience_names.items():
   matches=sorted((row for row in rows if row.get('audience','patients')==audience),key=lambda row:(row.get('published_at',''),row['slug']),reverse=True)
   if matches:
    groups.append('<div class="audience-shelf"><h3>'+label(fa,en)+'</h3><ul class="atlas-links">'+''.join(map(linked,matches))+'</ul></div>')
  return '<div class="audience-shelves">'+''.join(groups)+'</div>'
 directory=('موضوعات','Topics','/topics/')
 cards=[]
 for c in data['categories']:
  node=c['root'];root_url=topic_path(c)
  child_ids={t['id'] for t in c['topics']};members=[p for p in posts if p.get('topic') in child_ids or p.get('topic')==node['id']]
  links='<ul class="atlas-links">'+''.join('<li><a href="'+topic_path(c,t)+'">'+label(t['fa'],t['en'])+'</a></li>' for t in c['topics'])+'</ul>'
  card='<article class="atlas-card glass-surface"><div class="atlas-category">'+topic_image(c)+'<h2><a href="'+root_url+'">'+label(node['fa'],node['en'])+'</a></h2></div>'
  cards.append(card+'<details><summary>'+label('زیرموضوع‌ها','Subtopics')+' ('+str(len(c['topics']))+')</summary>'+links+'</details></article>')
  parent=(node['fa'],node['en'],root_url)
  page(root_url,node['fa'],'مطالب آموزشی و زیرموضوع‌های '+node['fa'],
       atlas_group('زیرموضوع‌ها','Subtopics',links)+atlas_group('مطالب این شاخه','Articles in this specialty',article_list(members)),
       [directory,parent],bool(members),atlas_header=atlas_header(node['fa'],node['en'],[directory],c),title_en=node['en'],description_en='Medical articles and topics in '+node['en'])
  for t in c['topics']:
   matches=[p for p in members if p.get('topic')==t['id']]
   page(topic_path(c,t),t['fa'],'مطالب آموزشی '+t['fa']+' در '+node['fa'],
        atlas_group('مطالب این مبحث','Articles on this topic',article_list(matches)),
        [directory,parent,(t['fa'],t['en'],topic_path(c,t))],bool(matches),
        atlas_header=atlas_header(t['fa'],t['en'],[directory,parent],c),title_en=t['en'],description_en='Medical articles on '+t['en']+' in '+node['en'])
 title='موضوعات و زیرشاخه‌های پزشکی'
 lead='<p>'+label('یک شاخه را باز کنید تا زیرموضوع‌ها و مطالب آن را ببینید.','Choose a specialty to explore its topics and articles.')+'</p>'
 page('/topics/',title,'فهرست مباحث پزشکی و مطالب منتشرشده در هر مبحث.','<div class="atlas-grid">'+''.join(cards)+'</div>',
      [directory],atlas_header=atlas_header(title,'Medical topics and specialties',[],lead=lead),title_en='Medical topics and specialties',description_en='Browse medical specialties, topics and published articles.')
 for p in posts:
  title=p.get('title_fa') or p.get('title_en');body=p.get('body_fa') or p.get('body_en') or '';description=re.sub(r'[#*_>`]','',body.split('\n')[0])[:240];markup=''
  title_en=p.get('title_en') or title
  description_en=re.sub(r'[#*_>`]','',(p.get('body_en') or body).split('\n')[0])[:240]
  image=p.get('image','')
  if image.startswith('/assets/') or urlsplit(image).scheme=='https':
   markup+='<a class="article-cover" href="'+escape(image)+'"><img src="'+escape(image)+'" alt="'+escape(p.get('image_alt') or title)+'" data-alt-fa="'+escape(p.get('image_alt') or title)+'" data-alt-en="'+escape(p.get('image_alt_en') or title_en)+'" decoding="async" fetchpriority="high" referrerpolicy="no-referrer"></a>'
  markup+='<div class="article-body" dir="'+('rtl' if p.get('body_fa') else 'ltr')+'">'+''.join('<p>'+escape(x).replace('\n','<br>')+'</p>' for x in body.split('\n\n') if x.strip())+'</div>'
  # Preserve the static reading copy; progressively render the editor's Markdown
  # and its second language when one was supplied by the author.
  copies={lang:{'title':p['title_'+lang],'body':p['body_'+lang]} for lang in ('fa','en') if p.get('title_'+lang) and p.get('body_'+lang)}
  if len(copies)>1 or re.search(r'(?m)^#|^>|^[-*] |^\d+\. |\*|\]\(|`',body):
   encoded=json.dumps(copies,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
   markup+='<script type="application/json" id="article-copies">'+encoded+'</script>'
  if p.get('source_topic_id'):markup+='<p class="article-source">'+label('منبع:','Source:')+' <span lang="en" dir="ltr">Harrison 2025</span></p>'
  else:markup+=''.join(map(source_link,p.get('sources',[])))
  if p.get('hashtags'):markup+='<p class="article-tags">'+label(' '.join(p['hashtags']),' '.join(p.get('hashtags_en') or [tag for tag in p['hashtags'] if tag.isascii()]))+'</p>'
  crumbs=[('همه مطالب','All articles','/pages/blog')]
  if p.get('source_topic_id'):
   c,t=topics[p['source_topic_id']];crumbs=[directory,(c['root']['fa'],c['root']['en'],topic_path(c)),(t['fa'],t['en'],topic_path(c,t))]
   related=[x for x in posts if x.get('source_topic_id')==p['source_topic_id'] and x['slug']!=p['slug']]
   if related:markup+='<h2>'+label('مطالعه بیشتر در همین موضوع','More on this topic')+'</h2>'+article_list(related)
  if p.get('audience')=='patients':
   markup+='<p><a class="button button-secondary" href="/pages/appointments">'+label('راهنمای مراجعه و نوبت‌گیری','Visit and booking information')+'</a></p>'
  fa_date,en_date=date_labels.get(p.get('published_at'),('',''))
  reference=label('، '.join(filter(None,[p.get('author'),title,fa_date])),', '.join(filter(None,[english_author(p),title_en,en_date])))
  markup+='<details class="article-citation"><summary>'+label('ارجاع به این مطلب','Cite this article')+'</summary><p>'+reference+' · <a href="'+SITE+post_path(p)+'">'+label('پیوند پایدار','Permalink')+'</a></p></details>'
  page(post_path(p),title,description,markup,[*crumbs,(title,title_en,post_path(p))],article=p,title_en=title_en,description_en=description_en)
 ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns)
 original=root/'sitemap.xml';tree=ET.parse(original) if original.exists() else ET.ElementTree(ET.Element('{'+ns+'}urlset'))
 existing={n.text for n in tree.findall('.//{'+ns+'}loc')}
 article_dates={post_path(p):max(p.get('published_at',''),p.get('reviewed_at') or '') for p in posts}
 for path in added:
  if SITE+path in existing:continue
  entry=ET.SubElement(tree.getroot(),'{'+ns+'}url')
  ET.SubElement(entry,'{'+ns+'}loc').text=SITE+path
  if re.fullmatch(r'\d{4}-\d{2}-\d{2}',article_dates.get(path,'')):
   ET.SubElement(entry,'{'+ns+'}lastmod').text=article_dates[path]
 tree.write(output/'sitemap.xml',encoding='utf-8',xml_declaration=True)
 write_discovery(output, posts, post_path)
