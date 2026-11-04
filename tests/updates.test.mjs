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

const entry = (tag, overrides = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...overrides });

const release = (tag, overrides = {}) => async (url, { signal }) => {
  assert.equal(url, 'https://api.github.com/repos/ssilvestri15/openfruit-studio/releases/latest');
  assert.ok(signal);
  return Response.json(entry(tag, overrides));
};

const previewReleases = (...releases) => async (url, { signal }) => {
  assert.equal(url, 'https://api.github.com/repos/ssilvestri15/openfruit-studio/releases?per_page=100');
  assert.ok(signal);
  return Response.json(releases);
};

test('announces a newer stable release and constructs the official GitHub link', async () => {
  assert.deepEqual(await checkForStudioUpdate('0.9.9', release('v0.10.0', { html_url: 'https://example.com' })), {
    status: 'available',
    update: {
      version: '0.10.0',
      releaseUrl: 'https://github.com/ssilvestri15/openfruit-studio/releases/tag/v0.10.0'
    }
  });
  assert.deepEqual(await checkForStudioUpdate('0.1.0-dev', previewReleases(entry('0.1.0'))), {
    status: 'available',
    update: {
      version: '0.1.0',
      releaseUrl: 'https://github.com/ssilvestri15/openfruit-studio/releases/tag/0.1.0'
    }
  });
});

test('preview builds pick the highest eligible version, regardless of release order', async () => {
  const responses = [
    entry('0.1.0-dev.2', { prerelease: true }),
    entry('0.1.0-dev.10', { prerelease: true }),
    entry('0.2.0-dev', { prerelease: true, draft: true }),
    entry('0.1.1-dev'),
    entry('0.1.0-dev.011', { prerelease: true }),
    entry('0.0.9')
  ];
  assert.deepEqual(await checkForStudioUpdate('0.1.0-dev.1', previewReleases(...responses)), {
    status: 'available',
    update: {
      version: '0.1.0-dev.10',
      releaseUrl: 'https://github.com/ssilvestri15/openfruit-studio/releases/tag/0.1.0-dev.10'
    }
  });
  assert.deepEqual(await checkForStudioUpdate('0.1.0-dev.10', previewReleases(...responses)), { status: 'current' });
  assert.equal((await checkForStudioUpdate('0.1.0-dev.1', previewReleases(...responses, entry('0.1.0')))).update?.version, '0.1.0');
});

test('ignores unchanged versions, older versions, drafts, prereleases and invalid tags', async () => {
  for (const response of [
    release('v1.0.0+metadata'), release('v0.10.0'), release('v1.1.0', { draft: true }),
    release('v1.1.0-beta', { prerelease: true }), release('nightly')
  ]) {
    assert.deepEqual(await checkForStudioUpdate('1.0.0', response), { status: 'current' });
  }
});

test('reports a failed GitHub request separately from an up-to-date installation', async () => {
  assert.deepEqual(await checkForStudioUpdate('0.1.0-dev', async () => new Response(null, { status: 404 })), { status: 'unavailable' });
  assert.deepEqual(await checkForStudioUpdate('1.0.0', async () => { throw new Error('Offline'); }), { status: 'unavailable' });
});

test('the selected channel overrides the installed version’s default', async () => {
  const stable = await checkForStudioUpdate('0.1.0-dev', release('0.1.0'), 'stable');
  assert.equal(stable.update?.version, '0.1.0');
  const preview = await checkForStudioUpdate('0.1.0', previewReleases(entry('0.2.0-dev', { prerelease: true })), 'preview');
  assert.equal(preview.update?.version, '0.2.0-dev');
  assert.deepEqual(await checkForStudioUpdate('0.2.0-dev', release('0.1.0'), 'stable'), { status: 'current' });
});
