// Smoke test: verifies backend MCP client can reach c4-mcp
// Usage: node scripts/mcp-smoke.js

const path = require('path');

(async () => {
  process.chdir(path.join(__dirname, '..'));

  const mcpClient = require('../src/services/mcp-client');

  const correlationId = `smoke-${Date.now()}`;

  const toolsResp = await mcpClient.listTools(correlationId);
  const tools = Array.isArray(toolsResp?.tools)
    ? toolsResp.tools
    : Array.isArray(toolsResp?.result?.tools)
      ? toolsResp.result.tools
      : Array.isArray(toolsResp?.result?.result?.tools)
        ? toolsResp.result.result.tools
        : Array.isArray(toolsResp)
          ? toolsResp
          : null;

  const sampleTools = tools
    ? tools
        .map((t) => (t && typeof t === 'object' ? t.name : null))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const roomsResp = await mcpClient.callTool('c4_list_rooms', {}, correlationId);

  // Print small, actionable output.
  console.log(
    JSON.stringify(
      {
        ok: true,
        sampleTools,
        rooms: roomsResp,
      },
      null,
      2
    )
  );
})().catch((err) => {
  // Keep error output concise.
  console.error('MCP smoke test failed:', err && err.message ? err.message : String(err));
  process.exit(1);
});
