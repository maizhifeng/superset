#!/usr/bin/env bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
set -e

echo "Starting Superset MUI frontend (Vite dev server)"

cd /app/superset-frontend-new

echo "Running npm install"
npm install

# Start Pi agent WebSocket service in background (with auto-restart)
echo "Starting Pi agent service"
cd /app/superset-frontend-new/agents/pi-agent-server
npm install
(
  while true; do
    npx tsx src/index.ts 2>&1
    echo "Pi agent exited, restarting in 2s..."
    sleep 2
  done
) &
PI_AGENT_PID=$!
echo "Pi agent started (PID: $PI_AGENT_PID)"

cd /app/superset-frontend-new
echo "Start Vite dev server"
npm run dev-server
