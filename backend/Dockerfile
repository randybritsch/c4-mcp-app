# c4-mcp-app backend (Node/Express) container
# Build context: c4-mcp-app/backend

FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
COPY . .

# Ensure log directory exists for the default winston file transport.
RUN mkdir -p /app/logs

# Lock down the Gemini prompt file inside the image (read-only).
# Note: root can still modify it, but this prevents accidental overwrites.
RUN chmod 444 /app/prompts/gemini_system_prompt_LOCKED.md

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
