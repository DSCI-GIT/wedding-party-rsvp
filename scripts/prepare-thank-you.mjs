import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const root = process.cwd();
const privateDir = path.join(root, 'private', 'thank-you');
await fs.mkdir(privateDir, { recursive: true });
const args = new Set(process.argv.slice(2));
if (args.has('--refresh-guests')) {
  const workflow = await fs.readFile('.github/workflows/deploy.yml', 'utf8');
  const endpoint = workflow.match(/VITE_RSVP_API_URL:\s*(\S+)/)?.[1];
  const adminKey = (await fs.readFile('private/google-sheet-seed/admin-key.txt', 'utf8')).trim();
  const result = await fetch(endpoint + '?' + new URLSearchParams({ action: 'adminList', adminKey }), { signal: AbortSignal.timeout(90000) }).then(r => r.json());
  if (!result.ok || !Array.isArray(result.rows)) throw Error(result.error || 'Guest list unavailable');
  const guests = result.rows.map(row => ({ householdId: row.householdId, primaryName: row.primaryName, partnerName: row.partnerName, householdLabel: row.householdLabel, inviteToken: row.inviteToken, primaryInviteToken: row.primaryInviteToken, partnerInviteToken: row.partnerInviteToken, rsvpStatus: row.rsvpStatus }));
  await fs.writeFile(path.join(privateDir, 'guests.json'), JSON.stringify(guests, null, 2));
  console.log(`Refreshed ${guests.length} households; no contact details exported.`);
}
if (args.has('--photos')) {
  const require = createRequire(import.meta.url);
  const sharp = require(process.env.SHARP_PATH || 'sharp');
  const sourceDir = process.env.WEDDING_PHOTO_DIR || 'C:/Users/er1c_/OneDrive/Pictures/Wedding';
  const files = (await fs.readdir(sourceDir)).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  const output = path.join(root, 'public', 'wedding');
  await fs.mkdir(output, { recursive: true });
  const photos = [], tiles = [];
  for (let i = 0; i < files.length; i++) {
    const id = `memory-${String(i + 1).padStart(2, '0')}`;
    if (files[i] === 'October 30 2026 102.JPG') continue;
    const full = await sharp(path.join(sourceDir, files[i])).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 83 }).toBuffer({ resolveWithObject: true });
    await fs.writeFile(path.join(output, id + '.webp'), full.data);
    await sharp(full.data).resize({ width: 640, height: 800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(output, id + '-thumb.webp'));
    photos.push({ id, src: `./wedding/${id}.webp`, thumb: `./wedding/${id}-thumb.webp`, width: full.info.width, height: full.info.height, alt: `A moment from Sunyoung and Eric's wedding celebration, photo ${i + 1}` });
    const tile = await sharp(full.data).resize(230, 180, { fit: 'contain', background: '#ffffff' }).jpeg().toBuffer();
    tiles.push({ input: tile, left: (i % 5) * 240, top: Math.floor(i / 5) * 210 });
    tiles.push({ input: Buffer.from(`<svg width="230" height="25"><text x="5" y="18" font-size="16">${id}</text></svg>`), left: (i % 5) * 240, top: Math.floor(i / 5) * 210 + 180 });
  }
  await sharp({ create: { width: 1200, height: Math.ceil(files.length / 5) * 210, channels: 3, background: '#eee' } }).composite(tiles).jpeg().toFile(path.join(privateDir, 'contact-sheet.jpg'));
  await fs.writeFile('src/thank-you/photos.json', JSON.stringify(photos, null, 2) + '\n');
  console.log(`Prepared ${photos.length} optimized photos, metadata removed.`);
}
if (args.has('--personalize')) {
  const guests = JSON.parse(await fs.readFile(path.join(privateDir, 'guests.json'), 'utf8'));
  const gifts = JSON.parse(await fs.readFile(path.join(privateDir, 'gift-households.json'), 'utf8'));
  const found = new Set();
  const manifest = {};
  for (const guest of guests) {
    const gift = gifts.includes(guest.householdId);
    if (gift) found.add(guest.householdId);
    const primary = guest.primaryInviteToken || guest.inviteToken;
    const tokens = [...new Set([primary, guest.inviteToken, guest.partnerInviteToken].filter(Boolean))];
    for (const token of tokens) {
      const partner = token === guest.partnerInviteToken;
      const payload = { name: partner ? guest.partnerName : guest.primaryName, partnerName: partner ? guest.primaryName : guest.partnerName, gift, attended: guest.rsvpStatus === 'yes' };
      const lookup = createHash('sha256').update('wedding-thanks-index-v1:' + token).digest('hex');
      const key = createHash('sha256').update('wedding-thanks-key-v1:' + token).digest();
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
      manifest[lookup] = { iv: iv.toString('base64'), data: encrypted.toString('base64') };
    }
  }
  const missing = gifts.filter(id => !found.has(id));
  if (missing.length) throw Error('Gift households not found in latest list: ' + missing.join(', '));
  await fs.writeFile('public/thank-you-guests.json', JSON.stringify(manifest) + '\n');
  console.log(`Prepared ${Object.keys(manifest).length} encrypted personal greetings; ${found.size} gift households matched. No raw tokens or names in public manifest.`);
}
