#!/usr/bin/env bash
# macOS 双击即跑：构建（若还没构建过）并启动离线演示站。
# 不依赖后端，也不需要先启动别的服务；只需要 Node.js 18+ 和 python3。
set -euo pipefail

cd "$(dirname "$0")"

SERVER_PID=""
cleanup() {
  local code=$?
  kill $SERVER_PID 2>/dev/null || true
  if [ "$code" -ne 0 ]; then
    echo
    echo "启动失败（退出码 $code）。请检查上方日志。"
    read -r -p "按回车关闭窗口…" _ || true
  fi
  exit "$code"
}
trap cleanup EXIT

PORT=${DEMO_PORT:-5176}

if [ ! -d "dist" ]; then
  echo "dist 不存在，正在构建离线演示包…"
  if ! command -v npm >/dev/null 2>&1; then
    echo "没找到 npm：请先安装 Node.js 18+（https://nodejs.org/）后重试。"
    exit 1
  fi
  [ -d node_modules ] || npm install
  npm run build
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "没找到 python3：请先安装 Python 3.9+（https://www.python.org/downloads/）。"
  exit 1
fi

echo "BCE 1.1 · 离线演示站"
echo "端口：http://127.0.0.1:$PORT"
echo "数据：内嵌快照（不连后端、不调模型）"
echo

cd dist
python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!

echo -n "等待服务器就绪"
for _ in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    echo " ✓"
    echo "正在打开浏览器…"
    open "http://127.0.0.1:$PORT" 2>/dev/null || true
    break
  fi
  echo -n "."
  sleep 0.5
done

echo
echo "已启动。按 Ctrl+C 停止。"
wait
