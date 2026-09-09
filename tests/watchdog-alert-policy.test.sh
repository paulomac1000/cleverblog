#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/deploy/watchdog-alert-policy.sh"

state_dir=$(mktemp -d)
trap 'rm -rf "$state_dir"' EXIT
start_file="$state_dir/incident_started"
last_alert_file="$state_dir/last_alert"

watchdog_incident_begin "$start_file" 1000

if watchdog_should_alert 1899 900 3600 "$start_file" "$last_alert_file"; then
  printf 'FAIL: alert fired before minimum outage threshold\n' >&2
  exit 1
fi

watchdog_should_alert 1900 900 3600 "$start_file" "$last_alert_file"
printf '1900\n' > "$last_alert_file"

if watchdog_should_alert 5499 900 3600 "$start_file" "$last_alert_file"; then
  printf 'FAIL: alert ignored hourly cooldown\n' >&2
  exit 1
fi

watchdog_should_alert 5500 900 3600 "$start_file" "$last_alert_file"
watchdog_incident_clear "$start_file" "$last_alert_file"

if watchdog_should_alert 5501 900 3600 "$start_file" "$last_alert_file"; then
  printf 'FAIL: cleared incident remained alertable\n' >&2
  exit 1
fi

printf 'watchdog alert policy: PASS\n'
