# Frontend README

## Overview

Progressive Web App (PWA) for voice-controlled smart home interface.

## Features

- **Voice Recording:** MediaRecorder API with automatic gain control and noise suppression
- **Real-time Communication:** WebSocket for streaming voice commands
- **Offline Support:** Service Worker caches static assets
- **Responsive Design:** Works on desktop and mobile
- **PWA Installable:** Can be installed on home screen

## File Structure

```
frontend/
├── index.html           # Main HTML file
├── manifest.json        # PWA manifest
├── service-worker.js    # Service worker for offline support
├── css/
│   └── style.css        # Styles
├── js/
│   ├── config.js        # Configuration
│   ├── websocket.js     # WebSocket client
│   ├── voice.js         # Voice recorder
│   └── app.js           # Main application logic
└── icons/               # PWA icons (need to generate)
```

## Configuration

Edit `js/config.js` to set your backend server URL:

```javascript
const CONFIG = {
  API_URL: 'http://your-synology-ip:3000',
  WS_URL: 'ws://your-synology-ip:3000/ws',
  // ...
};
```

## Generate Icons

The app needs PWA icons in various sizes. Generate them from a single source image:

1. Create a 512x512 icon image
2. Use https://realfavicongenerator.net/ or https://www.pwabuilder.com/imageGenerator
3. Download all sizes and place in `icons/` directory

Required sizes:
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

## Local Development

Serve the frontend with any static file server:

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

Then open http://localhost:8080 in your browser.

## Browser Support

- **Chrome/Edge:** Full support
- **Safari:** Full support (iOS 14.3+)
- **Firefox:** Full support

Requires:
- MediaRecorder API
- WebSocket API
- Service Worker API

## Deployment

See [../scripts/deploy-frontend.sh](../scripts/deploy-frontend.sh) for Synology deployment instructions.

## Security

- HTTPS required for MediaRecorder API in production
- Service Worker requires HTTPS (except localhost)
- Configure CORS in backend to match your domain

## Troubleshooting

**Microphone not working:**
- Check browser permissions
- Ensure HTTPS (required for mic access in production)
- Test in Chrome DevTools > Application > Permissions

**WebSocket connection fails:**
- Check backend server is running
- Verify WS_URL in config.js
- Check firewall rules on Synology

**PWA not installable:**
- Ensure manifest.json is valid
- Check Service Worker is registered
- Verify icons exist in all required sizes

## Performance

- **First Load:** ~50KB (HTML + CSS + JS)
- **Cached:** Instant load (Service Worker)
- **Voice Latency:** <500ms WebSocket roundtrip
- **Memory Usage:** <50MB typical
