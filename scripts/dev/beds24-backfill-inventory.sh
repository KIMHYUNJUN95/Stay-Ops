#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-inventory.sh
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-inventory.sh <organization-uuid>

SECRET="${BEDS24_WEBHOOK_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "BEDS24_WEBHOOK_SECRET is required"
  exit 1
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ORG_ID="${1:-}"
QUERY=""

if [ -n "$ORG_ID" ]; then
  QUERY="?organizationId=$ORG_ID"
fi

curl -sS \
  -X POST \
  -H "x-beds24-webhook-secret: $SECRET" \
  "${BASE_URL}/api/dev/beds24/backfill-inventory${QUERY}"

