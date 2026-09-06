#!/usr/bin/env bash
# cleverblog site watchdog — mikr.us emil359 (1 GB RAM, NO swap by platform design)
#
# Consensus design: chatgpt-mcp thread 6a9cb35c, 2026-09-06.
# Principle: the external probe detects the SYMPTOM; the LOCAL state decides
# the recovery. Never restart a running ingress because of a CDN-only failure.
# Traccar is observed/escalated only — never auto-restarted (owner-critical).
# No `compose --force-recreate` — ladder is start -> restart -> escalate.
#
# Runs from user crontab every 5 minutes. Logs transitions only (+1 heartbeat/day).

set -u -o pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

STATE_DIR="$HOME/.local/state/cleverblog-watchdog"
LOG_DIR="$HOME/watchdog"
LOG_FILE="$LOG_DIR/watchdog.log"
PAUSE_FILE="$STATE_DIR/PAUSE"
LOCK_FILE="$STATE_DIR/watchdog.lock"
LAST_SITE_FILE="$STATE_DIR/last_site_status"
LAST_TRACCAR_FILE="$STATE_DIR/last_traccar_status"
HEARTBEAT_FILE="$STATE_DIR/last_heartbeat"
ACTIONS_LOG="$STATE_DIR/actions.log"          # lines: epoch container
ALERT_CMD="$STATE_DIR/alert_cmd"              # optional, executable; secret lives ONLY on VPS

SITE_URL="https://cleverblog.pl/api/access"
APP="cleverblog"
INGRESS="cleverblog-ingress"
TRACCAR="traccar"

RESTART_BUDGET=3          # recovery actions per hour, whole stack
COOLDOWN_S=600            # per container, between restarts
GRACE_S=90                # startup grace before acting
VERIFY_WAIT_S=90          # post-restart verification window
LOG_MAX_BYTES=5242880     # 5 MiB, then keep last 200 lines
DRY_RUN="${DRY_RUN:-0}"

umask 077
mkdir -p "$STATE_DIR" "$LOG_DIR"

log() { rotate_log; printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG_FILE"; }

rotate_log() {
  local size
  size=$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
    local tmp; tmp="$LOG_FILE.tmp.$$"
    tail -n 200 "$LOG_FILE" > "$tmp" && mv "$tmp" "$LOG_FILE"
  fi
}

alert() { # alert "message" — optional external hook, never blocks
  [ -x "$ALERT_CMD" ] && "$ALERT_CMD" "$*" >/dev/null 2>&1 || true
}

escalate() { log "ESCALATE: $*"; alert "cleverblog watchdog: $*"; }

now() { date +%s; }

probe_external() { # 0 = site OK via CDN chain
  local nonce; nonce=$(date +%s)
  curl -fsS -o /dev/null --max-time 10 "$SITE_URL?watchdog=$nonce" 2>/dev/null
}

probe_local_app() { # 0 = app answers on its container IP (host -> docker bridge)
  local ip rc
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$APP" 2>/dev/null) || return 2
  [ -n "$ip" ] || return 2
  curl -fsS -o /dev/null --max-time 5 "http://$ip:3000/api/access" 2>/dev/null && return 0
  # fallback: inside the container (node is guaranteed; healthcheck uses it)
  docker exec "$APP" node -e "fetch('http://127.0.0.1:3000/api/access').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
}

f_field() { docker inspect -f "$2" "$1" 2>/dev/null || echo ""; }

# ---- single instance -------------------------------------------------------
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

# ---- maintenance pause -----------------------------------------------------
[ -f "$PAUSE_FILE" ] && exit 0

# ---- docker availability ---------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  escalate "docker daemon unavailable"
  exit 1
fi

# ---- traccar: observe + escalate only, NEVER restart (every run) -----------
tr_status=$(f_field "$TRACCAR" '{{.State.Status}}')
if [ "$tr_status" != "running" ] && [ "$(cat "$LAST_TRACCAR_FILE" 2>/dev/null || echo running)" = "running" ]; then
  escalate "traccar is not running (status=${tr_status:-missing}) — NOT auto-restarting (owner-critical, observe only)"
fi
echo "${tr_status:-unknown}" > "$LAST_TRACCAR_FILE"

# ---- 1. external probe (two attempts) --------------------------------------
if probe_external; then
  if [ "$(cat "$LAST_SITE_FILE" 2>/dev/null || echo ok)" != "ok" ]; then
    log "SITE_RECOVERED: external path healthy again"
  fi
  echo ok > "$LAST_SITE_FILE"
  # daily heartbeat
  today=$(date '+%Y-%m-%d')
  [ "$(cat "$HEARTBEAT_FILE" 2>/dev/null)" = "$today" ] || { log "HEARTBEAT ok"; echo "$today" > "$HEARTBEAT_FILE"; }
  exit 0
fi
sleep 5
if probe_external; then
  echo ok > "$LAST_SITE_FILE"
  exit 0
fi
echo fail > "$LAST_SITE_FILE"

# ---- 2. diagnostics (safe fields only — never full inspect, env has secrets)
app_status=$(f_field "$APP" '{{.State.Status}}')
app_health=$(f_field "$APP" '{{.State.Health.Status}}')
app_oom=$(f_field "$APP" '{{.State.OOMKilled}}')
app_started=$(f_field "$APP" '{{.State.StartedAt}}')
app_restarts=$(f_field "$APP" '{{.RestartCount}}')
ing_status=$(f_field "$INGRESS" '{{.State.Status}}')
mem_avail=$(awk '/MemAvailable/{print $2}' /proc/meminfo 2>/dev/null)
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' 2>/dev/null | grep -E '^(cleverblog|cleverblog-ingress|traccar)' > "$STATE_DIR/last_stats.txt" || true

log "SITE_FAIL status=app:$app_status health:$app_health oom:$app_oom restarts:$app_restarts ingress:$ing_status memAvailKB:${mem_avail:-?}"

# ---- 3. traccar: observe + escalate only, NEVER restart ---------------------
tr_status=$(f_field "$TRACCAR" '{{.State.Status}}')
if [ "$tr_status" != "running" ] && [ "$(cat "$LAST_TRACCAR_FILE" 2>/dev/null || echo running)" = "running" ]; then
  escalate "traccar is not running (status=$tr_status) — NOT auto-restarting (owner-critical, observe only)"
fi
echo "${tr_status:-unknown}" > "$LAST_TRACCAR_FILE"

# ---- 4. recovery ladder ------------------------------------------------------
epoch=$(now)
started_epoch=0
[ -n "$app_started" ] && started_epoch=$(date -d "$app_started" +%s 2>/dev/null || echo 0)

budget_used=$(awk -v cutoff=$((epoch - 3600)) '$1 > cutoff' "$ACTIONS_LOG" 2>/dev/null | wc -l)
last_app_action=$(awk -v c="$APP" '$2 == c {print $1}' "$ACTIONS_LOG" 2>/dev/null | tail -1)
last_ing_action=$(awk -v c="$INGRESS" '$2 == c {print $1}' "$ACTIONS_LOG" 2>/dev/null | tail -1)

act() { # act container reason — records budget, executes, verifies
  local container="$1" reason="$2" age
  if [ "$budget_used" -ge "$RESTART_BUDGET" ]; then
    escalate "recovery budget exhausted ($RESTART_BUDGET/h) — $container needs manual attention ($reason)"
    return 1
  fi
  if [ "$container" = "$APP" ] && [ -n "$last_app_action" ]; then
    age=$((epoch - last_app_action)); [ "$age" -lt "$COOLDOWN_S" ] && { log "COOLDOWN: $container restarted ${age}s ago, skipping ($reason)"; return 1; }
  fi
  if [ "$container" = "$INGRESS" ] && [ -n "$last_ing_action" ]; then
    age=$((epoch - last_ing_action)); [ "$age" -lt "$COOLDOWN_S" ] && { log "COOLDOWN: $container restarted ${age}s ago, skipping ($reason)"; return 1; }
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN would $reason -> docker ${3:-restart} $container"
    return 0
  fi
  log "RECOVERY: $3 $container ($reason)"
  if [ "${3:-restart}" = "start" ]; then docker start "$container" >/dev/null 2>&1 || { escalate "docker start $container failed"; return 1; }
  else docker restart "$container" >/dev/null 2>&1 || { escalate "docker restart $container failed"; return 1; }; fi
  echo "$epoch $container" >> "$ACTIONS_LOG"
  alert "cleverblog watchdog: $3 $container ($reason)"
  # post-restart verification
  local waited=0 ok=0
  while [ "$waited" -lt "$VERIFY_WAIT_S" ]; do
    sleep 10; waited=$((waited + 10))
    if [ "$container" = "$APP" ] && probe_local_app; then ok=1; break; fi
    if [ "$container" = "$INGRESS" ] && [ "$(f_field "$container" '{{.State.Status}}')" = "running" ]; then ok=1; break; fi
  done
  if [ "$ok" = "1" ]; then log "RECOVERED: $container (verified after ${waited}s)"
  else log "RECOVERY_FAILED: $container still not verified after ${waited}s"; fi
  return 0
}

if [ "$app_status" = "running" ] && probe_local_app; then
  # app fine locally -> external path incident; restart ingress ONLY if it is not running
  if [ "$ing_status" != "running" ] && [ -n "$ing_status" ]; then
    act "$INGRESS" "ingress $ing_status while app local-OK" start
  else
    log "EXTERNAL_PATH_ONLY: app local-OK, ingress $ing_status — no restart (CDN/DNS/Cytrus path); escalating"
    alert "cleverblog: site unreachable externally, app+ingress healthy locally"
  fi
  exit 0
fi

if [ -z "$app_status" ]; then
  escalate "$APP container missing — manual recreate required (never auto-recreate)"
  exit 1
fi

case "$app_status" in
  restarting)
    log "APP_RESTARTING: docker is already handling it, waiting"; exit 0 ;;
esac

# startup grace
if [ "$app_status" = "running" ] && [ "$started_epoch" -gt 0 ]; then
  if [ $((epoch - started_epoch)) -lt "$GRACE_S" ]; then
    log "APP_GRACE: started $((epoch - started_epoch))s ago, giving it $GRACE_S grace"; exit 0
  fi
fi

if [ "$app_status" != "running" ]; then
  act "$APP" "app $app_status" start
  exit 0
fi

# running but local probe failed (unhealthy/wedged) and past grace
act "$APP" "app running but local probe failed (health=$app_health oom=$app_oom)" restart
exit 0
