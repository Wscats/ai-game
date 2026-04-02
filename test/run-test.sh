#!/bin/bash
cd "$(dirname "$0")/.."
nohup node test/headless-test.js "$@" > test/test-output.log 2>&1 &
PID=$!
echo "Test started with PID=$PID"
echo "$PID" > test/test.pid
echo "Log: test/test-output.log"
echo "Screenshots: test/screenshots/"
