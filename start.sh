#!/usr/bin/env bash
# fusion-drama lifecycle manager (start|stop|restart|status|log) — issue #14
# Hono backend (:5679, /api/v1/health) + built Nuxt frontend (.output/public).
# Data: data/fusion.sqlite3 + data/static/. Callers: fusion-supervisor
# (bash <repo>/start.sh default start path), manual ops.
# PID file .fusion-drama.pid; logs to logs/stdout.log + logs/stderr.log.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="${SCRIPT_DIR}/.fusion-drama.pid"
LOG_DIR="${SCRIPT_DIR}/logs"
STDOUT_LOG="${LOG_DIR}/stdout.log"
STDERR_LOG="${LOG_DIR}/stderr.log"
PORT="${PORT:-5679}"
HOST="${FUSION_BIND_HOST:-127.0.0.1}"
FRONTEND_DIST="${FRONTEND_DIST:-${SCRIPT_DIR}/frontend/.output/public}"

mkdir -p "$LOG_DIR"

log_info() { printf "\033[0;32m[INFO]\033[0m  %s\n" "$*"; }
log_err()  { printf "\033[1;31m[ERR]\033[0m   %s\n" "$*"; }

is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

build_frontend() {
    if [ -f "$FRONTEND_DIST/index.html" ]; then
        log_info "frontend build exists: $FRONTEND_DIST"
        return 0
    fi
    log_info "frontend dist missing, running npm run generate (this takes a while)..."
    (cd "$SCRIPT_DIR/frontend" && npm run generate)
}

start() {
    if is_running; then
        log_info "already running (pid $(cat "$PID_FILE"))"
        return 0
    fi
    rm -f "$PID_FILE"
    build_frontend
    log_info "starting fusion-drama backend on ${HOST}:${PORT} ..."
    # Issue #18: exec directly so the pidfile pid IS the listener —
    # `npm run start` records the npm pid while the :5679 listener is a
    # tsx/node descendant; stop() then kills npm and leaves an orphan.
    # cd + exec makes bash replace itself with node (same pid as $! below).
    PORT="$PORT" FUSION_BIND_HOST="$HOST" FRONTEND_DIST="$FRONTEND_DIST" \
        nohup bash -c "cd '$SCRIPT_DIR/backend' && exec node --import tsx src/index.ts" \
        >>"$STDOUT_LOG" 2>>"$STDERR_LOG" &
    echo $! > "$PID_FILE"
    # wait for /api/v1/health (up to 30s; tsx cold start + sqlite init)
    for _ in $(seq 1 30); do
        if curl -sf -m 2 "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null 2>&1; then
            log_info "ready (pid $(cat "$PID_FILE"), http://127.0.0.1:${PORT})"
            return 0
        fi
        sleep 1
    done
    log_err "health check timed out after 30s — check $STDERR_LOG"
    return 1
}

stop() {
    if ! is_running; then
        log_info "not running"
        rm -f "$PID_FILE"
        return 0
    fi
    local pid
    pid="$(cat "$PID_FILE")"
    log_info "stopping pid $pid ..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        log_info "force kill pid $pid"
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    log_info "stopped"
}

status() {
    if is_running; then
        log_info "running (pid $(cat "$PID_FILE"), port $PORT)"
        return 0
    fi
    log_info "stopped"
    return 1
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    log)     tail -n "${2:-50}" -f "$STDOUT_LOG" ;;
    *)       echo "usage: $0 {start|stop|restart|status|log [n]}"; exit 2 ;;
esac
