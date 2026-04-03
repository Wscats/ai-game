#!/bin/bash
RESULT_FILE="/Users/reky/Documents/GitHub/ai-game/logs/test-result-summary.log"
echo "Waiting for headless-test to finish..." > "$RESULT_FILE"

while pgrep -f "headless-test" > /dev/null 2>&1; do
  sleep 5
done

echo "=== TEST COMPLETED ===" > "$RESULT_FILE"
echo "Timestamp: $(date)" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "=== LAST 80 LINES OF LOG ===" >> "$RESULT_FILE"
tail -80 /Users/reky/Documents/GitHub/ai-game/logs/test-output.log >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "=== SCREENSHOT COUNT ===" >> "$RESULT_FILE"
ls -1 /Users/reky/Documents/GitHub/ai-game/test/screenshots/*.png 2>/dev/null | wc -l >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "=== SCREENSHOT LIST ===" >> "$RESULT_FILE"
ls -1 /Users/reky/Documents/GitHub/ai-game/test/screenshots/*.png 2>/dev/null | sort >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "DONE" >> "$RESULT_FILE"
