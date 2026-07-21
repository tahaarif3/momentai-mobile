import test from 'node:test';
import assert from 'node:assert/strict';

test('onboarding markup is present in index.html with all eight steps', async () => {
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const steps = [
    'welcome',
    'genres',
    'social',
    'auth',
    'camera',
    'notif',
    'paywall',
    'done',
  ];
  assert.match(html, /data-screen="onboarding"/);
  for (const step of steps) {
    assert.match(html, new RegExp(`data-onboard-step="${step}"`));
  }
  assert.match(html, /id="btnOnboardFinish"/);
  assert.match(html, /Maybe later — continue on Free/);
  assert.match(html, /Turn any photo into a playlist/);
  assert.match(html, /What do you/);
  assert.match(html, /data-genre="indie"/);
  assert.match(html, /data-plan="annual"/);
});

test('onboarding module source defines the designed step order', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('./onboarding.js', import.meta.url), 'utf8');
  assert.match(src, /'welcome'/);
  assert.match(src, /'genres'/);
  assert.match(src, /'social'/);
  assert.match(src, /'auth'/);
  assert.match(src, /'camera'/);
  assert.match(src, /'notif'/);
  assert.match(src, /'paywall'/);
  assert.match(src, /'done'/);
  assert.match(src, /momentai_onboarded/);
  assert.match(src, /momentai_taste_genres/);
});
