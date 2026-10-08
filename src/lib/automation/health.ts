import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 시스템 경보 점검 — **문제일 때만** 실패 알림 채널로 보낸다(2026-10-08 사용자 결정 「문제가 되는 것만」).
 *
 * 도메인 계약: docs/product/36-automation-control.md → 「시스템 경보」
 *
 * 기준은 운영 데이터의 평소 값으로 정했다(2026-10-08 측정) — 평소엔 절대 안 울리고, 울리면 손대야 하는 것만.
 *
 * | 경보 | 평소(측정) | 기준 |
 * | Beds24 웹훅 수신 없음 | 가장 긴 공백 2.0시간(14일) | 4시간 |
 * | 예약 맞추기(6시간 주기) 성공 없음 | 가장 긴 간격 12.1시간(30일, GitHub 지연) | 16시간 |
 * | 예약 맞추기 실패 | 30일 0건 | 실패마다 |
 * | 가격 반영 실패 / 멈춤 | 106건 모두 성공, 최장 60분(재시도 포함) | 실패마다 / 대기 · 처리 중 90분 |
 * | 외부 리뷰 수집 멈춤 | 매일 수집 | 2일(기존 리뷰 점검과 같은 기준) |
 *
 * **같은 문제는 한 번만** — 경보마다 사건 키(`key`)를 만들고, 보내는 쪽이 `automation_runs.dedupe_key` 로 막는다. 계속되는 문제
 * (끊김 · 멈춤)는 키에 12시간 칸을 넣어 12시간마다 한 번 다시 알린다. 「복구됨」은 보내지 않는다.
 *
 * **순수하지 않다**(DB 읽기) — 판단만 하고 보내기는 `runner.ts` 의 `sendSystemAlert` 가 한다.
 */

type Client = SupabaseClient<Database>;

export const HEALTH_WEBHOOK_SILENT_MS = 4 * 60 * 60 * 1000;
export const HEALTH_RECONCILE_STALE_MS = 16 * 60 * 60 * 1000;
export const HEALTH_PRICE_STUCK_MS = 90 * 60 * 1000;
export const HEALTH_REVIEWS_STALE_MS = 2 * 24 * 60 * 60 * 1000;
const REMIND_EVERY_MS = 12 * 60 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type HealthAlert =
  | { kind: "webhook_silent"; key: string; lastAt: string; hours: number }
  | { kind: "reconcile_stale"; key: string; lastAt: string | null; hours: number | null }
  | { kind: "reconcile_failed"; key: string; at: string; error: string }
  | { kind: "price_failed"; key: string; at: string; requestedBy: string; failedRooms: number; error: string }
  | { kind: "price_stuck"; key: string; at: string; minutes: number; status: string }
  | { kind: "reviews_stale"; key: string; lastAt: string; days: number };

function reminderSlot(ageMs: number): number {
  return Math.floor(ageMs / REMIND_EVERY_MS);
}

/** 순수 — 마지막 시각 · 지금으로 「계속되는 문제」 경보를 만든다(테스트 대상). */
export function silenceAlert(
  kind: "webhook_silent",
  lastAt: string | null,
  now: Date,
  limitMs: number,
): Extract<HealthAlert, { kind: "webhook_silent" }> | null {
  if (!lastAt) return null;
  const age = now.getTime() - Date.parse(lastAt);
  if (!Number.isFinite(age) || age < limitMs) return null;
  return { hours: Math.floor(age / 3_600_000), key: `health:${kind}:${lastAt}:${reminderSlot(age)}`, kind, lastAt };
}

export async function collectHealthAlerts(supabase: Client, organizationId: string, now: Date): Promise<HealthAlert[]> {
  const alerts: HealthAlert[] = [];
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();

  const [webhook, reconcileOk, reconcileFailed, priceFailed, priceOpen, review] = await Promise.all([
    supabase
      .from("beds24_webhook_events")
      .select("received_at")
      // Beds24 수신 기록은 조직 없이 쌓인다(계정 하나 — organization_id 가 비어 있다, 2026-10-08 확인). 조직으로 거르지 않는다.
      .eq("trigger_source", "webhook")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("beds24_webhook_events")
      .select("received_at")
      .eq("trigger_source", "reconciliation")
      .lt("http_status", 400)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("beds24_webhook_events")
      .select("id, received_at, error_message")
      .eq("trigger_source", "reconciliation")
      .gte("http_status", 400)
      .gte("received_at", since)
      .order("received_at", { ascending: true })
      .limit(10),
    supabase
      .from("beds24_price_jobs")
      .select("id, updated_at, requested_by_name, failed_room_ids, error")
      .eq("organization_id", organizationId)
      .in("status", ["failed", "partial_failed"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(10),
    supabase
      .from("beds24_price_jobs")
      .select("id, created_at, status")
      .eq("organization_id", organizationId)
      .in("status", ["queued", "processing"])
      .lt("created_at", new Date(now.getTime() - HEALTH_PRICE_STUCK_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("external_reviews")
      .select("updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const webhookAlert = silenceAlert("webhook_silent", webhook.data?.received_at ?? null, now, HEALTH_WEBHOOK_SILENT_MS);
  if (webhookAlert) alerts.push(webhookAlert);

  // 예약 맞추기 — 성공 기록이 아예 없으면(도입 직후) 판단하지 않는다.
  const lastReconcile = reconcileOk.data?.received_at ?? null;
  if (lastReconcile) {
    const age = now.getTime() - Date.parse(lastReconcile);
    if (age >= HEALTH_RECONCILE_STALE_MS) {
      alerts.push({
        hours: Math.floor(age / 3_600_000),
        key: `health:reconcile_stale:${lastReconcile}:${reminderSlot(age)}`,
        kind: "reconcile_stale",
        lastAt: lastReconcile,
      });
    }
  }

  for (const row of reconcileFailed.data ?? []) {
    alerts.push({ at: row.received_at, error: (row.error_message ?? "").slice(0, 160), key: `health:reconcile_failed:${row.id}`, kind: "reconcile_failed" });
  }
  for (const row of priceFailed.data ?? []) {
    alerts.push({
      at: row.updated_at,
      error: (row.error ?? "").slice(0, 160),
      failedRooms: row.failed_room_ids?.length ?? 0,
      key: `health:price_failed:${row.id}`,
      kind: "price_failed",
      requestedBy: row.requested_by_name ?? "-",
    });
  }
  for (const row of priceOpen.data ?? []) {
    alerts.push({
      at: row.created_at,
      key: `health:price_stuck:${row.id}`,
      kind: "price_stuck",
      minutes: Math.floor((now.getTime() - Date.parse(row.created_at)) / 60_000),
      status: row.status,
    });
  }

  const lastReview = review.data?.updated_at ?? null;
  if (lastReview) {
    const age = now.getTime() - Date.parse(lastReview);
    if (age >= HEALTH_REVIEWS_STALE_MS) {
      alerts.push({
        days: Math.floor(age / 86_400_000),
        key: `health:reviews_stale:${lastReview}:${Math.floor(age / (2 * REMIND_EVERY_MS))}`,
        kind: "reviews_stale",
        lastAt: lastReview,
      });
    }
  }
  return alerts;
}
