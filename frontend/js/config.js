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

// Default backend selection:
// - If the UI is served over HTTPS, default to the NAS reverse-proxy HTTPS port for the backend.
//   (In the current NAS deployment, https://<host>/api is NOT proxied and returns 404.)
// - Otherwise, default to the direct backend port (e.g., Synology Container Manager port mapping).
// You can always override with:
// - `?backend=https://192.168.1.237:4443`
// - `localStorage.c4_api_url = 'https://192.168.1.237:4443'`
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isHttpsPage = window.location.protocol === 'https:';

const defaultApiUrl = isLocalhost
  ? 'http://localhost:3002'
  : (isHttpsPage
    ? `https://${window.location.hostname}:4443`
    : `http://${window.location.hostname}:3002`);

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
