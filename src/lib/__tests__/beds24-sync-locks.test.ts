import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acquireBeds24Lock, releaseBeds24Lock } from "@/lib/beds24/sync-locks";
import type { Database } from "@/types/database";

/**
 * 락 판정은 **DB 한 문장**(`beds24_try_lock`)이 한다 (2026-09-30).
 *
 * 예전의 「읽고 → upsert」 는 같은 순간의 두 인스턴스가 둘 다 잡았다고 믿었다. 여기서는 RPC 결과를
 * 잡음 · 점유 · 확인 실패로 올바르게 옮기는지만 본다(원자성 자체는 SQL 이 보장한다).
 */
function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("acquireBeds24Lock", () => {
  it("RPC 가 true 면 잡았다", async () => {
    const { client, rpc } = clientReturning({ data: true, error: null });
    const lock = await acquireBeds24Lock(client, "rates_sync", "test", 60_000);
    expect(lock.acquired).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "beds24_try_lock",
      expect.objectContaining({ p_locked_by: "test", p_name: "rates_sync", p_ttl_ms: 60_000 }),
    );
  });

  it("RPC 가 false 면 남이 들고 있다", async () => {
    const { client } = clientReturning({ data: false, error: null });
    expect(await acquireBeds24Lock(client, "rates_sync", "test", 60_000)).toEqual({
      acquired: false,
      lockId: null,
      reason: "busy",
    });
  });

  it("RPC 가 실패하면 점유가 아니라 확인 실패다", async () => {
    const { client } = clientReturning({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await acquireBeds24Lock(client, "rates_sync", "test", 60_000)).toEqual({
      acquired: false,
      lockId: null,
      reason: "error",
    });
    spy.mockRestore();
  });
});

describe("releaseBeds24Lock", () => {
  it("내 lockId 로만 놓는다", async () => {
    const { client, rpc } = clientReturning({ data: true, error: null });
    await releaseBeds24Lock(client, "rates_sync", "my-id");
    expect(rpc).toHaveBeenCalledWith("beds24_release_lock", { p_lock_id: "my-id", p_name: "rates_sync" });
  });

  it("lockId 가 없으면 부르지도 않는다", async () => {
    const { client, rpc } = clientReturning({ data: true, error: null });
    await releaseBeds24Lock(client, "rates_sync", null);
    expect(rpc).not.toHaveBeenCalled();
  });
});
