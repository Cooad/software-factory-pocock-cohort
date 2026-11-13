#!/usr/bin/env bash
#
# Triggers every workflow in knock/workflows against a throwaway Knock user,
# reports each HTTP status (2xx = committed and triggerable, 404 = missing or
# uncommitted), then deletes the user. Uses the secret key from .env
# (KNOCK_SECRET_API_KEY, falling back to KNOCK_API_KEY) and never prints it.
set -euo pipefail

cd "$(dirname "$0")/.."
env_value() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d "\"'\r" || true; }
SK="${KNOCK_SECRET_API_KEY:-$(env_value KNOCK_SECRET_API_KEY)}"
[[ -n "$SK" ]] || SK="${KNOCK_API_KEY:-$(env_value KNOCK_API_KEY)}"
[[ -n "$SK" ]] || { echo "No KNOCK_SECRET_API_KEY or KNOCK_API_KEY in the environment or .env" >&2; exit 1; }

API="https://api.knock.app/v1"
USER_ID="workflow-check-$(date +%s)"
failed=0

for dir in knock/workflows/*/; do
  key=$(basename "$dir")
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $SK" -H "Content-Type: application/json" \
    -d "{\"recipients\":[{\"id\":\"$USER_ID\",\"name\":\"Workflow Check\"}],\"data\":{}}" \
    "$API/workflows/$key/trigger")
  if [[ "$status" == 2* ]]; then echo "ok    $status  $key"; else echo "FAIL  $status  $key"; failed=1; fi
done

curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $SK" "$API/users/$USER_ID" || true
exit "$failed"
