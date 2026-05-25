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

echo "Running \"npm install\" (includes opencode-ai)"
npm install

echo "Starting opencode AI agent server..."
OPENCODE_PORT=${OPENCODE_PORT:-5099}

# LLM Provider config
CUSTOM_LLM_BASE_URL=${CUSTOM_LLM_BASE_URL:-""}
CUSTOM_LLM_MODEL=${CUSTOM_LLM_MODEL:-""}

# Priority: CUSTOM_LLM_* > OPENAI_BASE_URL > opencode free tier
if [ -n "$CUSTOM_LLM_BASE_URL" ]; then
  LLM_BASE_URL="$CUSTOM_LLM_BASE_URL"
  LLM_MODEL="$CUSTOM_LLM_MODEL"
elif [ -n "$OPENAI_BASE_URL" ]; then
  LLM_BASE_URL="$OPENAI_BASE_URL"
  LLM_MODEL="${OPENCODE_MODEL:-gpt-4o-mini}"
else
  LLM_BASE_URL=""
fi

mkdir -p /tmp/opencode-config/opencode

if [ -n "$LLM_BASE_URL" ]; then
  # Custom provider using openai-compatible SDK (Chat Completions API)
  echo "Using custom LLM: ${LLM_BASE_URL} / ${LLM_MODEL}"
  cat > /tmp/opencode-config/opencode/opencode.json <<CONFEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "lmstudio/${LLM_MODEL}",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LLM (local)",
      "options": {
        "baseURL": "${LLM_BASE_URL}"
      },
      "models": {
        "${LLM_MODEL}": {
          "name": "${LLM_MODEL} (local)",
          "limit": {
            "context": 64000,
            "output": 32768
          }
        },
        "qwopus3.5-9b-v3": {
          "name": "QwOPus 3.5 9B v3 (local)",
          "limit": {
            "context": 64000,
            "output": 32768
          }
        }
      }
    }
  },
  "agent": {
    "insight-analyst": {
      "description": "图表数据洞察分析",
      "mode": "subagent",
      "model": "lmstudio/${LLM_MODEL}",
      "temperature": 0.1,
      "permission": {
        "read": "deny",
        "edit": "deny",
        "bash": "deny",
        "glob": "deny",
        "grep": "deny",
        "webfetch": "deny",
        "question": "deny"
      }
    }
  }
}
CONFEOF
else
  # Fallback to opencode free tier
  echo "Using opencode free tier: ${OPENCODE_MODEL:-deepseek-v4-flash-free}"
  cat > /tmp/opencode-config/opencode/opencode.json <<CONFEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "opencode/${OPENCODE_MODEL:-deepseek-v4-flash-free}",
  "agent": {
    "insight-analyst": {
      "description": "图表数据洞察分析",
      "mode": "subagent",
      "model": "opencode/${OPENCODE_MODEL:-deepseek-v4-flash-free}",
      "temperature": 0.1,
      "permission": {
        "read": "deny",
        "edit": "deny",
        "bash": "deny",
        "glob": "deny",
        "grep": "deny",
        "webfetch": "deny",
        "question": "deny"
      }
    }
  }
}
CONFEOF
fi

HOME=/tmp/opencode-config XDG_CONFIG_HOME=/tmp/opencode-config \
  nohup ./node_modules/.bin/opencode serve --port "${OPENCODE_PORT}" --hostname "0.0.0.0" --print-logs > /tmp/opencode-server.log 2>&1 &
OPENCODE_PID=$!
echo "Opencode server PID: ${OPENCODE_PID}, port: ${OPENCODE_PORT}"

sleep 3

if [ -z "$LLM_BASE_URL" ] && [ -n "$OPENCODE_API_KEY" ]; then
  HOME=/tmp/opencode-config XDG_CONFIG_HOME=/tmp/opencode-config \
    ./node_modules/.bin/opencode auth set opencode --key "${OPENCODE_API_KEY}" 2>&1 || true
fi

echo "Model: lmstudio/${LLM_MODEL:-free}"
echo "Start Vite dev server"
npm run dev-server
