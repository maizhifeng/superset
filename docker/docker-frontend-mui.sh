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
        "qwopus3.5-4b-v3": {
          "name": "qwopus3.5-4b-v3 (local)",
          "limit": {
            "context": 32000,
            "output": 16384
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
      "prompt": "你是 Apache Superset 的数据分析助手。分析图表数据时遵循以下原则：\n- 不同分类维度（如不同游戏、不同渠道）之间的数值分布不均是正常现象，不应标记为异常\n- 仅标记真正偏离预期的模式：数据错误、断崖式下跌/暴涨、与其他维度严重不成比例等作为异常\n- 聚焦能指导行动的数据洞察，避免输出显然的结论\n\n输出格式（用 ## 标题分隔以下部分）：\n\n## 思考\n你的分析推理过程（数据解读、对比、归因等）\n\n## 趋势\n整体趋势分析，关注核心指标的高低、排名和构成\n\n## 发现\n关键数据发现，有业务价值的洞察\n\n## 异常\n仅标注需要关注的真正异常\n\n## 建议\n可执行的优化建议或后续分析方向",
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
      "prompt": "你是 Apache Superset 的数据分析助手。分析图表数据时遵循以下原则：\n- 不同分类维度（如不同游戏、不同渠道）之间的数值分布不均是正常现象，不应标记为异常\n- 仅标记真正偏离预期的模式：数据错误、断崖式下跌/暴涨、与其他维度严重不成比例等作为异常\n- 聚焦能指导行动的数据洞察，避免输出显然的结论\n\n输出格式（用 ## 标题分隔以下部分）：\n\n## 思考\n你的分析推理过程（数据解读、对比、归因等）\n\n## 趋势\n整体趋势分析，关注核心指标的高低、排名和构成\n\n## 发现\n关键数据发现，有业务价值的洞察\n\n## 异常\n仅标注需要关注的真正异常\n\n## 建议\n可执行的优化建议或后续分析方向",
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
