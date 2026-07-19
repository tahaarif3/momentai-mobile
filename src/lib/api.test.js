import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight contract checks that do not require a browser Capacitor runtime.
test('env example documents required Vite keys', async () => {
  const fs = await import('node:fs/promises');
  const env = await fs.readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(env, /VITE_API_BASE=/);
  assert.match(env, /VITE_SUPABASE_URL=/);
  assert.match(env, /VITE_SUPABASE_ANON_KEY=/);
});

test('capacitor config targets dist/mobile and app id', async () => {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../../capacitor.config.json', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  assert.equal(config.webDir, 'dist/mobile');
  assert.equal(config.appId, 'dev.momentai.app');
});
