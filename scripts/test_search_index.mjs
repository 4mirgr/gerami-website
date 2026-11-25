import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {prepareIndex,searchIndex} from '../js/search-index.mjs';

// Exercise the bytes used by the production build and source preview, including draft filtering.
const fixture=String.raw`
import json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'scripts')
import search_index as search
read=search.public_document
def document(path):
    data=read(path)
    if path.name=='articles.json':
        data['articles']=[
            dict(status='published',slug='clinical-asthma',source_topic_id='pulm-asthma',topic='asthma',title_en='Assessing asthma',
                 title_fa='ارزیابی آسم',body_en='Methacholine challenge and FEV1',body_fa='متاکولین و FEV1'),
            dict(status='published',slug='nephro-azotemia',source_topic_id='nephro-azotemia',topic='azotemia',
                 title_en='Kidney function',title_fa='عملکرد کلیه',body_en='Interpreting creatinine',body_fa='تفسیر کراتینین'),
            dict(status='published',slug='general-reading',title_en='Nutrition',title_fa='تغذیه',
                 url='/admin/',body_en='Healthy eating',body_fa='تغذیه سالم'),
            dict(status='draft',slug='secret-article',title_fa='unpublished-marker'),
        ]
    if path.name=='extra-pages.json':
        for visible in (True,False):
            data['pages'].append(dict(slug='public-page' if visible else 'private-page',published=visible,
                title_en='Dietary education' if visible else 'unpublished-marker',title_fa='آموزش تغذیه',
                body_en='Calcium intake',body_fa='دریافت کلسیم'))
    return data
with patch.object(search,'public_document',side_effect=document):
    sys.stdout.buffer.write(search.search_bytes(Path('.')))
`;
const serialized=execFileSync('python3',['-c',fixture],{encoding:'utf8'});
assert.ok(!serialized.includes('unpublished-marker'));
const data=JSON.parse(serialized), index=prepareIndex(data);
const results=(query,lang='en')=>searchIndex(index,query,lang,20);
const urls=(query,lang)=>results(query,lang).map(item=>item.url);
assert.equal(urls('healthy eating')[0],'/articles/general-reading/');
assert.deepEqual(urls('آسم'),urls('ASTHMA'));
assert.deepEqual(urls('COPD'),urls('بیماری انسدادی مزمن ریه'));
assert.ok(urls('asthma').includes('/topics/pulmonology/asthma/'));
assert.ok(urls('kidney creatinine')[0].includes('nephro-azotemia'));
assert.ok(urls('متاکولین FEV1')[0].includes('clinical-'));
assert.ok(urls('اسپيرومتري')[0].endsWith('#spirometry'));
assert.ok(urls('Ventilator training')[0].endsWith('#ventilator'));
assert.equal(urls('calcium intake')[0],'/pages/public-page.html');
assert.ok(results('آسم').every(row=>!/[\u0600-\u06ff]/.test(row.title)));
assert.ok(results('آسم','fa').some(row=>row.kind==='article' && /آسم/.test(row.title)));
assert.deepEqual(results('an and the'),[]);
assert.deepEqual(results('methacholine unlikelynonexistentterm'),[]);
assert.equal(prepareIndex({version:1,rows:[{kind:'page',url:'//example.test',titles:['x','x']},
 {kind:'page',url:'/admin/',titles:['x','x']},{kind:'article',url:'/articles/../admin/',titles:['x','x']}]}).length,0);
for(const topic of ['internal-medicine/general-pocus','cardiology/cardio-htn'])assert.ok(index.some(row=>row.url==='/topics/'+topic+'/'));
console.log('PASS bilingual public search: complete article text, public-only sources, canonical routes, exact/prefix and cross-language ranking.');
