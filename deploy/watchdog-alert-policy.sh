#!/usr/bin/env bash

watchdog_incident_begin() {
  local start_file="$1" timestamp="$2"
  if [ ! -s "$start_file" ]; then
    printf '%s\n' "$timestamp" > "$start_file"
  fi
}

watchdog_incident_clear() {
  local start_file="$1" last_alert_file="$2"
  rm -f "$start_file" "$last_alert_file"
}

watchdog_should_alert() {
  local now_value="$1" minimum_outage_s="$2" cooldown_s="$3"
  local start_file="$4" last_alert_file="$5" started_at last_alert_at

  started_at=$(cat "$start_file" 2>/dev/null || true)
  [[ "$started_at" =~ ^[0-9]+$ ]] || return 1
  [ "$((now_value - started_at))" -ge "$minimum_outage_s" ] || return 1

  last_alert_at=$(cat "$last_alert_file" 2>/dev/null || true)
  if [[ "$last_alert_at" =~ ^[0-9]+$ ]]; then
    [ "$((now_value - last_alert_at))" -ge "$cooldown_s" ] || return 1
  fi

  return 0
}
