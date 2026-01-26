/* eslint-disable no-console */

const WebSocket = require('ws');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    out[key] = val;
    if (val !== 'true') i += 1;
  }
  return out;
}

async function getToken({ apiBaseUrl, deviceId, deviceName }) {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/api/v1/auth/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, deviceName }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Auth failed (${res.status})${body ? `: ${body}` : ''}`);
  }

  const data = await res.json();
  if (!data || typeof data.token !== 'string') throw new Error('Auth response missing token');
  return data.token;
}

function deriveWsUrl(apiBaseUrl) {
  const base = apiBaseUrl.replace(/\/+$/, '');
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}/ws`;
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}/ws`;
  // Assume host:port
  return `ws://${base}/ws`;
}

async function main() {
  const args = parseArgs(process.argv);

  const host = args.host || '192.168.1.237';
  const port = Number(args.port || 3002);
  const apiBaseUrl = args.api || `http://${host}:${port}`;
  const roomName = args.room || '';
  const transcript = args.transcript || "I'm in a romantic mood";

  const deviceId = args.deviceId || `smoke-${Date.now()}`;
  const deviceName = args.deviceName || 'WS Smoke Test';

  console.log('API:', apiBaseUrl);
  console.log('Transcript:', transcript);
  console.log('Room preference:', roomName || '(first candidate)');

  const token = await getToken({ apiBaseUrl, deviceId, deviceName });
  const wsUrl = `${deriveWsUrl(apiBaseUrl)}?token=${encodeURIComponent(token)}`;

  console.log('WS:', wsUrl);

  const ws = new WebSocket(wsUrl);

  const waitFor = (type, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeoutMs);

    const onMsg = (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg || msg.type !== type) return;
      cleanup();
      resolve(msg);
    };

    const onErr = (e) => {
      cleanup();
      reject(e);
    };

    const cleanup = () => {
      clearTimeout(t);
      ws.off('message', onMsg);
      ws.off('error', onErr);
    };

    ws.on('message', onMsg);
    ws.on('error', onErr);
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.send(JSON.stringify({ type: 'text-command', transcript }));

  const clarification = await waitFor('clarification-required');
  console.log('Got clarification-required');
  const candidates = clarification?.clarification?.candidates || [];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No clarification candidates returned');
  }

  const idx = roomName
    ? candidates.findIndex((c) => (c?.name || '').toLowerCase() === roomName.toLowerCase())
    : 0;

  const choiceIndex = idx >= 0 ? idx : 0;
  console.log('Choosing:', choiceIndex, candidates[choiceIndex]?.name);

  ws.send(JSON.stringify({ type: 'clarification-choice', choiceIndex }));

  const complete = await waitFor('command-complete', 30000);
  console.log('Got command-complete');
  console.log(JSON.stringify({
    ok: complete?.result?.success === true,
    aggregate: complete?.result?.aggregate,
    warnings: complete?.result?.warnings,
  }, null, 2));

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
