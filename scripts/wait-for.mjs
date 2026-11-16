// Wait until a URL answers 2xx:  node scripts/wait-for.mjs http://localhost:4000/api/health [timeoutSeconds]
// Sets the exit code instead of calling process.exit() with sockets still open (that trips a libuv assert on Windows).
const [url, secs = '120'] = process.argv.slice(2);

async function main() {
  if (!url) {
    console.error('usage: wait-for.mjs <url> [timeoutSeconds]');
    return 2;
  }
  const deadline = Date.now() + Number(secs) * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { headers: { connection: 'close' } });
      await r.arrayBuffer();
      if (r.ok) {
        console.log(`ready: ${url} (${r.status})`);
        return 0;
      }
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.cause?.code ?? e.message;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`timed out after ${secs}s waiting for ${url} (last: ${last})`);
  return 1;
}

process.exitCode = await main();
