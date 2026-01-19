#!/bin/bash
# Health check script for monitoring backend service

API_URL="http://localhost:3000/api/v1/health"
MAX_RETRIES=3
RETRY_DELAY=2

check_health() {
  response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL")
  
  if [ "$response" -eq 200 ]; then
    echo "✓ Backend service is healthy"
    return 0
  else
    echo "✗ Backend service returned status code: $response"
    return 1
  fi
}

# Retry logic
for i in $(seq 1 $MAX_RETRIES); do
  echo "Health check attempt $i of $MAX_RETRIES..."
  
  if check_health; then
    exit 0
  fi
  
  if [ $i -lt $MAX_RETRIES ]; then
    echo "Retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi
done

echo "✗ Backend service health check failed after $MAX_RETRIES attempts"
exit 1
