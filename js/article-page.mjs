const root=document.documentElement;
function language(){for(const node of document.querySelectorAll('[data-article-language]'))node.hidden=node.dataset.articleLanguage!==root.lang;}
language();new MutationObserver(language).observe(root,{attributes:true,attributeFilter:['lang']});
