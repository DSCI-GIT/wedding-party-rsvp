import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.THANK_YOU_TEST_URL || 'http://127.0.0.1:5175/';
const dir = 'private/thank-you';
const guests = JSON.parse(await fs.readFile(`${dir}/guests.json`, 'utf8'));
const gifts = new Set(JSON.parse(await fs.readFile(`${dir}/gift-households.json`, 'utf8')));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.screenshot({ path: `${dir}/desktop.png` });
  assert.equal(await page.locator('.thanks-photo').count(), 12);
  await page.getByRole('button', { name: /More memories/ }).click();
  assert.equal(await page.locator('.thanks-photo').count(), 24);
  await page.getByRole('button', { name: 'Open wedding photo 5 of 24', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await page.locator('.thanks-lightbox-photo img').evaluate(img => img.decode());
  assert.match(await page.locator('.thanks-lightbox header').innerText(), /5 \/ 24/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.thanks-lightbox header').innerText(), /6 \/ 24/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('.thanks-lightbox header').innerText(), /5 \/ 24/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open wedding photo 5 of 24', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Play the evening', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.thanks-lightbox-photo img')?.complete);
  await page.waitForFunction(() => document.querySelector('.thanks-lightbox header')?.textContent.includes('2 / 24'), { timeout: 12000 });
  await page.getByRole('button', { name: 'Pause slideshow', exact: true }).click();
  await page.screenshot({ path: `${dir}/lightbox.png` });
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  let checked = 0;
  for (const guest of guests) {
    for (const [token, name, partnerName] of [[guest.primaryInviteToken || guest.inviteToken, guest.primaryName, guest.partnerName], [guest.partnerInviteToken, guest.partnerName, guest.primaryName]]) {
      if (!token) continue;
      await page.goto(base + '#invite=' + encodeURIComponent(token));
      const first = n => n.trim().split(/\s+/)[0];
      const greeting = [first(name), partnerName ? first(partnerName) : ''].filter(Boolean).join(' & ');
      await page.getByRole('heading', { name: `Dear ${greeting},`, exact: true }).waitFor();
      assert.equal(await page.getByTestId('gift-thanks').count(), gifts.has(guest.householdId) ? 1 : 0);
      assert.equal(await page.getByRole('button', { name: /Send RSVP/ }).count(), 0);
      checked++;
    }
  }
  const guest = guests.find(entry => gifts.has(entry.householdId));
  await page.goto(base + '#invite=' + encodeURIComponent(guest.primaryInviteToken || guest.inviteToken) + '&view=jam');
  await page.getByTestId('gift-thanks').waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${dir}/mobile-${width}.png` });
  }
  await page.getByRole('button', { name: /Open wedding photo 1 of/ }).click();
  await page.locator('.thanks-lightbox-photo').evaluate(el => {
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: el, clientX: 250 })] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: el, clientX: 100 })] }));
  });
  assert.match(await page.locator('.thanks-lightbox header').innerText(), /2 \/ 24/);
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/personal-desktop.png` });
  await page.locator('.thanks-letter').screenshot({ path: `${dir}/personal-letter.png` });
  await page.locator('.thanks-gallery-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/gallery-desktop.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.thanks-gallery').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.thanks-photo').first().evaluate(el => getComputedStyle(el).opacity), '1');
  if (!process.env.THANK_YOU_TEST_URL) {
    await page.goto(base + '#invite=invalid-test-link');
    await page.getByText(/Your personal note couldn't open/).waitFor();
    assert.equal(await page.getByTestId('gift-thanks').count(), 0);
    assert.equal(await page.locator('.thanks-photo').count(), 12);
  }
  await page.goto(base + '#contacts=');
  await page.getByRole('heading', { name: /contact/i }).first().waitFor();
  assert.equal(await page.locator('.thanks-page').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`Passed: ${checked} personal links, six gift households, old jam-link replacement, gallery navigation, slideshow, swipe, focus restoration, reduced motion, mobile widths 390/320, and admin route.`);
} finally { await browser.close(); }
