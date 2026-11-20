#!/usr/bin/env node
import { runSequential } from './measure.js';

const REQUEST_COUNT = 10;
const USAGE = 'Usage: node src/cli.js <url>\nExample: node src/cli.js https://example.com/big.jpg';

function parseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const fmt = (n, digits = 2) => n.toFixed(digits);

async function main() {
  const url = parseUrl(process.argv[2]);
  if (!url) {
    console.error(`Error: pass a valid http(s) URL.\n\n${USAGE}`);
    process.exit(1);
  }

  console.log(`Downloading ${url.href} ${REQUEST_COUNT} times sequentially...\n`);

  const summary = await runSequential(url, REQUEST_COUNT, (i, { bytes, durationMs }) => {
    const n = String(i + 1).padStart(2);
    console.log(`#${n}  ${fmt(durationMs, 0).padStart(6)} ms  ${fmt(bytes / 1e6, 3)} MB`);
  });

  console.log('\n--- Result ---');
  console.log(`Requests:          ${summary.requests}`);
  console.log(`Average time:      ${fmt(summary.averageMs, 1)} ms`);
  console.log(`Total downloaded:  ${fmt(summary.totalMB, 3)} MB (${summary.totalBytes} bytes)`);
  console.log(`Download speed:    ${fmt(summary.speedMbps)} Mbit/s (${fmt(summary.speedMBps)} MB/s)`);
}

main().catch((error) => {
  const reason = error instanceof Error ? (error.cause?.message ?? error.message) : String(error);
  console.error(`Request failed: ${reason}`);
  process.exit(1);
});
