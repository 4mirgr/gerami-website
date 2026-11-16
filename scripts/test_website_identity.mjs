import assert from 'node:assert/strict';
import {passwordHash,passwordMatches} from '../server/identity/crypto.mjs';
const hash=await passwordHash('correct horse battery staple','test-pepper-'.repeat(4));
assert.ok(!hash.includes('correct horse'));
assert.equal(await passwordMatches('correct horse battery staple',hash,'test-pepper-'.repeat(4)),true);
assert.equal(await passwordMatches('wrong password',hash,'test-pepper-'.repeat(4)),false);
console.log('PASS: native password derivation and comparison.');
