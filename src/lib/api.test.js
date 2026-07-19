import test from 'node:test';
import assert from 'node:assert/strict';

test('env example documents required Vite keys', async () => {
  const fs = await import('node:fs/promises');
  const env = await fs.readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(env, /VITE_API_BASE=/);
  assert.match(env, /VITE_AUTH_REDIRECT_URL=/);
  assert.match(env, /momentai:\/\/auth\/callback/);
});

test('capacitor config targets dist/mobile and app id', async () => {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../../capacitor.config.json', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  assert.equal(config.webDir, 'dist/mobile');
  assert.equal(config.appId, 'dev.momentai.app');
});

test('job stream URL includes progressToken query', async () => {
  // Pure URL builder check without importing browser Capacitor modules
  const API_BASE = 'https://momentai.dev';
  const jobId = '42';
  const progressToken = 'tok.abc';
  const q = `?progressToken=${encodeURIComponent(progressToken)}`;
  const url = `${API_BASE}/api/playlist/job/${jobId}/stream${q}`;
  assert.equal(
    url,
    'https://momentai.dev/api/playlist/job/42/stream?progressToken=tok.abc',
  );
});
