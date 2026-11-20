import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runSequential, summarize, measureRequest } from '../src/measure.js';

const PAYLOAD_SIZE = 256 * 1024;
const payload = Buffer.alloc(PAYLOAD_SIZE, 1);

let server;
let baseUrl;
let inFlight = 0;
let maxInFlight = 0;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/missing') {
      res.writeHead(404).end();
      return;
    }
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    res.writeHead(200, { 'Content-Length': PAYLOAD_SIZE });
    // Small delay so overlapping requests would be detected.
    setTimeout(() => {
      res.end(payload, () => inFlight--);
    }, 20);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('downloads full body on every request and counts bytes', async () => {
  const summary = await runSequential(new URL(`${baseUrl}/file`), 10);

  assert.equal(summary.requests, 10);
  assert.equal(summary.totalBytes, PAYLOAD_SIZE * 10);
  assert.ok(summary.averageMs > 0);
  assert.ok(summary.speedMbps > 0);
});

test('requests run sequentially, never in parallel', async () => {
  maxInFlight = 0;
  await runSequential(new URL(`${baseUrl}/file`), 5);
  assert.equal(maxInFlight, 1);
});

test('throws on non-2xx response', async () => {
  await assert.rejects(measureRequest(new URL(`${baseUrl}/missing`)), /HTTP 404/);
});

test('summarize converts units correctly', () => {
  // 10 MB in 1 s total => 10 MB/s => 80 Mbit/s
  const summary = summarize([
    { bytes: 5_000_000, durationMs: 500 },
    { bytes: 5_000_000, durationMs: 500 },
  ]);
  assert.equal(summary.averageMs, 500);
  assert.equal(summary.speedMBps, 10);
  assert.equal(summary.speedMbps, 80);
});
