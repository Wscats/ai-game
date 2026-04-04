#!/bin/bash
# Kill old processes
pkill -9 -f "headless-test" 2>/dev/null
pkill -9 -f "codebuddy" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2

cd /Users/reky/Documents/GitHub/ai-game

# Start server in background with proper stdin redirect
node server/index.js < /dev/null > logs/server.log 2>&1 &
SERVER_PID=$!
echo "Server started (PID: $SERVER_PID)"

# Wait for server to be ready
for i in $(seq 1 10); do
  HEALTH=$(curl -s --max-time 3 http://localhost:3000/api/health 2>/dev/null)
  if echo "$HEALTH" | grep -q "ok"; then
    echo "Server ready!"
    break
  fi
  echo "Waiting for server... ($i)"
  sleep 2
done

# Clean old screenshots
rm -f test/screenshots/*.png
echo "Screenshots cleaned"

# Run test
echo "Starting 120-round test..."
node test/headless-test.js --rounds=120 2>&1 | tee logs/test-120.log

echo "Test complete!"
echo "Screenshots:"
ls -la test/screenshots/ | wc -l
