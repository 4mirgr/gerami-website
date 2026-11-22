import catalog from './taxonomy.json' with {type:'json'};
const clone=x=>JSON.parse(JSON.stringify(x));
export function allTopics(){return catalog.categories.flatMap(c=>c.topics.map(t=>({source_id:t.source_id,source_category:c.source_id,source_label:c.source_label,source_commit:catalog.source_commit,root:clone(c.root),child:clone(t)})));}
export function sourceTopic(id){const item=allTopics().find(t=>t.source_id===id);if(!item)throw Error('source_topic_missing');return item;}
export function ensureArticleTopic(documents,taxonomy){
 const canonical=sourceTopic(taxonomy.source_id);if(taxonomy.root.id!==canonical.root.id||taxonomy.child.id!==canonical.child.id)throw Error('topic_mismatch');
 const roots=documents['content/topics.json'].topics;let root=roots.find(t=>t.id===canonical.root.id);
 if(!root){root={...canonical.root,children:[]};roots.push(root);}
 const anywhere=roots.flatMap(r=>r.children.map(t=>({root:r.id,id:t.id}))).find(t=>t.id===canonical.child.id);
 if(anywhere&&anywhere.root!==root.id)throw Error('topic_conflict');
 if(!root.children.some(t=>t.id===canonical.child.id)){const {source_id,...child}=canonical.child;root.children.push(child);}
 return canonical;
}
export function articlePath(article){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug||''))throw Error('invalid_slug');
 if(article.source_topic_id){const t=sourceTopic(article.source_topic_id);if(t.child.id!==article.topic)throw Error('topic_mismatch');return '/articles/'+t.root.id+'/'+t.child.id+'/'+article.slug+'/';}
 return '/articles/'+article.slug+'/';
}
export const sourceCategories=catalog.categories.map(c=>c.source_id);
