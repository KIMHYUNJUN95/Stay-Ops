import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BEDS24_LIVE_CHANNEL_OPTIONS, beds24LiveTopic } from "@/lib/beds24-live";

const policySql = readFileSync(
  join(process.cwd(), "supabase/migrations/202609300006_beds24_live_private_channel.sql"),
  "utf8",
);

describe("beds24 live channel", () => {
  it("private 채널이다 — 조직 멤버만 RLS 로 구독한다", () => {
    expect(BEDS24_LIVE_CHANNEL_OPTIONS.config.private).toBe(true);
  });

  it("토픽이 RLS 정책이 비교하는 형식과 같다", () => {
    const organizationId = "11111111-2222-3333-4444-555555555555";
    expect(beds24LiveTopic(organizationId)).toBe(`beds24-live:${organizationId}`);
    expect(policySql).toContain("'beds24-live:' || m.organization_id::text = (select realtime.topic())");
    expect(policySql).toContain("like 'beds24-live:%'");
  });

  it("브라우저에 보내기 권한을 주지 않는다", () => {
    expect(policySql).toMatch(/for select\s+to authenticated/);
    expect(policySql).not.toMatch(/for (insert|all)/i);
  });
});
