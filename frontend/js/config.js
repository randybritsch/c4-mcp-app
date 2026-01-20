// Configuration
const CONFIG = {
  // Update this to your backend server URL
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'http://192.168.1.237:3001',
  
  WS_URL: window.location.hostname === 'localhost'
    ? 'ws://localhost:3001/ws'
    : 'ws://192.168.1.237:3001/ws',
  
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
