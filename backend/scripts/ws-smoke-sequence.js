/* eslint-disable no-console */

// Smoke test: set presence, then issue a second command, print clarifications.
// Usage:
//   node scripts/ws-smoke-sequence.js --transcript2 "Turn on the Apple TV" --room "Family Room"
//   node scripts/ws-smoke-sequence.js --transcript2 "Watch Roku Basement" --auto true
//   node scripts/ws-smoke-sequence.js --transcript2 "Watch Roku in Basement" --auto true --remote home --powerOff true

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

function pickCandidateIndex(clarification, args) {
  const candidates = (clarification && Array.isArray(clarification.candidates)) ? clarification.candidates : [];
  if (candidates.length === 0) return null;

  const wantName = args.chooseName ? String(args.chooseName).toLowerCase() : '';
  if (wantName) {
    const i = candidates.findIndex((c) => {
      const nm = (c && c.name) ? String(c.name).toLowerCase() : '';
      const label = (c && c.label) ? String(c.label).toLowerCase() : '';
      return nm.includes(wantName) || label.includes(wantName);
    });
    if (i >= 0) return i;
  }

  const idx = args.chooseIndex !== undefined ? Number(args.chooseIndex) : 0;
  if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return idx;
  return 0;
}

async function sendTextCommandWithAutoClarify(ws, transcript, args) {
  const auto = String(args.auto || 'false').toLowerCase() === 'true';

  ws.send(JSON.stringify({ type: 'text-command', transcript }));

  // Multi-step clarification loop.
  // Note: remote-context may arrive out-of-band; we don't block on it here.
  // We only care that clarification candidates are non-empty, and command completes.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const msg = await waitForOneOf(ws, ['command-complete', 'clarification-required', 'error'], 45000);
    if (msg.type === 'clarification-required') {
      const c = msg && msg.clarification ? msg.clarification : null;
      const count = (c && Array.isArray(c.candidates)) ? c.candidates.length : 0;
      console.log('Clarification:', c && c.kind ? c.kind : 'unknown', `(candidates=${count})`);

      if (!auto) return msg;

      const idx = pickCandidateIndex(c, args);
      if (idx === null) {
        console.log('No candidates to choose from; failing.');
        return msg;
      }

      console.log('Auto-choosing index:', idx);
      ws.send(JSON.stringify({ type: 'clarification-choice', choiceIndex: idx }));
      continue;
    }

    return msg;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const host = args.host || '192.168.1.237';
  const port = Number(args.port || 3002);
  const apiBaseUrl = args.api || `http://${host}:${port}`;

  const room = args.room || 'Family Room';
  const transcript1 = args.transcript1 || `I'm in the ${room}`;
  const transcript2 = args.transcript2 || 'Turn on the Apple TV';

  const remoteButton = args.remote ? String(args.remote).trim() : '';
  const doPowerOff = String(args.powerOff || 'false').toLowerCase() === 'true';

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
    if (['intent', 'clarification-required', 'room-context', 'remote-context', 'error'].includes(msg.type)) {
      console.log('WS:', msg.type);
      if (msg.type === 'intent') console.log(JSON.stringify(msg.intent, null, 2));
      else console.log(JSON.stringify(msg, null, 2));
    }
  });

  if (!skipPresence) {
    const presenceResult = await sendTextCommandWithAutoClarify(ws, transcript1, args);
    console.log('Presence result:', presenceResult.type);
    if (presenceResult.type === 'error') {
      console.log(JSON.stringify(presenceResult, null, 2));
      ws.close();
      process.exitCode = 1;
      return;
    }
  }

  const msg = await sendTextCommandWithAutoClarify(ws, transcript2, args);
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

  if (msg.type === 'command-complete' && remoteButton) {
    console.log('Sending remote-control:', remoteButton);
    ws.send(JSON.stringify({ type: 'remote-control', button: remoteButton }));
    const r = await waitForOneOf(ws, ['command-complete', 'error'], 20000);
    console.log('Remote result:', r.type);
    if (r.type === 'error') console.log(JSON.stringify(r, null, 2));
  }

  if (msg.type === 'command-complete' && doPowerOff) {
    console.log('Sending remote-control: power_off');
    ws.send(JSON.stringify({ type: 'remote-control', button: 'power_off' }));
    const r = await waitForOneOf(ws, ['remote-context', 'command-complete', 'error'], 30000);
    console.log('Power-off result:', r.type);
    if (r.type !== 'command-complete') console.log(JSON.stringify(r, null, 2));
  }

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
