import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
for(const file of ['index.html',...(await readdir('pages')).filter(name=>name.endsWith('.html')).map(name=>'pages/'+name)]){
 const html=await readFile(file,'utf8');assert.match(html,/data-account-menu/,file+' should have a shared header account menu');assert.doesNotMatch(html,/data-app-entry="aus"|data-destination="aus"|href="[^\"]*(?:\/aus\/|#aus)/,file+' must not advertise the private application');
}
console.log('PASS: shared header login/signup and no public private-project entry.');
