const root=document.documentElement;
function language(){for(const node of document.querySelectorAll('[data-article-language]'))node.hidden=node.dataset.articleLanguage!==root.lang;for(const node of document.querySelectorAll('[data-copy-fa][data-copy-en]')){const actual=root.lang==='en'?node.dataset.copyEn:node.dataset.copyFa;node.lang=actual;node.dir=actual==='fa'?'rtl':'ltr';}}
language();new MutationObserver(language).observe(root,{attributes:true,attributeFilter:['lang']});
