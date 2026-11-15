import assert from 'node:assert/strict';
import {consumeHandoff} from '../deploy/aus-access-session.mjs';
const values=new Map();const storage={getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k)};
values.set('gerami-aus-handoff',JSON.stringify({created_at:Date.now(),tokens:{access_token:'access-token',refresh_token:'refresh-token',expires_in:3600}}));assert.equal(consumeHandoff(storage).access_token,'access-token');assert.equal(consumeHandoff(storage),null);
values.set('gerami-aus-handoff',JSON.stringify({created_at:Date.now()-61000,tokens:{access_token:'expired',refresh_token:'secret'}}));assert.equal(consumeHandoff(storage),null);assert.equal(values.size,0);
console.log('PASS: private account handoff is bounded, one-use, transient and removed before parsing.');
