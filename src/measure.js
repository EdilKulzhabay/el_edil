import { performance } from 'node:perf_hooks';

const REQUEST_TIMEOUT_MS = 60_000;
const BITS_PER_BYTE = 8;
const BYTES_PER_MB = 1_000_000;

/**
 * Downloads the URL once and fully consumes the body.
 * Time is measured from sending the request to receiving the last byte.
 *
 * @param {URL} url
 * @returns {Promise<{ bytes: number, durationMs: number }>}
 */
export async function measureRequest(url) {
  const startedAt = performance.now();

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      // Ask for uncompressed data so counted bytes equal bytes on the wire.
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'User-Agent': 'el_edil/1.0',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  let bytes = 0;
  if (response.body) {
    // Stream instead of buffering: heavy files don't need to fit in memory.
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
    }
  }

  return { bytes, durationMs: performance.now() - startedAt };
}

/**
 * @param {Array<{ bytes: number, durationMs: number }>} results
 */
export function summarize(results) {
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalSeconds = totalMs / 1000;
  const speedMBps = totalSeconds > 0 ? totalBytes / BYTES_PER_MB / totalSeconds : 0;

  return {
    requests: results.length,
    totalBytes,
    totalMB: totalBytes / BYTES_PER_MB,
    averageMs: results.length > 0 ? totalMs / results.length : 0,
    speedMBps,
    speedMbps: speedMBps * BITS_PER_BYTE,
  };
}

/**
 * Runs `count` requests strictly one after another.
 *
 * @param {URL} url
 * @param {number} count
 * @param {(index: number, result: { bytes: number, durationMs: number }) => void} [onResult]
 */
export async function runSequential(url, count, onResult) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await measureRequest(url);
    results.push(result);
    onResult?.(i, result);
  }
  return summarize(results);
}
