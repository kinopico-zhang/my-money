#!/bin/sh
# 重启 My Money 独立服务 (走仓库根的 run.sh: 自动带 .env 与 HTTPS 证书;
# 后台运行、日志 /tmp/mymoney.log)。手动重启用。
cd "$(dirname "$0")/.." || exit 1
# 没有 pkill 的环境 (QNAP) 用 ps+kill 找 pid
PIDS=$(ps | grep 'uvicorn app.main:app' | grep -v grep | awk '{print $1}')
[ -n "$PIDS" ] && kill $PIDS 2>/dev/null
sleep 2
REPO=$(pwd)
/bin/setsid sh -c "exec $REPO/run.sh >> /tmp/mymoney.log 2>&1 < /dev/null" &
