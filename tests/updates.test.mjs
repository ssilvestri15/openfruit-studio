import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['electron/updates.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
});
const { checkForStudioUpdate } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

const release = (tag, overrides = {}) => async (url, { signal }) => {
  assert.equal(url, 'https://api.github.com/repos/ssilvestri15/openfruit-studio/releases/latest');
  assert.ok(signal);
  return Response.json({ tag_name: tag, draft: false, prerelease: false, ...overrides });
};

test('announces a newer stable release and constructs the official GitHub link', async () => {
  assert.deepEqual(await checkForStudioUpdate('0.9.9', release('v0.10.0', { html_url: 'https://example.com' })), {
    version: '0.10.0',
    releaseUrl: 'https://github.com/ssilvestri15/openfruit-studio/releases/tag/v0.10.0'
  });
  assert.deepEqual(await checkForStudioUpdate('0.1.0-dev', release('0.1.0')), {
    version: '0.1.0',
    releaseUrl: 'https://github.com/ssilvestri15/openfruit-studio/releases/tag/0.1.0'
  });
});

test('ignores unchanged versions, older versions, drafts, prereleases, invalid tags and network failures', async () => {
  for (const response of [
    release('v1.0.0+metadata'), release('v0.10.0'), release('v1.1.0', { draft: true }),
    release('v1.1.0-beta', { prerelease: true }), release('nightly'),
    async () => new Response(null, { status: 404 }), async () => { throw new Error('Offline'); }
  ]) {
    assert.equal(await checkForStudioUpdate('1.0.0', response), null);
  }
});
