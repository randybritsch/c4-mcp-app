const request = require('supertest');
const app = require('../app');

describe('Health Endpoint', () => {
  test('GET /api/v1/health should return 200', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });
});

describe('Auth Endpoint', () => {
  test('POST /api/v1/auth/token should return token with valid deviceId', async () => {
    const response = await request(app)
      .post('/api/v1/auth/token')
      .send({
        deviceId: 'test-device-123',
        deviceName: 'Test Device',
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('expiresIn');
  });

  test('POST /api/v1/auth/token should return 400 without deviceId', async () => {
    const response = await request(app)
      .post('/api/v1/auth/token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toHaveProperty('code', 'MISSING_PARAMETER');
  });

  test('POST /api/v1/auth/token should return 400 for invalid JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/token')
      .set('Content-Type', 'application/json')
      .send('{"deviceId": "test"')

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
        correlationId: expect.any(String),
      },
    });
  });

  test('POST /api/v1/auth/token can return non-expiring token when JWT_EXPIRY=never', async () => {
    const prev = process.env.JWT_EXPIRY;
    process.env.JWT_EXPIRY = 'never';
    jest.resetModules();
    const authMiddleware = require('../middleware/auth');
    const jwt = require('jsonwebtoken');

    const token = authMiddleware.generateToken({ deviceId: 'test-device-never' });
    const decoded = jwt.decode(token);

    expect(decoded).toHaveProperty('deviceId', 'test-device-never');
    expect(decoded).not.toHaveProperty('exp');

    if (prev === undefined) {
      delete process.env.JWT_EXPIRY;
    } else {
      process.env.JWT_EXPIRY = prev;
    }
  });
});

describe('Voice Endpoint', () => {
  let token;

  beforeAll(async () => {
    const authResponse = await request(app)
      .post('/api/v1/auth/token')
      .send({ deviceId: 'test-device' });
    token = authResponse.body.token;
  });

  test('POST /api/v1/voice/process should require authentication', async () => {
    const response = await request(app)
      .post('/api/v1/voice/process')
      .send({ audioData: 'fake-audio-data' });

    expect(response.status).toBe(401);
  });

  test('POST /api/v1/voice/process should return 400 without audioData', async () => {
    const response = await request(app)
      .post('/api/v1/voice/process')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toHaveProperty('code', 'MISSING_PARAMETER');
  });
});

describe('404 Handler', () => {
  test('Unknown route should return 404', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
