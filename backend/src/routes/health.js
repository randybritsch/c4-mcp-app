const express = require('express');

const config = require('../config');
const mcpClient = require('../services/mcp-client');

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/v1/health
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
  });
});

/**
 * MCP connectivity check
 * GET /api/v1/health/mcp
 */
router.get('/mcp', async (req, res) => {
  try {
    const toolsResp = await mcpClient.listTools(req.correlationId);

    const normalizeToolNames = (resp) => {
      if (!resp) return null;

      // Prefer the actual tool map when present.
      if (resp && typeof resp === 'object' && resp.tools && typeof resp.tools === 'object') {
        return Object.keys(resp.tools);
      }

      // Common shapes
      const candidates = [
        resp,
        resp.tools,
        resp.result?.tools,
        resp.result?.result?.tools,
      ];

      for (const c of candidates) {
        if (!c) continue;
        if (Array.isArray(c)) {
          return c
            .map((t) => {
              if (!t) return null;
              if (typeof t === 'string') return t;
              if (typeof t === 'object' && typeof t.name === 'string') return t.name;
              return null;
            })
            .filter(Boolean);
        }
        if (typeof c === 'object') {
          // Some MCP servers expose a top-level object that includes a `tools` map.
          if (c.tools && typeof c.tools === 'object') {
            return Object.keys(c.tools);
          }
          return Object.keys(c);
        }
      }

      return null;
    };

    const toolNamesAll = normalizeToolNames(toolsResp);
    const toolCount = toolNamesAll ? toolNamesAll.length : null;
    const toolNames = toolNamesAll ? toolNamesAll.slice(0, 20) : [];

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mcp: {
        baseUrl: config.control4.mcpBaseUrl,
        toolCount,
        sampleTools: toolNames,
      },
    });
  } catch (error) {
    res.status(502).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      mcp: {
        baseUrl: config.control4.mcpBaseUrl,
        error: error && error.message ? error.message : String(error),
      },
    });
  }
});

module.exports = router;
