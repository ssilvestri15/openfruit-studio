import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'openfruit-preview-'));
const modulePath = path.join(scratch, 'preview.mjs');
await build({ entryPoints: ['src/utils/previewStream.ts'], bundle: true, platform: 'node', format: 'esm', outfile: modulePath });
const { PreviewStreamParser, h264Codec } = await import(pathToFileURL(modulePath).href);
after(() => rmSync(scratch, { recursive: true, force: true }));

const le = (value, bytes) => { const out = []; let v = BigInt(value); for (let i = 0; i < bytes; i++) { out.push(Number(v & 0xffn)); v >>= 8n; } return out; };
const header = [...Buffer.from('OFPV'), ...le(1, 4)];
// SPS for Main profile (0x4d), constraint 0x00, level 4.0 (0x28), then a slice.
const sps = [0, 0, 0, 1, 0x67, 0x4d, 0x00, 0x28, 0xab];
const slice = [0, 0, 0, 1, 0x65, 0x88, 0x84];
const video = (pts, keyframe, width, height, data) => {
  const payload = [...le(pts, 8), keyframe ? 1 : 0, ...le(width, 2), ...le(height, 2), ...data];
  return [...le(1, 4), ...le(payload.length, 4), ...payload];
};

test('header, fragmented messages and unknown types', () => {
  const parser = new PreviewStreamParser();
  const stream = Uint8Array.from([...header, ...video(33333, true, 804, 1748, [...sps, ...slice]), ...le(9, 4), ...le(2, 4), 7, 7, ...video(66666, false, 804, 1748, slice)]);
  const frames = [];
  for (let i = 0; i < stream.length; i += 5) frames.push(...parser.push(stream.subarray(i, i + 5)));
  assert.equal(frames.length, 2);
  assert.deepEqual([frames[0].presentationUs, frames[0].keyframe, frames[0].width, frames[0].height], [33333, true, 804, 1748]);
  assert.deepEqual([...frames[0].data], [...sps, ...slice]);
  assert.deepEqual([frames[1].presentationUs, frames[1].keyframe], [66666, false]);
  assert.equal(h264Codec(frames[0].data), 'avc1.4d0028');
  assert.equal(h264Codec(frames[1].data), undefined);
});

test('rejects a foreign stream, a future version and oversized messages', () => {
  assert.throws(() => new PreviewStreamParser().push(Uint8Array.from([...Buffer.from('HTTP'), 0, 0, 0, 0])), /non riconosciuto/);
  assert.throws(() => new PreviewStreamParser().push(Uint8Array.from([...Buffer.from('OFPV'), ...le(2, 4)])), /non supportata/);
  assert.throws(() => new PreviewStreamParser().push(Uint8Array.from([...header, ...le(1, 4), ...le(64 * 1024 * 1024, 4)])), /troppo grande/);
});
