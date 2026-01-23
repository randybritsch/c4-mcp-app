function deriveWsUrlFromApiUrl(apiUrl) {
  const wsProtocol = apiUrl.startsWith('https://') ? 'wss://' : 'ws://';
  const hostPort = apiUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${wsProtocol}${hostPort}/ws`;
}

function getOverrides() {
  const params = new URLSearchParams(window.location.search);

  // Query-string overrides (highest priority)
  // - ?backend=http://192.168.1.237:3002
  // - ?api=http://192.168.1.237:3002&ws=ws://192.168.1.237:3002/ws
  const backend = params.get('backend');
  const api = params.get('api');
  const ws = params.get('ws');

  if (backend) {
    const normalizedBackend = backend.replace(/\/+$/, '');
    return {
      apiUrl: normalizedBackend,
      wsUrl: deriveWsUrlFromApiUrl(normalizedBackend),
    };
  }

  if (api || ws) {
    const normalizedApi = api ? api.replace(/\/+$/, '') : null;
    const normalizedWs = ws ? ws.replace(/\/+$/, '') : null;
    return {
      apiUrl: normalizedApi,
      wsUrl: normalizedWs || (normalizedApi ? deriveWsUrlFromApiUrl(normalizedApi) : null),
    };
  }

  // LocalStorage overrides (fallback)
  const apiUrlStored = localStorage.getItem('c4_api_url');
  const wsUrlStored = localStorage.getItem('c4_ws_url');
  if (apiUrlStored || wsUrlStored) {
    const normalizedApi = apiUrlStored ? apiUrlStored.replace(/\/+$/, '') : null;
    const normalizedWs = wsUrlStored ? wsUrlStored.replace(/\/+$/, '') : null;
    return {
      apiUrl: normalizedApi,
      wsUrl: normalizedWs || (normalizedApi ? deriveWsUrlFromApiUrl(normalizedApi) : null),
    };
  }

  return { apiUrl: null, wsUrl: null };
}

// Configuration
const overrides = getOverrides();

// Reference deployment (Synology Container Manager): backend exposed on port 3002.
// For local development with `npm start` (default port 3000), use `?backend=http://localhost:3000`.
const defaultApiUrl = window.location.hostname === 'localhost'
  ? 'http://localhost:3002'
  : `http://${window.location.hostname}:3002`;

const apiUrl = (overrides.apiUrl || defaultApiUrl).replace(/\/+$/, '');
const wsUrl = (overrides.wsUrl || deriveWsUrlFromApiUrl(apiUrl)).replace(/\/+$/, '');

const CONFIG = {
  // Backend server URL
  API_URL: apiUrl,
  WS_URL: wsUrl,

  // Device identification
  DEVICE_ID: getOrCreateDeviceId(),
  DEVICE_NAME: getDeviceName(),
};

/**
 * Get or create device ID
 */
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = 'device-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

/**
 * Get device name
 */
function getDeviceName() {
  const userAgent = navigator.userAgent;
  if (/Android/i.test(userAgent)) return 'Android Device';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS Device';
  return 'Web Browser';
}
