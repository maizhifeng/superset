#!/usr/bin/env bash
#
# preflight 运行时探测：在真实浏览器里打开交付物预览，取三类运行时信号
# （未捕获 JS 异常 / console error / 资源加载失败），输出一行结论 + 最小证据。
#
# 契约（SKILL.md 与 test/service/sub-agent/creative-design/preflight-probe.test.ts 依赖，改动需同步）：
#   1. 无参数。每次调用都先 close 再 open —— errors / console / network 三个 buffer 都跨
#      reload、跨换 URL 累积，`errors --clear` 也清不掉，只有重启浏览器能归零。修完原样
#      再跑一次即可，调用方不需要知道"复检要重启不能 reload"。
#   2. 恒定 exit 0，结论只看首行。非零退出会让 bash 工具报成命令失败，模型收到失败倾向于
#      改命令重试，而本脚本存在的意义就是让它不必碰命令；跑不起来走 UNAVAILABLE 结论。
#   3. 首行形态：PREFLIGHT: PASS | FAIL <counts> | UNAVAILABLE reason=<...>
set -uo pipefail

# 只在浏览器 daemon 被拉起那一刻生效，而拉起它的是哪条命令并不确定；同一 session 里出现
# 另一个值（少一个参数 / 换个顺序）会让 daemon 静默重启，此后所有读命令落在 about:blank。
# 故与仓库其余 agent-browser 调用点逐字节保持一致。
export AGENT_BROWSER_ARGS='--disable-dev-shm-usage --allow-file-access-from-files'

MAX_SAMPLES=5
MAX_TEXT=300
# dev 构建噪音：vite/HMR 重连、source map 提示、DevTools 广告。指向真实断裂的 console error
# 不会长这样，放过它们免得把噪音报成缺陷。
BENIGN='\[vite\]|\[hmr\]|hot update|source ?map|DevTools'

unavailable() {
  echo "PREFLIGHT: UNAVAILABLE reason=$1"
  exit 0
}

command -v agent-browser >/dev/null 2>&1 || unavailable 'agent-browser not on PATH'
command -v jq >/dev/null 2>&1 || unavailable 'jq not on PATH'

# 预览端口固定 8080（走 nginx 而非直连 vite）；BP 段从沙箱环境变量取，缺尾斜杠首次访问会 Page not found。
BP="${FORCE_CLIENT_BASE_PATH:-${CLIENT_BASE_PATH:-}}"
URL="http://localhost:8080${BP:+${BP%/}/}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

agent-browser close >/dev/null 2>&1 || true
if ! agent-browser open "$URL" >"$TMP/open.log" 2>&1; then
  unavailable "open $URL failed: $(tr -d '\n' <"$TMP/open.log" | cut -c1-200)"
fi
# networkidle 兜不住带长连接的页面，超时不算失败；再补一小段固定缓冲等渲染落定。
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 500 >/dev/null 2>&1 || true

read_signal() { # $1=输出文件 $2..=agent-browser 命令
  local out="$1"
  shift
  "$@" --json >"$out" 2>/dev/null || return 1
  jq -e . "$out" >/dev/null 2>&1 || return 1
}

read_signal "$TMP/errors.json" agent-browser errors || unavailable 'errors read failed'
read_signal "$TMP/console.json" agent-browser console || unavailable 'console read failed'
read_signal "$TMP/network.json" agent-browser network requests || unavailable 'network read failed'

JS_ERRORS=$(jq -c --argjson t "$MAX_TEXT" '[.data.errors[]? | (.text // "" | .[:$t])]' "$TMP/errors.json")
CONSOLE_ERRORS=$(jq -c --arg benign "$BENIGN" --argjson t "$MAX_TEXT" '
  [.data.messages[]? | select(.type == "error") | (.text // "") | select(test($benign; "i") | not) | .[:$t]]
' "$TMP/console.json")
# 同源失败（交付物自己的 JS/CSS/字体/图挂了）是硬失败；外部域失败多为 CDN / 网络环境问题，
# 单独作为 note 报出，不计入结论 —— 免得环境抖动把模型拖进修不动的死循环。
REQ_FAILURES=$(jq -c '
  [ .data.requests[]?
    | select((.status // 599) >= 400)
    | select(.url | test("favicon\\.ico$") | not)
    | select((.resourceType == "Image" and .status == null) | not)
    | { url, status: (.status // "no-response"), type: (.resourceType // "Other"),
        sameOrigin: (.url | startswith("http://localhost:8080")) } ]
' "$TMP/network.json")

count() { jq -r 'length' <<<"$1"; }
JS_N=$(count "$JS_ERRORS")
CONSOLE_N=$(count "$CONSOLE_ERRORS")
SAME_ORIGIN_N=$(jq -r '[.[] | select(.sameOrigin)] | length' <<<"$REQ_FAILURES")
EXTERNAL_N=$(jq -r '[.[] | select(.sameOrigin | not)] | length' <<<"$REQ_FAILURES")

emit_texts() { # $1=json 字符串数组 $2=标签
  # 变量名避开 jq 保留字（label / as / def / try / reduce …）：jq 1.7 之前用保留字当变量名会
  # 被词法解析成 `$` + 关键字而报 syntax error，1.7 起才放开。沙箱 jq 版本不受控。
  jq -r --arg tag "$2" --argjson n "$MAX_SAMPLES" '.[:$n][] | "[\($tag)] \(.)"' <<<"$1"
}

if [ "$JS_N" -eq 0 ] && [ "$CONSOLE_N" -eq 0 ] && [ "$SAME_ORIGIN_N" -eq 0 ]; then
  echo "PREFLIGHT: PASS"
else
  echo "PREFLIGHT: FAIL jsErrors=$JS_N consoleErrors=$CONSOLE_N sameOriginRequestFailures=$SAME_ORIGIN_N"
  # 只给够定位根因的少量样本，不给全量清单：几十条通常是少数根因级联
  # （一个 script 没加载 → 一堆 X is not defined），全量 dump 只会撑爆上下文。
  emit_texts "$JS_ERRORS" jsError
  emit_texts "$CONSOLE_ERRORS" consoleError
  jq -r --argjson n "$MAX_SAMPLES" '
    [.[] | select(.sameOrigin)] | .[:$n][] | "[requestFailed] \(.status) \(.type) \(.url)"
  ' <<<"$REQ_FAILURES"
  if [ "$JS_N" -gt "$MAX_SAMPLES" ] || [ "$CONSOLE_N" -gt "$MAX_SAMPLES" ] || [ "$SAME_ORIGIN_N" -gt "$MAX_SAMPLES" ]; then
    echo "note: 每类最多列 $MAX_SAMPLES 条，其余同类问题多为同一根因级联"
  fi
fi

if [ "$EXTERNAL_N" -gt 0 ]; then
  echo "note: $EXTERNAL_N 个外部域资源加载失败（不计入结论，通常是网络 / CDN 环境问题）"
  jq -r --argjson n "$MAX_SAMPLES" '
    [.[] | select(.sameOrigin | not)] | .[:$n][] | "  external \(.status) \(.url)"
  ' <<<"$REQ_FAILURES"
fi
