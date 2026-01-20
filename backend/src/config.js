require('dotenv').config();

module.exports = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Speech-to-Text
  sttProvider: process.env.STT_PROVIDER || 'google',
  googleSTTApiKey: process.env.GOOGLE_STT_API_KEY,
  azureSTTKey: process.env.AZURE_STT_KEY,
  azureSTTRegion: process.env.AZURE_STT_REGION,
  
  // LLM
  llmProvider: process.env.LLM_PROVIDER || 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  
  // Control4 MCP
  mcpHost: process.env.MCP_HOST,
  mcpPort: parseInt(process.env.MCP_PORT, 10) || 9000,
  
  // Rate Limiting
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100, // requests per window
  
  // WebSocket
  wsHeartbeatInterval: 30000, // 30 seconds
  wsMaxConnections: 10,
};
