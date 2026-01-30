/* eslint-disable no-console */

// Smoke test: set presence, then issue a second command, print clarifications.
// Usage:
//   node scripts/ws-smoke-sequence.js --transcript2 "Turn on the Apple TV" --room "Family Room"

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
  return `ws://${base}/ws`;
}

function waitForOneOf(ws, types, timeoutMs = 20000) {
  const want = new Set(types);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for one of: ${types.join(', ')}`));
    }, timeoutMs);

    const onMsg = (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg || !want.has(msg.type)) return;
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
}

async function main() {
  const args = parseArgs(process.argv);

  const host = args.host || '192.168.1.237';
  const port = Number(args.port || 3002);
  const apiBaseUrl = args.api || `http://${host}:${port}`;

  const room = args.room || 'Family Room';
  const transcript1 = args.transcript1 || `I'm in the ${room}`;
  const transcript2 = args.transcript2 || 'Turn on the Apple TV';

  const skipPresence = String(args.skipPresence || 'false').toLowerCase() === 'true';

  const deviceId = args.deviceId || `smoke-${Date.now()}`;
  const deviceName = args.deviceName || 'WS Smoke Sequence';

  console.log('API:', apiBaseUrl);
  console.log('Transcript 1:', skipPresence ? '(skipped)' : transcript1);
  console.log('Transcript 2:', transcript2);

  const token = await getToken({ apiBaseUrl, deviceId, deviceName });
  const wsUrl = `${deriveWsUrl(apiBaseUrl)}?token=${encodeURIComponent(token)}`;
  console.log('WS:', wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (['intent', 'clarification-required', 'room-context', 'error'].includes(msg.type)) {
      console.log('WS:', msg.type);
      if (msg.type === 'intent') console.log(JSON.stringify(msg.intent, null, 2));
      else console.log(JSON.stringify(msg, null, 2));
    }
  });

  if (!skipPresence) {
    ws.send(JSON.stringify({ type: 'text-command', transcript: transcript1 }));
    const presenceResult = await waitForOneOf(ws, ['command-complete', 'clarification-required', 'error'], 45000);
    console.log('Presence result:', presenceResult.type);
    if (presenceResult.type === 'error') {
      console.log(JSON.stringify(presenceResult, null, 2));
      ws.close();
      process.exitCode = 1;
      return;
    }
  }

  ws.send(JSON.stringify({ type: 'text-command', transcript: transcript2 }));
  const msg = await waitForOneOf(ws, ['command-complete', 'clarification-required', 'error'], 45000);
  console.log('Command result:', msg.type);

  if (msg.type === 'clarification-required') {
    console.log(JSON.stringify({
      kind: msg?.clarification?.kind,
      prompt: msg?.clarification?.prompt,
      candidates: (msg?.clarification?.candidates || []).slice(0, 20),
    }, null, 2));
  } else {
    console.log(JSON.stringify(msg, null, 2).slice(0, 3000));
  }

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
