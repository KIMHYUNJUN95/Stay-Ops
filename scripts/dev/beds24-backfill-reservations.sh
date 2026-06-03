#!/usr/bin/env bash
set -euo pipefail

# Trigger Beds24 reservations backfill for current month + next month window.
# Usage:
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-reservations.sh
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-reservations.sh <organization-uuid>

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${BEDS24_WEBHOOK_SECRET:-${1:-}}"
ORG_ID="${2:-${1:-}}"

if [[ -z "$SECRET" ]]; then
  echo "[error] Missing secret. Set BEDS24_WEBHOOK_SECRET or pass as first arg." >&2
  exit 1
fi

QUERY=""
if [[ -n "$ORG_ID" && "$ORG_ID" != "$SECRET" ]]; then
  QUERY="?organizationId=${ORG_ID}"
fi

curl -sS \
  -X POST \
  -H "x-beds24-webhook-secret: $SECRET" \
  "${BASE_URL}/api/dev/beds24/backfill-reservations${QUERY}"

echo
