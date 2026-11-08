import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, createCipheriv, randomBytes, webcrypto } from 'node:crypto';
import ts from 'typescript';

const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/thank-you/personalization.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported, crypto: webcrypto, TextEncoder, TextDecoder, atob, Uint8Array });

function seal(token, payload) {
  const lookup = createHash('sha256').update('wedding-thanks-index-v1:' + token).digest('hex');
  const key = createHash('sha256').update('wedding-thanks-key-v1:' + token).digest();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
  return { [lookup]: { iv: iv.toString('base64'), data: data.toString('base64') } };
}

test('personal greeting uses first names for couples and singles, in viewer order', () => {
  assert.equal(exported.guestGreeting({ name: 'Alex Sample', partnerName: 'Jamie Example' }), 'Alex & Jamie');
  assert.equal(exported.guestGreeting({ name: 'Jamie Example', partnerName: 'Alex Sample' }), 'Jamie & Alex');
  assert.equal(exported.guestGreeting({ name: '  Casey Sample ', partnerName: '' }), 'Casey');
});

test('each invitation can decrypt only its own personal thank-you, including gift flag', async () => {
  const gift = { name: 'Alex Sample', partnerName: 'Jamie Example', gift: true, attended: true };
  const ordinary = { name: 'Casey Sample', partnerName: '', gift: false, attended: false };
  const manifest = { ...seal('test-unpredictable-gift-token', gift), ...seal('test-unpredictable-ordinary-token', ordinary) };
  assert.deepEqual(JSON.parse(JSON.stringify(await exported.decodeThanks('test-unpredictable-gift-token', manifest))), gift);
  assert.deepEqual(JSON.parse(JSON.stringify(await exported.decodeThanks('test-unpredictable-ordinary-token', manifest))), ordinary);
  assert.equal(await exported.decodeThanks('wrong-token', manifest), null);
  assert.equal(JSON.stringify(manifest).includes('Alex'), false);
  assert.equal(JSON.stringify(manifest).includes('test-unpredictable'), false);
});

test('corrupt or malformed personal data is not displayed', async () => {
  const manifest = seal('valid', { name: 'Alex', partnerName: '', gift: true, attended: true });
  const entry = Object.values(manifest)[0];
  entry.data = Buffer.alloc(Buffer.from(entry.data, 'base64').length).toString('base64');
  await assert.rejects(exported.decodeThanks('valid', manifest));
  await assert.rejects(exported.decodeThanks('valid', seal('valid', { name: 'Alex', gift: 'yes' })));
});

test('all guest routes replace RSVP and jam, while private admin route remains', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /route.view !== "contacts"\) return <ThankYouPage/);
  assert.match(app, /<ContactHelper initialAdminKey/);
  assert.doesNotMatch(app, /<JamBoard|<RsvpPage|<GuestCommunity/);
});

test('gallery contains 24 real image pairs with stable dimensions and no paperwork image', () => {
  const photos = JSON.parse(fs.readFileSync('src/thank-you/photos.json', 'utf8'));
  assert.equal(photos.length, 24);
  assert.equal(photos.some(p => p.id === 'memory-21'), false);
  for (const photo of photos) {
    assert.ok(photo.width > 0 && photo.height > 0);
    for (const asset of [photo.src, photo.thumb]) assert.ok(fs.existsSync('public/' + asset.slice(2)));
  }
});
