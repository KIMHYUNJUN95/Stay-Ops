import { describe, expect, it } from "vitest";
import {
  appendChangeGroups,
  collapseCellRuns,
  opsRoomDisplayName,
  buildBlockSendEntry,
  buildJobSendEntry,
  countStalledJobs,
  describeSendFailure,
  isSendStalled,
  resolveSendWait,
  groupChangeRows,
  localizeSendDetail,
  mergeSendEntries,
  type ChangeLogRow,
  type PriceJobLogRow,
} from "@/lib/ops-history";
import { encodePriceJobWait, parsePriceJobWait } from "@/lib/beds24/price-job-wait";

/**
 * 판매 캘린더 「이력」 패널.
 *
 * 계약: `src/lib/ops-history.ts` — 수정 한 번 = 한 줄, 보낸 것이 제대로 들어갔는지.
 */
const log = (over: Partial<ChangeLogRow> = {}): ChangeLogRow => ({
  adjust_mode: "amount",
  changed_by_name: "김현준",
  created_at: "2026-09-29T05:11:18.000Z",
  field: "price1",
  job_id: "job1",
  new_value: 39000,
  old_value: 45000,
  property_name: "아라키초A",
  room_label: "201",
  stay_date: "2026-11-03",
  ...over,
});

describe("groupChangeRows", () => {
  it("같은 작업의 칸들을 한 줄로 — 객실·기간·값 범위를 요약한다", () => {
    const [group] = groupChangeRows([
      log(),
      log({ new_value: 39000, old_value: 47000, stay_date: "2026-11-05" }),
      log({ room_label: "202", stay_date: "2026-11-04" }),
    ]);
    expect(group).toMatchObject({
      cellCount: 3,
      dateFrom: "2026-11-03",
      dateTo: "2026-11-05",
      id: "job1",
      rooms: ["아라키초A 201", "아라키초A 202"],
      source: "app",
    });
    expect(group.fields).toEqual([
      { cells: 3, field: "price", from: { max: 47000, min: 45000 }, to: { max: 39000, min: 39000 } },
    ]);
  });

  it("Beds24 에서 바뀐 것은 동기화 시각으로 묶고 출처를 가른다", () => {
    const groups = groupChangeRows([
      log({ adjust_mode: "beds24", changed_by_name: "Beds24", created_at: "2026-09-29T02:00:04Z", job_id: null }),
      log({ created_at: "2026-09-29T05:00:00Z" }),
    ]);
    expect(groups.map((group) => [group.id, group.source])).toEqual([
      ["job1", "app"],
      ["beds24:2026-09-29T02:00:04Z", "beds24"],
    ]);
  });

  it("가격과 최소숙박을 따로 요약한다", () => {
    const [group] = groupChangeRows([log(), log({ field: "min_stay", new_value: 1, old_value: 2 })]);
    expect(group.fields.map((item) => item.field)).toEqual(["price", "minStay"]);
  });

  it("쪽 경계에 걸쳐 갈라진 수정은 합친다", () => {
    const first = groupChangeRows([log({ stay_date: "2026-11-03" })]);
    const second = groupChangeRows([log({ new_value: 38000, room_label: "202", stay_date: "2026-11-09" })]);
    const [merged] = appendChangeGroups(first, second);
    expect(merged).toMatchObject({ cellCount: 2, dateTo: "2026-11-09", rooms: ["아라키초A 201", "아라키초A 202"] });
    expect(merged.fields[0].to).toEqual({ max: 39000, min: 38000 });
  });
});

const job = (over: Partial<PriceJobLogRow> = {}): PriceJobLogRow => ({
  completed_at: "2026-09-29T05:11:18.424Z",
  created_at: "2026-09-29T05:11:15.759Z",
  error: null,
  id: "j1",
  job_type: "price",
  requested_by_name: "김현준",
  results: [
    { error: null, externalRoomId: "383979", success: true },
    { error: "verify mismatch 2027-02-13", externalRoomId: "383980", success: false },
  ],
  room_updates: [
    { dates: { "2027-02-12": { p1: 41580 }, "2027-02-13": { p1: 41580 } }, externalRoomId: "383979", roomLabel: "202" },
    { dates: { "2027-02-14": { p1: 43000 } }, externalRoomId: "383980", roomLabel: "203" },
  ],
  status: "partial_failed",
  ...over,
});

describe("buildJobSendEntry", () => {
  const names = new Map([["383979", "가부키초 K202"]]);
  const NOW = Date.parse("2026-09-29T06:50:00Z");

  it("객실·칸·기간·값과 객실별 실패를 뽑는다 — 모르는 방은 Beds24 라벨로", () => {
    expect(buildJobSendEntry(job(), names, NOW)).toMatchObject({
      cellCount: 3,
      dateFrom: "2027-02-12",
      dateTo: "2027-02-14",
      failures: [{ error: "verify mismatch 2027-02-13", room: "203" }],
      id: "job:j1",
      kind: "price",
      rooms: ["가부키초 K202", "203"],
      status: "partial",
      values: { max: 43000, min: 41580 },
      waitingMinutes: null,
    });
  });

  it("대기 중이면 몇 분째인지 센다 · 최소숙박은 m 값", () => {
    const entry = buildJobSendEntry(
      job({
        completed_at: null,
        created_at: "2026-09-29T06:28:14Z",
        job_type: "min_stay",
        results: [],
        room_updates: [{ dates: { "2026-11-26": { m: 1 } }, externalRoomId: "585736", roomLabel: "301" }],
        status: "queued",
      }),
      names,
      NOW,
    );
    expect(entry).toMatchObject({ kind: "minStay", status: "queued", values: { max: 1, min: 1 }, waitingMinutes: 21 });
  });
});

describe("Beds24 한도 대기(쿨다운)", () => {
  const NOW = Date.parse("2026-09-29T06:50:00Z");
  const queued = (over: Partial<PriceJobLogRow> = {}) =>
    job({ completed_at: null, created_at: "2026-09-29T06:30:00Z", results: [], status: "queued", ...over });

  it("대기 사유 코드는 왕복한다 · 모르는 코드와 실패 요약은 대기 사유가 아니다", () => {
    expect(parsePriceJobWait(encodePriceJobWait("rate_limit", "2026-09-29T06:52:00.000Z"))).toEqual({
      reason: "rate_limit",
      retryAt: "2026-09-29T06:52:00.000Z",
    });
    expect(parsePriceJobWait(encodePriceJobWait("low_credit", null))).toEqual({ reason: "low_credit", retryAt: null });
    expect(parsePriceJobWait("cooldown_weird@2026-09-29T06:52:00Z")).toBeNull();
    expect(parsePriceJobWait("383980:verify_mismatch")).toBeNull();
    expect(parsePriceJobWait(null)).toBeNull();
  });

  it("워커가 적은 사유 → 한도 대기 + 재전송 시각, 「안 나감」도 빨간 사유 줄도 아니다", () => {
    const entry = buildJobSendEntry(
      queued({ error: encodePriceJobWait("rate_limit", "2026-09-29T06:52:30.000Z") }),
      new Map(),
      NOW,
    );
    expect(entry).toMatchObject({
      error: null,
      retryAt: "2026-09-29T06:52:30.000Z",
      status: "queued",
      waitReason: "rate_limit",
      waitingMinutes: 20,
    });
    expect(isSendStalled(entry)).toBe(false);
  });

  it("재전송 시각이 지났으면 「곧」(retryAt null) — 멈춘 기준을 넘도록 안 나갔으면 다시 「안 나감」", () => {
    const soon = buildJobSendEntry(
      queued({ error: encodePriceJobWait("low_credit", "2026-09-29T06:49:00.000Z") }),
      new Map(),
      NOW,
    );
    expect(soon).toMatchObject({ retryAt: null, waitReason: "low_credit" });
    expect(isSendStalled(soon)).toBe(false);

    const stuck = buildJobSendEntry(
      queued({ error: encodePriceJobWait("rate_limit", "2026-09-29T06:40:00.000Z") }),
      new Map(),
      NOW,
    );
    expect(stuck).toMatchObject({ error: null, retryAt: null, waitReason: null });
    expect(isSendStalled(stuck)).toBe(true);
  });

  it("사유가 안 적힌 대기라도 전역 쿨다운이 켜져 있으면 한도 대기 — 사유 · 시각은 전역 것", () => {
    const cooldown = { active: true, reason: "low_credit", until: "2026-09-29T06:53:00.000Z" };
    const entry = buildJobSendEntry(queued(), new Map(), NOW, cooldown);
    expect(entry).toMatchObject({ retryAt: "2026-09-29T06:53:00.000Z", waitReason: "low_credit" });
    expect(isSendStalled(entry)).toBe(false);
    // 쿨다운이 꺼져 있으면 그냥 오래된 대기 = 안 나감.
    const plain = buildJobSendEntry(queued(), new Map(), NOW, { active: false, reason: null, until: null });
    expect(plain.waitReason).toBeNull();
    expect(isSendStalled(plain)).toBe(true);
  });

  it("대기가 아닌 작업(보내는 중 · 끝남)은 쿨다운이 켜져 있어도 한도 대기가 아니다", () => {
    const cooldown = { active: true, reason: "rate_limit", until: "2026-09-29T06:53:00.000Z" };
    expect(resolveSendWait({ error: null, status: "processing" }, cooldown, NOW)).toBeNull();
    expect(buildJobSendEntry(job(), new Map(), NOW, cooldown).waitReason).toBeNull();
  });

  it("알림 숫자 — 한도 대기는 빼고 멈춘 대기 · 진행만 센다", () => {
    const rows = [
      { error: null, status: "processing" },
      { error: null, status: "queued" },
      { error: encodePriceJobWait("rate_limit", "2026-09-29T06:52:00.000Z"), status: "queued" },
    ];
    expect(countStalledJobs(rows, null, NOW)).toBe(2);
    expect(countStalledJobs(rows, { active: true, reason: "rate_limit", until: "2026-09-29T06:52:00.000Z" }, NOW)).toBe(1);
  });
});

describe("실패 코드 → 문구", () => {
  const labels = {
    http_error: "Beds24 오류 (HTTP {status})",
    room_rejected: "Beds24 가 거부함",
    verify_mismatch: "되읽기 불일치 {n}칸",
    verify_failed: "Beds24 되읽기 실패",
  };
  const sample = "{date}: 보낸 값 {expected}, Beds24 값 {actual}";
  const fmt = (value: number, field: "price" | "minStay") => (field === "minStay" ? `${value}박` : `¥${value}`);

  it("작업 결과의 코드·값을 그대로 넘기고, 작업 전체 오류는 객실별 줄이 있으면 뺀다", () => {
    const entry = buildJobSendEntry(
      job({
        error: "383980:verify_mismatch",
        results: [
          {
            error: "verify_mismatch",
            externalRoomId: "383980",
            params: { actual: 41000, date: "2027-02-14", expected: 43000, field: "price1", n: 2 },
            success: false,
          },
        ],
      }),
      new Map([["383980", "가부키초 203"]]),
      Date.now(),
    );
    expect(entry.error).toBeNull();
    expect(entry.failures).toEqual([
      {
        error: "verify_mismatch",
        params: { actual: 41000, date: "2027-02-14", expected: 43000, field: "price1", n: 2 },
        room: "가부키초 203",
      },
    ]);
    expect(describeSendFailure(entry.failures[0], labels, sample, fmt)).toEqual({
      detail: "02/14: 보낸 값 ¥43000, Beds24 값 ¥41000",
      text: "되읽기 불일치 2칸",
    });
  });

  it("최소숙박 불일치는 박 수로, 없는 값은 —", () => {
    expect(
      describeSendFailure(
        { error: "verify_mismatch", params: { actual: "", date: "2026-11-26", expected: 2, field: "minStay", n: 1 } },
        labels,
        sample,
        fmt,
      ).detail,
    ).toBe("11/26: 보낸 값 2박, Beds24 값 —");
  });

  it("자리표시를 채우고 Beds24 원문은 세부로만", () => {
    expect(describeSendFailure({ error: "http_error", params: { status: 500 } }, labels, sample, fmt)).toEqual({
      detail: null,
      text: "Beds24 오류 (HTTP 500)",
    });
    expect(
      describeSendFailure({ error: "room_rejected", params: { detail: "Invalid roomId" } }, labels, sample, fmt),
    ).toEqual({ detail: "Invalid roomId", text: "Beds24 가 거부함" });
  });

  it("옛 작업의 한국어 문장(모르는 코드)은 그대로", () => {
    const legacy = "Beds24 되읽기 불일치 1건: 2027-02-13 price1: 기대=41580, 실제=45000";
    expect(describeSendFailure({ error: legacy, params: null }, labels, sample, fmt)).toEqual({
      detail: null,
      text: legacy,
    });
  });

  it("차단 세부의 자리표시 없는 코드만 바꾼다", () => {
    expect(localizeSendDetail("383979:room_rejected, 383980:Invalid date", labels)).toBe(
      "383979: Beds24 가 거부함, 383980:Invalid date",
    );
    expect(localizeSendDetail("383979:3, 383980:1", labels)).toBe("383979:3, 383980:1");
    expect(localizeSendDetail("beds24:missing-env", labels)).toBe("beds24:missing-env");
  });
});

describe("buildBlockSendEntry · mergeSendEntries", () => {
  const block = buildBlockSendEntry({
    action: "block",
    created_at: "2026-09-29T06:00:00Z",
    detail: "401",
    end_date: "2026-10-03",
    id: "b1",
    nights: null,
    property_name: "아라키초A",
    reason: "verify_mismatch",
    requested_by_name: "김현준",
    room_label: "401",
    start_date: "2026-10-01",
    status: "failed",
  });

  it("차단 실패는 사유 코드와 세부를 남기고, 밤 수는 양끝 포함으로 센다", () => {
    expect(block).toMatchObject({ cellCount: 3, error: "verify_mismatch", kind: "block", status: "failed" });
  });

  it("시각순으로 합치고 다음 쪽 기준을 준다", () => {
    const jobEntry = buildJobSendEntry(job(), new Map(), Date.now());
    const merged = mergeSendEntries([jobEntry], [block], 1);
    // 차단(06:00)이 작업(05:11)보다 최신이다.
    expect(merged.entries.map((entry) => entry.id)).toEqual(["block:b1"]);
    expect(merged.nextBefore).toBe(block.at);
    expect(mergeSendEntries([jobEntry], [block], 10).nextBefore).toBeNull();
  });
});

describe("collapseCellRuns", () => {
  const cell = (room: string, date: string, from = 46200, to = 41580) => ({
    date,
    field: "price" as const,
    from,
    property: "가부키초",
    room,
    to,
  });

  it("한 방의 이어진 날짜가 같은 값이면 한 줄 — 방은 번호순", () => {
    const runs = collapseCellRuns([
      cell("K403", "2026-02-13"),
      cell("K203", "2026-02-13"),
      cell("K203", "2026-02-12"),
      cell("K203", "2026-02-14"),
      cell("K403", "2026-02-12"),
    ]);
    expect(runs.map((run) => [run.room, run.dateFrom, run.dateTo, run.nights])).toEqual([
      ["K203", "2026-02-12", "2026-02-14", 3],
      ["K403", "2026-02-12", "2026-02-13", 2],
    ]);
  });

  it("값이 다르거나 날짜가 끊기면 가른다", () => {
    const runs = collapseCellRuns([
      cell("K203", "2026-02-12"),
      cell("K203", "2026-02-13", 49500, 44550),
      cell("K203", "2026-02-15"),
    ]);
    expect(runs.map((run) => run.nights)).toEqual([1, 1, 1]);
  });
});

describe("opsRoomDisplayName", () => {
  const labels = { kabukicho: "歌舞伎町", sano: "佐野" };

  it("판매 캘린더 행과 같은 이름 — Beds24 유닛 라벨을 표시 라벨로, 건물은 보는 사람 언어로", () => {
    // 가부키초는 유닛 둘(`203#` · `K203`)이 한 행 「203」이다.
    expect(opsRoomDisplayName("Kabukicho", "203#", labels)).toEqual({ property: "歌舞伎町", room: "203" });
    expect(opsRoomDisplayName("Kabukicho", "K203", labels).room).toBe("203");
    expect(opsRoomDisplayName("STAY ARI Apartment Hotel", "O302", labels).room).toBe("302");
    expect(opsRoomDisplayName("Sano", "別荘", labels).property).toBe("佐野");
  });

  it("건물을 모르면 방 라벨만", () => {
    expect(opsRoomDisplayName(null, "301", labels)).toEqual({ property: null, room: "301" });
  });
});
