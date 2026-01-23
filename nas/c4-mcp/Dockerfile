FROM python:3.12-slim

WORKDIR /app

# Keep image small but functional
RUN python -m pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
      "https://github.com/randybritsch/c4-mcp/archive/refs/heads/main.zip"

ENV C4_BIND_HOST=0.0.0.0
ENV C4_PORT=3333
ENV C4_CONFIG_PATH=/config/config.json

EXPOSE 3333

CMD ["c4-mcp-http"]
