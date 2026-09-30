/**
 * 판매 캘린더 「이력」 패널 — 변경 이력 · Beds24 전송 로그. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「이력 · 전송 로그」
 *
 * 두 탭은 묻는 것이 다르다.
 * - **변경 이력** — 「무엇이 언제 얼마에서 얼마로 바뀌었나」. 원본은 칸 단위 `price_change_logs`
 *   (우리 앱 + Beds24 에서 바뀐 것). 한 번의 수정이 칸 수백 개라 **수정 한 번 = 한 줄**로 묶는다.
 * - **Beds24 전송** — 「우리가 보낸 것이 제대로 들어갔나」. 원본은 가격·최소숙박 작업
 *   (`beds24_price_jobs`)과 차단 로그(`beds24_block_logs`). 대기·진행·성공·일부 실패·실패와
 *   객실별 실패 사유를 보여준다.
 */

import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  localizePropertyName,
} from "@/lib/room-label-normalization";

// ───────────────────────────── 방 이름 ─────────────────────────────

/**
 * Beds24 유닛 → 화면에 쓰는 방 이름. **판매 캘린더 행과 같은 규칙**이다(`ops-calendar.ts` 의
 * `roomKeyByUuid`): 건물은 정규 이름(`Kabukicho` → `가부키초`), 방은 정규 라벨 → 표시 라벨
 * (가부키초 `203#`·`K203` → `203`, 아라키초 `201_2` → `201`, STAY ARI `O302` → `302`). 그래야 이력의 「가부키초 203」이
 * 격자의 행과 같은 방으로 읽힌다 — Beds24 유닛 라벨(`203#`)을 그대로 쓰면 다른 방처럼 보인다.
 *
 * 건물은 **보는 사람 언어로** 바꾼다(`dictionary.cleaning.buildingLabels`). 방 번호는 그대로다.
 */
export function opsRoomDisplayName(
  rawPropertyName: string | null | undefined,
  rawRoomLabel: string,
  buildingLabels: Record<string, string>,
): { property: string | null; room: string } {
  const canonicalProperty = rawPropertyName?.trim() ? getCanonicalPropertyName(rawPropertyName.trim()) : null;
  if (!canonicalProperty) return { property: null, room: rawRoomLabel.trim() };
  const canonicalRoom = getCanonicalRoomLabel(canonicalProperty, rawRoomLabel) || rawRoomLabel.trim();
  return {
    property: localizePropertyName(canonicalProperty, buildingLabels),
    room: getDisplayRoomLabel(canonicalProperty, canonicalRoom) || canonicalRoom,
  };
}

// ───────────────────────────── 변경 이력 ─────────────────────────────

export type ChangeLogRow = {
  job_id: string | null;
  created_at: string;
  adjust_mode: string | null;
  changed_by_name: string | null;
  field: string;
  old_value: number | null;
  new_value: number | null;
  stay_date: string;
  /** 우리 방 표시 이름(없으면 Beds24 라벨). */
  room_label: string | null;
  property_name: string | null;
};

/** `block` 은 값이 1 = 차단 · 0 = 열림(`price_change_logs.field = 'blackout'`). */
export type ChangeField = "price" | "minStay" | "block";

/** 값의 범위 — 전부 같으면 `min === max`. 모르는 값만 있었으면 `null`. */
export type ValueRange = { min: number; max: number } | null;

export type ChangeFieldSummary = {
  field: ChangeField;
  cells: number;
  from: ValueRange;
  to: ValueRange;
};

export type ChangeGroup = {
  /**
   * `job_id`, 없으면 `<adjust_mode>:<시각>` — Beds24 동기화가 잡은 변경(`beds24:`)은 한 번의 동기화, 우리 앱
   * 차단(`block:`)은 한 번 누른 것이 한 줄이다(차단은 큐 작업이 아니라 `job_id` 가 없다).
   */
  id: string;
  /** 그 수정의 가장 이른 칸 시각. */
  at: string;
  by: string | null;
  source: "app" | "beds24";
  cellCount: number;
  fields: ChangeFieldSummary[];
  /** `건물 객실` — 등장 순. */
  rooms: string[];
  dateFrom: string;
  dateTo: string;
  /** 펼쳐 볼 칸들(최대 `CHANGE_GROUP_CELL_LIMIT`). 합계는 `cellCount`. 화면은 `collapseCellRuns` 로 접는다. */
  cells: ChangeCell[];
};

export type ChangeCell = {
  property: string | null;
  room: string;
  date: string;
  field: ChangeField;
  from: number | null;
  to: number | null;
};

export const CHANGE_GROUP_CELL_LIMIT = 400;

const fieldOf = (field: string): ChangeField =>
  field === "min_stay" ? "minStay" : field === "blackout" ? "block" : "price";

function widen(range: ValueRange, value: number | null): ValueRange {
  if (value === null) return range;
  if (!range) return { max: value, min: value };
  return { max: Math.max(range.max, value), min: Math.min(range.min, value) };
}

function mergeRange(a: ValueRange, b: ValueRange): ValueRange {
  if (!a) return b;
  if (!b) return a;
  return { max: Math.max(a.max, b.max), min: Math.min(a.min, b.min) };
}

const roomName = (row: Pick<ChangeLogRow, "property_name" | "room_label">) =>
  [row.property_name, row.room_label].filter(Boolean).join(" ") || "—";

/** 칸 이력 → 수정 단위. 최신 수정이 먼저. 입력 순서에 기대지 않는다. */
export function groupChangeRows(rows: readonly ChangeLogRow[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  // 같은 방의 유닛 둘(가부키초 `203#`·`K203`)이 같이 바뀌면 두 줄로 온다 — 이름을 맞춘 뒤엔 한 칸이다.
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const row of sorted) {
    const id = row.job_id ?? `${row.adjust_mode ?? "beds24"}:${row.created_at}`;
    const cellKey = [id, row.property_name, row.room_label, row.stay_date, row.field, row.old_value, row.new_value].join("|");
    if (seen.has(cellKey)) continue;
    seen.add(cellKey);
    let group = groups.get(id);
    if (!group) {
      group = {
        at: row.created_at,
        by: row.changed_by_name,
        cellCount: 0,
        cells: [],
        dateFrom: row.stay_date,
        dateTo: row.stay_date,
        fields: [],
        id,
        rooms: [],
        source: row.adjust_mode === "beds24" ? "beds24" : "app",
      };
      groups.set(id, group);
    }
    const field = fieldOf(row.field);
    const room = roomName(row);
    group.cellCount += 1;
    if (!group.rooms.includes(room)) group.rooms.push(room);
    if (row.stay_date < group.dateFrom) group.dateFrom = row.stay_date;
    if (row.stay_date > group.dateTo) group.dateTo = row.stay_date;
    let summary = group.fields.find((item) => item.field === field);
    if (!summary) {
      summary = { cells: 0, field, from: null, to: null };
      group.fields.push(summary);
    }
    summary.cells += 1;
    summary.from = widen(summary.from, row.old_value);
    summary.to = widen(summary.to, row.new_value);
    if (group.cells.length < CHANGE_GROUP_CELL_LIMIT) {
      group.cells.push({
        date: row.stay_date,
        field,
        from: row.old_value,
        property: row.property_name,
        room: row.room_label ?? "—",
        to: row.new_value,
      });
    }
  }
  for (const group of groups.values()) group.rooms.sort(naturalCompare);
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** 「가부키초 203」 < 「가부키초 302」 < 「가부키초 1002」 — 방 번호를 숫자로 비교한다. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true });
}

/** 펼친 표의 한 줄 — 한 방에서 **이어진 날짜**가 같은 값으로 바뀌었으면 한 줄로 접는다. */
export type CellRun = {
  property: string | null;
  room: string;
  field: ChangeField;
  dateFrom: string;
  dateTo: string;
  nights: number;
  from: number | null;
  to: number | null;
};

function nextDay(date: string): string {
  const next = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * 칸 → 줄. 방(번호순) → 종류 → 날짜순으로 늘어놓고, 바로 다음 날이면서 이전·이후 값이 같으면
 * 이어 붙인다. 27칸(9방 × 3일, 같은 값)이 9줄이 된다 — 칸마다 한 줄이면 같은 건물명이 27번 반복된다.
 */
export function collapseCellRuns(cells: readonly ChangeCell[]): CellRun[] {
  const sorted = [...cells].sort(
    (a, b) =>
      naturalCompare(`${a.property ?? ""} ${a.room}`, `${b.property ?? ""} ${b.room}`) ||
      a.field.localeCompare(b.field) ||
      a.date.localeCompare(b.date),
  );
  const runs: CellRun[] = [];
  for (const cell of sorted) {
    const last = runs.at(-1);
    const sameRun =
      last &&
      last.property === cell.property &&
      last.room === cell.room &&
      last.field === cell.field &&
      last.from === cell.from &&
      last.to === cell.to;
    // 같은 방의 유닛 둘(가부키초 `203#`·`K203`)이 같은 날 같은 값으로 남았으면 한 칸이다.
    if (sameRun && last.dateTo === cell.date) continue;
    if (
      last &&
      last.property === cell.property &&
      last.room === cell.room &&
      last.field === cell.field &&
      last.from === cell.from &&
      last.to === cell.to &&
      nextDay(last.dateTo) === cell.date
    ) {
      last.dateTo = cell.date;
      last.nights += 1;
      continue;
    }
    runs.push({
      dateFrom: cell.date,
      dateTo: cell.date,
      field: cell.field,
      from: cell.from,
      nights: 1,
      property: cell.property,
      room: cell.room,
      to: cell.to,
    });
  }
  return runs;
}

/**
 * 「더 보기」로 받은 다음 쪽을 붙인다. 한 수정이 쪽 경계에 걸쳐 둘로 갈라져 왔으면 **합친다**
 * (범위는 합칠 수 있는 요약이라 다시 계산할 필요가 없다).
 */
export function appendChangeGroups(current: readonly ChangeGroup[], next: readonly ChangeGroup[]): ChangeGroup[] {
  const byId = new Map(current.map((group) => [group.id, group]));
  const out = [...current];
  for (const group of next) {
    const existing = byId.get(group.id);
    if (!existing) {
      out.push(group);
      byId.set(group.id, group);
      continue;
    }
    const merged: ChangeGroup = {
      ...existing,
      at: group.at < existing.at ? group.at : existing.at,
      cellCount: existing.cellCount + group.cellCount,
      cells: [...existing.cells, ...group.cells].slice(0, CHANGE_GROUP_CELL_LIMIT),
      dateFrom: group.dateFrom < existing.dateFrom ? group.dateFrom : existing.dateFrom,
      dateTo: group.dateTo > existing.dateTo ? group.dateTo : existing.dateTo,
      fields: [...existing.fields],
      rooms: [...existing.rooms, ...group.rooms.filter((room) => !existing.rooms.includes(room))].sort(
        naturalCompare,
      ),
    };
    for (const summary of group.fields) {
      const index = merged.fields.findIndex((item) => item.field === summary.field);
      if (index < 0) merged.fields.push(summary);
      else {
        const before = merged.fields[index];
        merged.fields[index] = {
          cells: before.cells + summary.cells,
          field: summary.field,
          from: mergeRange(before.from, summary.from),
          to: mergeRange(before.to, summary.to),
        };
      }
    }
    out[out.indexOf(existing)] = merged;
    byId.set(group.id, merged);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// ───────────────────────────── Beds24 전송 ─────────────────────────────

export type SendKind = "price" | "minStay" | "block" | "unblock";
export type SendStatus = "queued" | "processing" | "succeeded" | "partial" | "failed";

export type SendEntry = {
  id: string;
  /** `job:<id>` 는 「지금 보내기」 대상이 될 수 있다. */
  source: "job" | "block";
  kind: SendKind;
  status: SendStatus;
  at: string;
  finishedAt: string | null;
  by: string | null;
  rooms: string[];
  cellCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  /** 보낸 값의 범위 — 가격(엔) 또는 최소숙박(박). 차단은 `null`. */
  values: ValueRange;
  /**
   * 객실별 실패. `error` 는 실패 코드(`PriceJobFailureCode`)이고 `params` 가 그 값들이다 —
   * 화면이 `describeSendFailure` 로 번역한다. 2026-09-30 전 작업은 한국어 문장이 그대로 온다(`params: null`).
   */
  failures: Array<{ room: string; error: string; params: Record<string, string | number> | null }>;
  /** 차단 실패 사유 코드. 가격·최소숙박 작업은 객실별 실패가 있으면 `null`(같은 내용을 두 번 보이지 않게). */
  error: string | null;
  /** 차단 실패의 세부. */
  detail: string | null;
  /** 대기 · 진행 중이 이만큼 오래됐으면 「멈춘 것 같다」로 보여준다(분). */
  waitingMinutes: number | null;
};

/** 이보다 오래 대기 · 진행 중이면 멈춘 것으로 본다 — 접수 직후 깨우기는 몇 초 안에 끝난다. */
export const SEND_STALL_MINUTES = 3;

export type PriceJobLogRow = {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  requested_by_name: string | null;
  error: string | null;
  results: unknown;
  room_updates: unknown;
};

export type BlockLogRow = {
  id: string;
  action: string;
  status: string;
  created_at: string;
  requested_by_name: string | null;
  property_name: string | null;
  room_label: string | null;
  start_date: string;
  end_date: string;
  nights: number | null;
  reason: string | null;
  detail: string | null;
};

const JOB_STATUS: Record<string, SendStatus> = {
  completed: "succeeded",
  failed: "failed",
  partial_failed: "partial",
  processing: "processing",
  queued: "queued",
};

type RoomUpdateLike = { externalRoomId?: unknown; roomLabel?: unknown; dates?: unknown };
type ResultLike = { externalRoomId?: unknown; success?: unknown; error?: unknown; params?: unknown };

function asParams(value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number") out[key] = raw;
  }
  return out;
}

/**
 * 가격·최소숙박 작업 한 건 → 한 줄.
 *
 * `roomNameByExternalId` 는 Beds24 roomId → `건물 객실`. 모르면 작업에 적힌 Beds24 라벨로 적는다.
 */
export function buildJobSendEntry(
  job: PriceJobLogRow,
  roomNameByExternalId: ReadonlyMap<string, string>,
  now: number,
): SendEntry {
  const kind: SendKind = job.job_type === "min_stay" ? "minStay" : "price";
  const updates = (Array.isArray(job.room_updates) ? job.room_updates : []) as RoomUpdateLike[];
  const nameOf = (externalRoomId: string, fallback?: unknown) =>
    roomNameByExternalId.get(externalRoomId) ??
    (typeof fallback === "string" && fallback ? fallback : externalRoomId);

  const rooms: string[] = [];
  let cellCount = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let values: ValueRange = null;
  const labelByExternal = new Map<string, unknown>();
  for (const update of updates) {
    const externalRoomId = String(update.externalRoomId ?? "");
    labelByExternal.set(externalRoomId, update.roomLabel);
    const name = nameOf(externalRoomId, update.roomLabel);
    if (!rooms.includes(name)) rooms.push(name);
    const dates = (update.dates && typeof update.dates === "object" ? update.dates : {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [date, slot] of Object.entries(dates)) {
      cellCount += 1;
      if (!dateFrom || date < dateFrom) dateFrom = date;
      if (!dateTo || date > dateTo) dateTo = date;
      const raw = kind === "minStay" ? slot?.m : slot?.p1;
      values = widen(values, typeof raw === "number" ? raw : null);
    }
  }

  const results = (Array.isArray(job.results) ? job.results : []) as ResultLike[];
  const failures = results
    .filter((result) => result.success === false)
    .map((result) => {
      const externalRoomId = String(result.externalRoomId ?? "");
      return {
        error: typeof result.error === "string" && result.error ? result.error : "—",
        params: asParams(result.params),
        room: nameOf(externalRoomId, labelByExternal.get(externalRoomId)),
      };
    });

  const status = JOB_STATUS[job.status] ?? "failed";
  const waiting = status === "queued" || status === "processing";
  return {
    at: job.created_at,
    by: job.requested_by_name,
    cellCount,
    dateFrom,
    dateTo,
    detail: null,
    // `job.error` 는 객실별 실패를 이어 붙인 진단 문자열이다(Beds24 객실 번호 그대로) — 객실별 줄이 있으면 뺀다.
    error: failures.length > 0 ? null : job.error,
    failures,
    finishedAt: job.completed_at,
    id: `job:${job.id}`,
    kind,
    rooms,
    source: "job",
    status,
    values,
    waitingMinutes: waiting ? Math.max(0, Math.floor((now - new Date(job.created_at).getTime()) / 60_000)) : null,
  };
}

/** `{n}` 같은 자리표시를 값으로. 없는 값의 자리는 그대로 둔다. */
function fillTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    params[key] === undefined ? whole : String(params[key]),
  );
}

/**
 * 객실별 실패 한 줄 → 보는 사람 언어. **순수하다.**
 *
 * `labels` 는 코드 → 문구(`hsFailures`), `sampleTemplate` 은 되읽기 불일치 첫 건 문구(`hsFailSample`,
 * `{date}` · `{expected}` · `{actual}`). 모르는 코드(옛 작업의 한국어 문장)는 그대로 보여준다.
 * Beds24 가 준 원문은 `detail` 로만 — 번역하지 않는다.
 */
export function describeSendFailure(
  failure: { error: string; params: Record<string, string | number> | null },
  labels: Readonly<Record<string, string>>,
  sampleTemplate: string,
  formatValue: (value: number, field: "price" | "minStay") => string,
): { text: string; detail: string | null } {
  const label = labels[failure.error];
  if (!label) return { detail: null, text: failure.error };
  const params = failure.params ?? {};
  const text = fillTemplate(label, params);
  if (failure.error === "verify_mismatch" && typeof params.date === "string" && params.date) {
    const field = params.field === "minStay" ? "minStay" : "price";
    const show = (value: string | number | undefined) =>
      typeof value === "number" ? formatValue(value, field) : "—";
    const date = `${params.date.slice(5, 7)}/${params.date.slice(8, 10)}`;
    return {
      detail: fillTemplate(sampleTemplate, { actual: show(params.actual), date, expected: show(params.expected) }),
      text,
    };
  }
  const detail = params.detail;
  return { detail: detail === undefined || detail === "" ? null : String(detail), text };
}

/**
 * 차단 실패 세부(`beds24_block_logs.detail`) — `객실번호:코드, …` 에서 **자리표시 없는 코드**만
 * 문구로 바꾼다(`room_rejected` · `bad_response`). 나머지(숫자 · Beds24 원문)는 그대로다.
 */
export function localizeSendDetail(detail: string, labels: Readonly<Record<string, string>>): string {
  const plain = (code: string) => {
    const label = labels[code];
    return label && !label.includes("{") ? label : null;
  };
  return detail
    .split(", ")
    .map((part) => {
      const whole = plain(part);
      if (whole) return whole;
      const cut = part.indexOf(":");
      const label = cut > 0 ? plain(part.slice(cut + 1)) : null;
      return label ? `${part.slice(0, cut)}: ${label}` : part;
    })
    .join(", ");
}

function nightsBetween(startDate: string, endDate: string): number {
  const start = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  const end = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10));
  return Math.round((end - start) / 86_400_000) + 1;
}

/** 차단 로그 한 줄 → 한 줄. `end_date` 는 막은 **마지막 밤**이다(양끝 포함). */
export function buildBlockSendEntry(row: BlockLogRow): SendEntry {
  const succeeded = row.status === "succeeded";
  return {
    at: row.created_at,
    by: row.requested_by_name,
    cellCount: row.nights ?? nightsBetween(row.start_date, row.end_date),
    dateFrom: row.start_date,
    dateTo: row.end_date,
    detail: succeeded ? null : row.detail,
    error: succeeded ? null : row.reason,
    failures: [],
    finishedAt: row.created_at,
    id: `block:${row.id}`,
    kind: row.action === "unblock" ? "unblock" : "block",
    rooms: [[row.property_name, row.room_label].filter(Boolean).join(" ") || "—"],
    source: "block",
    status: succeeded ? "succeeded" : "failed",
    values: null,
    waitingMinutes: null,
  };
}

/** 두 원본을 시각순(최신 먼저)으로 합쳐 `limit` 개. 다음 쪽 기준은 마지막 줄의 시각이다. */
export function mergeSendEntries(
  jobs: readonly SendEntry[],
  blocks: readonly SendEntry[],
  limit: number,
): { entries: SendEntry[]; nextBefore: string | null } {
  const all = [...jobs, ...blocks].sort((a, b) => b.at.localeCompare(a.at));
  const entries = all.slice(0, limit);
  const more = all.length > limit || jobs.length >= limit || blocks.length >= limit;
  return { entries, nextBefore: more && entries.length > 0 ? entries[entries.length - 1].at : null };
}
