#!/usr/bin/env bash
set -euo pipefail

# 객실 × 날짜별 요금·재고 백필 (로컬 개발 전용).
#
# Usage:
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-rates.sh
#   BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-rates.sh 2026-09-01 2026-12-31
#
# 기간을 안 주면 어제 ~ +12개월. 판매 캘린더가 12개월 이상을 본다.

SECRET="${BEDS24_WEBHOOK_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "BEDS24_WEBHOOK_SECRET is required"
  exit 1
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
FROM="${1:-}"
TO="${2:-}"
QUERY=""
if [ -n "$FROM" ] && [ -n "$TO" ]; then
  QUERY="?from=$FROM&to=$TO"
fi

curl -sS -X POST \
  -H "x-beds24-webhook-secret: $SECRET" \
  "${BASE_URL}/api/dev/beds24/backfill-rates${QUERY}"
