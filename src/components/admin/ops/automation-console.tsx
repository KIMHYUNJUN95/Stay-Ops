"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import {
  addCleaningExtraRoom,
  loadAssigneeBoard,
  loadAutomationRunMessage,
  previewAutomationMessage,
  removeCleaningExtraRoom,
  saveAutomationJob,
  saveCleaningAssignee,
  sendAutomationNow,
  setAutomationEnabled,
  type AssigneeRoomView,
  type CleaningRoomOptionGroup,
} from "@/app/admin/ops/automation/actions";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";
import { AdminTimePicker } from "@/components/admin/shared/admin-time-picker";
import type { AutomationJobView, AutomationPageData } from "@/lib/automation/console-data";
import {
  AUTOMATION_LOCALES,
  DAILY_REPORT_CHANNELS,
  type AutomationDestination,
  type AutomationJobKey,
  type AutomationLocale,
  type AutomationSettings,
} from "@/lib/automation/jobs";
import { isScheduledSendDue } from "@/lib/automation/schedule";
import type { Dictionary } from "@/lib/i18n";
import "./automation.css";

/**
 * 자동화 관제실 — 왼쪽 자동화 목록 + 오른쪽 상세 탭(미리보기 · 담당자 · 실행 기록 · 설정) (2026-10-06, 시안 1a).
 *
 * 도메인 계약: docs/product/36-automation-control.md
 *
 * 화면의 잠금(보기 전용)은 편의다 — 저장 · 발송은 서버 액션이 `automation.manage` 를 다시 본다.
 */

type Copy = Dictionary["automation"];
type SharedCopy = Dictionary["admin"]["shared"];
type Tab = "preview" | "assign" | "history" | "settings";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), template);

const LANG_LABEL: Record<AutomationLocale, string> = { en: "English", ja: "日本語", ko: "한국어" };

function segments(line: string) {
  return line.split("*").map((text, index) => ({ bold: index % 2 === 1, text }));
}

function formatTime(iso: string, localeTag: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(localeTag, {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

type Draft = {
  sendTime: string;
  retryUntil: string;
  weekdays: number[];
  settings: AutomationSettings;
  destinations: AutomationDestination[];
};

function draftOf(job: AutomationJobView): Draft {
  return {
    destinations: job.destinations.map((item) => ({ ...item, locales: [...item.locales] })),
    retryUntil: job.retryUntil,
    sendTime: job.sendTime,
    settings: JSON.parse(JSON.stringify(job.settings)) as AutomationSettings,
    weekdays: [...job.weekdays],
  };
}

export function AutomationConsole({
  data,
  copy,
  shared,
  locale,
  localeTag,
}: {
  data: AutomationPageData;
  copy: Copy;
  shared: SharedCopy;
  locale: AutomationLocale;
  localeTag: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AutomationJobKey>("daily_report");
  const [tab, setTab] = useState<Tab>("preview");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);
  const [pending, startTransition] = useTransition();
  const job = data.jobs.find((item) => item.jobKey === selected) ?? data.jobs[0];
  const view = !data.canManage;

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2200);
  }, []);

  const errorText = useCallback((code: string) => (copy.errors as Record<string, string>)[code] ?? copy.errors.save_failed, [copy.errors]);

  const jobCopy = (key: AutomationJobKey) => copy.jobs[key];
  const tabs: Tab[] = selected === "cleaning_list" ? ["preview", "assign", "history", "settings"] : ["preview", "history", "settings"];
  const activeTab: Tab = tabs.includes(tab) ? tab : "preview";
  const messageCount = job.destinations.reduce((sum, item) => sum + item.locales.length, 0);

  const toggle = () => {
    if (view) return;
    if (!job.enabled) {
      setConfirmOn(true);
      return;
    }
    startTransition(async () => {
      const result = await setAutomationEnabled(job.jobKey, false);
      if (!result.ok) return flash(errorText(result.error));
      flash(copy.toggleOffDone);
      router.refresh();
    });
  };
  const confirmEnable = () => {
    startTransition(async () => {
      const result = await setAutomationEnabled(job.jobKey, true);
      setConfirmOn(false);
      if (!result.ok) return flash(errorText(result.error));
      flash(copy.toggleOnDone);
      router.refresh();
    });
  };

  const lastRun = job.runs[0] ?? null;
  const gateText = data.gate.ok
    ? fill(copy.health.dataAgo, { n: data.gate.ageMinutes ?? 0 })
    : data.gate.ageMinutes === null
      ? copy.health.dataUnknown
      : fill(copy.health.dataStale, { h: Math.round((data.gate.ageMinutes ?? 0) / 60) });
  const validChannels = data.channels.filter((channel) => channel.valid).length;

  return (
    <div className="atm">
      <div className="atm__top">
        <div className="atm__title">{copy.title}</div>
        <span className={`atm__hp ${data.gate.ok ? "" : "is-bad"}`}>
          <i />
          {copy.health.data} <b>{gateText}</b>
        </span>
        <span className={`atm__hp ${validChannels > 0 ? "" : "is-warn"}`}>
          <i />
          {copy.health.channels} <b>{validChannels > 0 ? fill(copy.health.channelsCount, { n: validChannels }) : copy.health.channelsNone}</b>
        </span>
        <span className={`atm__hp ${data.opsAlertConfigured ? "" : "is-warn"}`}>
          <i />
          {copy.health.alert} <b>{data.opsAlertConfigured ? copy.health.alertOn : copy.health.alertOff}</b>
        </span>
        <span className={`atm__role ${view ? "is-view" : ""}`}>
          <i />
          {view ? copy.role.view : copy.role.manage}
        </span>
      </div>

      <div className="atm__body">
        <aside className="atm__list">
          <div className="atm__sec">Slack</div>
          {data.jobs.map((item) => {
            const last = item.runs[0];
            return (
              <button
                className={`atm__item ${item.jobKey === selected ? "is-on" : ""}`}
                key={item.jobKey}
                onClick={() => setSelected(item.jobKey)}
                type="button"
              >
                <span className="atm__item1">
                  <span className="atm__name">{jobCopy(item.jobKey).name}</span>
                  <span className={`atm__pill ${item.enabled ? "is-on" : "is-off"}`}>{item.enabled ? copy.on : copy.off}</span>
                </span>
                <span className="atm__item2">
                  <span className="atm__mono">{item.kind === "scheduled" ? fill(copy.whenDaily, { time: item.sendTime }) : copy.whenEvent}</span>
                  <span>·</span>
                  <span className={`atm__dot ${last ? `is-${last.status}` : ""}`} />
                  <span>
                    {last
                      ? `${formatTime(last.createdAt, localeTag)} ${copy.history.statuses[last.status]}`
                      : copy.noRuns}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="atm__sec">{copy.sectionLater}</div>
          <div className="atm__soon">
            {copy.laterTitle}
            <span>{copy.laterBody}</span>
          </div>
          <div className="atm__foot">{copy.footTz}</div>
        </aside>

        <section className="atm__detail">
          <div className="atm__head">
            <div>
              <div className="atm__dname">{jobCopy(job.jobKey).name}</div>
              <div className="atm__dsub">{jobCopy(job.jobKey).sub}</div>
              <div className="atm__meta">
                <span className="atm__chip">
                  {job.kind === "scheduled"
                    ? fill(copy.whenLong, { time: job.sendTime, until: job.retryUntil })
                    : fill(copy.eventLong, { trigger: copy.triggers[job.jobKey as keyof Copy["triggers"]] ?? "" })}
                </span>
                <span className="atm__chip">
                  {fill(copy.destCount, { m: messageCount, n: job.destinations.length })}
                </span>
                {job.enabled && job.nextWakeAt && job.kind === "scheduled" ? (
                  <span className="atm__chip">{fill(copy.nextRun, { at: formatTime(job.nextWakeAt, localeTag) })}</span>
                ) : null}
              </div>
            </div>
            <div className={`atm__switch ${job.enabled ? "is-on" : ""}`}>
              <span>{job.enabled ? copy.toggleOn : copy.toggleOff}</span>
              <button
                aria-label={copy.toggleAria}
                aria-pressed={job.enabled}
                className={`atm__tg ${job.enabled ? "is-on" : ""}`}
                disabled={view || pending}
                onClick={toggle}
                type="button"
              >
                <i />
              </button>
            </div>
          </div>

          <div className="atm__tabs">
            {tabs.map((key) => (
              <button className={`atm__tab ${activeTab === key ? "is-on" : ""}`} key={key} onClick={() => setTab(key)} type="button">
                {copy.tabs[key]}
              </button>
            ))}
          </div>

          <div className="atm__pane">
            {activeTab === "preview" ? (
              <PreviewPane
                copy={copy}
                data={data}
                errorText={errorText}
                flash={flash}
                job={job}
                key={`preview-${job.jobKey}`}
                lastRun={lastRun}
                localeTag={localeTag}
                shared={shared}
                userLocale={locale}
                view={view}
              />
            ) : null}
            {activeTab === "assign" ? (
              <AssignPane copy={copy} data={data} errorText={errorText} flash={flash} localeTag={localeTag} shared={shared} userLocale={locale} view={view} />
            ) : null}
            {activeTab === "history" ? <HistoryPane copy={copy} errorText={errorText} flash={flash} job={job} localeTag={localeTag} /> : null}
            {activeTab === "settings" ? (
              <SettingsPane
                copy={copy}
                data={data}
                errorText={errorText}
                flash={flash}
                job={job}
                key={`settings-${job.jobKey}-${job.sendTime}-${job.retryUntil}`}
                localeTag={localeTag}
                view={view}
              />
            ) : null}
          </div>
        </section>
      </div>

      {confirmOn ? (
        <div className="atm__scrim" onClick={() => setConfirmOn(false)} role="presentation">
          <div aria-modal="true" className="atm__modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="atm__mt">{copy.confirmTitle}</div>
            <div className="atm__mb">
              {fill(copy.confirmBody, {
                m: messageCount,
                n: job.destinations.length,
                name: jobCopy(job.jobKey).name,
                when: job.kind === "scheduled" ? fill(copy.confirmWhenDaily, { time: job.sendTime }) : copy.confirmWhenEvent,
              })}
            </div>
            {job.destinations.length === 0 ? <div className="atm__warn">{copy.errors.no_destination}</div> : null}
            {/* 발송 시간대 안에서 켜면 다음 틱(1분 안)에 바로 나간다 — 미리 알린다. */}
            {job.kind === "scheduled" && job.destinations.length > 0 && isScheduledSendDue({ ...job, enabled: true }, new Date()) ? (
              <div className="atm__warn">{fill(copy.sendsNowWarning, { until: job.retryUntil })}</div>
            ) : null}
            <div className="atm__mf">
              <button className="atm__btn" onClick={() => setConfirmOn(false)} type="button">
                {copy.cancel}
              </button>
              <button className="atm__btn is-ok" disabled={pending} onClick={confirmEnable} type="button">
                {copy.confirmOk}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="atm__toast">{toast}</div> : null}
    </div>
  );
}

// ── 미리보기 ─────────────────────────────────────────────────────────────

function PreviewPane({
  job,
  data,
  copy,
  shared,
  view,
  flash,
  errorText,
  lastRun,
  localeTag,
  userLocale,
}: {
  job: AutomationJobView;
  data: AutomationPageData;
  copy: Copy;
  shared: SharedCopy;
  view: boolean;
  flash: (text: string) => void;
  errorText: (code: string) => string;
  lastRun: AutomationJobView["runs"][number] | null;
  localeTag: string;
  userLocale: AutomationLocale;
}) {
  const defaultDate = job.jobKey === "daily_report" ? data.yesterday : data.today;
  const [date, setDate] = useState(defaultDate);
  const [lang, setLang] = useState<AutomationLocale>(job.destinations[0]?.locales[0] ?? userLocale);
  const [preview, setPreview] = useState<{ key: string; text: string | null } | null>(null);
  const [sending, startSend] = useTransition();
  const timed = job.kind === "scheduled";
  const requestKey = `${job.jobKey}|${date}|${lang}`;
  // 결과가 지금 고른 조건의 것이 아니면 「만드는 중」 — effect 안에서 상태를 미리 비우지 않는다.
  const loading = preview?.key !== requestKey;
  const text = loading ? null : (preview?.text ?? null);

  useEffect(() => {
    let alive = true;
    previewAutomationMessage({ date, jobKey: job.jobKey, locale: lang }).then((result) => {
      if (!alive) return;
      setPreview({ key: requestKey, text: result.ok ? result.text : null });
      if (!result.ok) flash(errorText(result.error));
    });
    return () => {
      alive = false;
    };
  }, [date, errorText, flash, job.jobKey, lang, requestKey]);

  const sendNow = () => {
    if (!window.confirm(copy.preview.sendConfirm)) return;
    startSend(async () => {
      const result = await sendAutomationNow({ date, jobKey: job.jobKey });
      if (!result.ok) return flash(errorText(result.error));
      flash(fill(copy.preview.sentToast, { failed: result.failed, sent: result.sent }));
    });
  };

  return (
    <>
      <div className="atm__tool">
        {timed ? (
          <AdminDatePicker
            ariaLabel={copy.preview.date}
            labels={{ nextMonth: shared.dateNextMonth, prevMonth: shared.datePrevMonth, today: shared.dateToday }}
            localeTag={localeTag}
            onChange={setDate}
            value={date}
          />
        ) : (
          <span className="atm__chip">{copy.preview.eventSample}</span>
        )}
        <div className="atm__lseg">
          {AUTOMATION_LOCALES.map((item) => (
            <button className={lang === item ? "is-on" : ""} key={item} onClick={() => setLang(item)} type="button">
              {LANG_LABEL[item]}
            </button>
          ))}
        </div>
        <div className="atm__sp" />
        <button
          className="atm__btn"
          disabled={!text}
          onClick={() => {
            if (text) void navigator.clipboard?.writeText(text);
            flash(copy.preview.copied);
          }}
          type="button"
        >
          {copy.preview.copy}
        </button>
        <button className="atm__btn is-primary" disabled={view || sending || job.destinations.length === 0} onClick={sendNow} type="button">
          {copy.preview.sendNow}
        </button>
      </div>
      <div className="atm__cols">
        <div className="atm__slack">
          <div className="atm__sh">
            <div aria-hidden className="atm__av" />
            {/* 실제 Slack 에 보이는 보내는 사람 이름(Slack 앱 이름 — 고유 명사라 번역하지 않는다). */}
            <span className="atm__sn">StayOps Automation</span>
            <span className="atm__stag">{copy.preview.app}</span>
          </div>
          <div className="atm__msg">
            {loading ? (
              <span className="atm__note">{copy.preview.loading}</span>
            ) : text ? (
              text.split("\n").map((line, index) => (
                <div className="atm__ml" key={index}>
                  {line === ""
                    ? " "
                    : segments(line).map((part, partIndex) => (part.bold ? <b key={partIndex}>{part.text}</b> : <span key={partIndex}>{part.text}</span>))}
                </div>
              ))
            ) : (
              <span className="atm__note">{copy.preview.empty}</span>
            )}
          </div>
        </div>
        <div className="atm__aside">
          <div className="atm__box">
            <div className="atm__bh">{copy.preview.destinations}</div>
            {job.destinations.length === 0 ? <div className="atm__note">{copy.errors.no_destination}</div> : null}
            {job.destinations.flatMap((item) =>
              item.locales.map((itemLocale) => (
                <div className="atm__dest" key={`${item.channelKey}-${itemLocale}`}>
                  <span className="atm__mono">{item.channelKey}</span>
                  <span className={`atm__lg ${itemLocale === lang ? "" : "is-dim"}`}>{LANG_LABEL[itemLocale]}</span>
                </div>
              )),
            )}
            <div className="atm__note" style={{ marginTop: 6 }}>
              {copy.preview.eachLocale}
            </div>
          </div>
          <div className="atm__box">
            <div className="atm__bh">{copy.preview.lastRun}</div>
            <div className="atm__kv">
              <span>{copy.preview.lastAt}</span>
              <b className="atm__mono">{lastRun ? formatTime(lastRun.createdAt, localeTag) : "—"}</b>
            </div>
            <div className="atm__kv">
              <span>{copy.preview.lastResult}</span>
              {lastRun ? (
                <span className={`atm__pill is-${lastRun.status}`}>{copy.history.statuses[lastRun.status]}</span>
              ) : (
                <span className="atm__pill is-off">{copy.noRuns}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 담당자 ───────────────────────────────────────────────────────────────

function AssignPane({
  data,
  copy,
  shared,
  view,
  flash,
  errorText,
  localeTag,
  userLocale,
}: {
  data: AutomationPageData;
  copy: Copy;
  shared: SharedCopy;
  view: boolean;
  flash: (text: string) => void;
  errorText: (code: string) => string;
  localeTag: string;
  userLocale: AutomationLocale;
}) {
  const [date, setDate] = useState(data.today);
  const [board, setBoard] = useState<{ date: string; rooms: AssigneeRoomView[]; sent: boolean; roomOptions: CleaningRoomOptionGroup[] } | null>(null);
  const [addKey, setAddKey] = useState("");
  const [addNote, setAddNote] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, startBusy] = useTransition();
  // 고른 날짜의 명단이 아직 안 왔으면 null(「만드는 중」).
  const rooms = board?.date === date ? board.rooms : null;
  const sent = board?.date === date ? board.sent : false;
  const setRooms = (update: (current: AssigneeRoomView[]) => AssigneeRoomView[]) =>
    setBoard((current) => (current ? { ...current, rooms: update(current.rooms) } : current));

  const reload = useCallback(() => {
    loadAssigneeBoard(date, userLocale).then((result) => {
      if (!result.ok) {
        flash(errorText(result.error));
        setBoard({ date, roomOptions: [], rooms: [], sent: false });
        return;
      }
      setBoard({ date, roomOptions: result.roomOptions, rooms: result.rooms, sent: result.sent });
      setNames(Object.fromEntries(result.rooms.map((room) => [room.roomKey, room.names])));
    });
  }, [date, errorText, flash, userLocale]);

  useEffect(() => {
    reload();
  }, [reload]);

  const commit = (room: AssigneeRoomView) => {
    const value = names[room.roomKey] ?? "";
    if (value === room.names) return;
    startBusy(async () => {
      const result = await saveCleaningAssignee({ date, names: value, roomKey: room.roomKey });
      if (!result.ok) return flash(errorText(result.error));
      setRooms((current) => current.map((item) => (item.roomKey === room.roomKey ? { ...item, names: value.trim() } : item)));
      flash(copy.assign.saved);
    });
  };

  // 청소 방 직접 추가(연박 청소 등 — Hotelsmart 대신). 이미 명단에 있는 방은 고를 목록에서 뺀다.
  const listedKeys = new Set((rooms ?? []).filter((room) => room.section === "cleaning").map((room) => room.roomKey));
  const addOptions = (board?.date === date ? board.roomOptions : []).flatMap((group) =>
    group.rooms.filter((room) => !listedKeys.has(room.roomKey)).map((room) => ({ label: `${group.label} · ${room.code}`, value: room.roomKey })),
  );
  const addRoom = () => {
    if (!addKey) return;
    startBusy(async () => {
      const result = await addCleaningExtraRoom({ date, note: addNote, roomKey: addKey });
      if (!result.ok) return flash(errorText(result.error));
      setAddKey("");
      setAddNote("");
      flash(copy.assign.extraAdded);
      reload();
    });
  };
  const removeRoom = (room: AssigneeRoomView) => {
    startBusy(async () => {
      const result = await removeCleaningExtraRoom({ date, roomKey: room.roomKey });
      if (!result.ok) return flash(errorText(result.error));
      flash(copy.assign.extraRemoved);
      reload();
    });
  };

  const changed = (rooms ?? []).filter((room) => sent && room.sentNames !== null && (names[room.roomKey] ?? "").trim() !== (room.sentNames ?? ""));
  const sendCorrection = () => {
    startBusy(async () => {
      const result = await sendAutomationNow({ correction: true, date, jobKey: "cleaning_list" });
      if (!result.ok) return flash(errorText(result.error));
      flash(copy.assign.correctionSent);
      reload();
    });
  };

  const groups = (section: "cleaning" | "setting") => {
    const list = (rooms ?? []).filter((room) => room.section === section);
    const byBuilding = new Map<string, AssigneeRoomView[]>();
    for (const room of list) byBuilding.set(room.label, [...(byBuilding.get(room.label) ?? []), room]);
    return [...byBuilding.entries()];
  };
  const counts = {
    c: (rooms ?? []).filter((room) => room.section === "cleaning").length,
    n: Object.values(names).filter((value) => value.trim()).length,
    s: (rooms ?? []).filter((room) => room.section === "setting").length,
  };

  const roomLabel = (room: AssigneeRoomView) =>
    room.kind === "extra"
      ? room.note || copy.assign.extraDefault
      : room.kind === "no_checkin"
      ? room.pax !== null
        ? `${copy.assign.noCheckIn} (${room.pax})`
        : copy.assign.noCheckIn
      : `${room.guestName ?? "-"}${room.pax !== null ? ` (${room.pax})` : ""}`;

  const renderSection = (section: "cleaning" | "setting") => {
    const list = groups(section);
    if (list.length === 0) return <div className="atm__note">{copy.assign.none}</div>;
    return (
      <div className="atm__agrid">
        {list.map(([label, items]) => (
          <div className={`atm__ab${section === "setting" ? " is-setting" : ""}`} key={`${section}-${label}`}>
            <div className="atm__abh">{label}</div>
            {items.map((room) => {
              const isChanged = changed.some((item) => item.roomKey === room.roomKey);
              return (
                <div className="atm__ar" key={room.roomKey}>
                  <span className={isChanged ? "atm__chg" : "atm__nochg"} />
                  <span className="atm__rc">{room.code}</span>
                  <span className="atm__rl">{roomLabel(room)}</span>
                  <input
                    aria-label={`${room.code} ${copy.assign.namePlaceholder}`}
                    className="atm__nin"
                    disabled={view}
                    maxLength={120}
                    onBlur={() => commit(room)}
                    onChange={(event) => setNames((current) => ({ ...current, [room.roomKey]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    }}
                    placeholder={copy.assign.namePlaceholder}
                    value={names[room.roomKey] ?? ""}
                  />
                  {room.kind === "extra" && !view ? (
                    <button
                      aria-label={`${room.code} ${copy.assign.removeRoom}`}
                      className="atm__xbtn"
                      disabled={busy}
                      onClick={() => removeRoom(room)}
                      title={copy.assign.removeRoom}
                      type="button"
                    >
                      <X aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="atm__tool">
        <AdminDatePicker
          ariaLabel={copy.preview.date}
          labels={{ nextMonth: shared.dateNextMonth, prevMonth: shared.datePrevMonth, today: shared.dateToday }}
          localeTag={localeTag}
          onChange={setDate}
          value={date}
        />
        <span className="atm__chip">{fill(copy.assign.count, counts)}</span>
        <div className="atm__sp" />
        <span className="atm__note">{copy.assign.note}</span>
      </div>
      {view ? <div className="atm__ro">{copy.assign.viewOnly}</div> : null}
      {changed.length > 0 ? (
        <div className="atm__warn">
          <span>{fill(copy.assign.changed, { n: changed.length })}</span>
          <button className="atm__btn sm" disabled={view || busy} onClick={sendCorrection} type="button">
            {copy.assign.sendCorrection}
          </button>
        </div>
      ) : null}
      {rooms === null ? (
        <div className="atm__note">{copy.preview.loading}</div>
      ) : rooms.length === 0 ? (
        <div className="atm__empty">
          <b>{copy.assign.empty}</b>
        </div>
      ) : (
        <>
          {/* 청소 · 셋팅은 Slack 명단처럼 두 덩어리 — 머리줄(제목 + 객실 수)로 확실히 가르고, 셋팅 카드는 머리 색을 다르게. */}
          <section className="atm__asec">
            <div className="atm__asech">
              <span className="atm__asect">{copy.assign.cleaning}</span>
              <span className="atm__asecn">{counts.c}</span>
            </div>
            {renderSection("cleaning")}
            {!view ? (
              <div className="atm__addroom">
                <span className="atm__addt">
                  <Plus aria-hidden="true" />
                  {copy.assign.addRoom}
                </span>
                <AdmDropdown
                  ariaLabel={copy.assign.addRoomPick}
                  onChange={setAddKey}
                  options={addOptions}
                  placeholder={copy.assign.addRoomPick}
                  searchable
                  searchPlaceholder={copy.assign.addRoomSearch}
                  size="sm"
                  value={addKey}
                />
                <input
                  aria-label={copy.assign.addRoomNote}
                  className="atm__nin"
                  maxLength={60}
                  onChange={(event) => setAddNote(event.target.value)}
                  placeholder={copy.assign.addRoomNote}
                  value={addNote}
                />
                <button className="atm__btn sm" disabled={busy || !addKey} onClick={addRoom} type="button">
                  {copy.assign.addRoomButton}
                </button>
                <span className="atm__note">{copy.assign.addRoomHint}</span>
              </div>
            ) : null}
          </section>
          <section className="atm__asec is-setting">
            <div className="atm__asech">
              <span className="atm__asect">{copy.assign.setting}</span>
              <span className="atm__asecn">{counts.s}</span>
            </div>
            {renderSection("setting")}
          </section>
        </>
      )}
    </>
  );
}

// ── 실행 기록 ─────────────────────────────────────────────────────────────

function HistoryPane({
  job,
  copy,
  flash,
  errorText,
  localeTag,
}: {
  job: AutomationJobView;
  copy: Copy;
  flash: (text: string) => void;
  errorText: (code: string) => string;
  localeTag: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const open = (id: string) => {
    loadAutomationRunMessage(id).then((result) => {
      if (!result.ok) return flash(errorText(result.error));
      setMessage(result.text || "—");
    });
  };
  const reasonText = (reason: string | null) => {
    if (!reason) return "";
    if (reason.startsWith("http_")) return fill(copy.history.reasons.http, { code: reason.slice(5) });
    return (copy.history.reasons as Record<string, string>)[reason] ?? reason;
  };

  if (job.runs.length === 0) {
    return (
      <div className="atm__empty">
        <b>{copy.history.empty}</b>
        <span>{copy.history.emptyBody}</span>
      </div>
    );
  }
  return (
    <>
      <table className="atm__tbl">
        <thead>
          <tr>
            <th>{copy.history.at}</th>
            <th>{copy.history.target}</th>
            <th>{copy.history.channel}</th>
            <th>{copy.history.locale}</th>
            <th>{copy.history.trigger}</th>
            <th>{copy.history.result}</th>
            <th>{copy.history.reason}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {job.runs.map((run) => (
            <tr key={run.id}>
              <td className="atm__mono">{formatTime(run.createdAt, localeTag)}</td>
              <td className="atm__mono">{run.targetDate ?? "—"}</td>
              <td className="atm__mono">{run.channelKey ?? "—"}</td>
              <td>{run.locale ? <span className="atm__lgb">{LANG_LABEL[run.locale as AutomationLocale] ?? run.locale}</span> : "—"}</td>
              <td>{(copy.history.triggers as Record<string, string>)[run.trigger] ?? run.trigger}</td>
              <td>
                <span className={`atm__pill is-${run.status}`}>{copy.history.statuses[run.status]}</span>
              </td>
              <td className="is-dim">{reasonText(run.reason)}</td>
              <td>
                {run.channelKey ? (
                  <button className="atm__btn sm" onClick={() => open(run.id)} type="button">
                    {copy.history.message}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message !== null ? (
        <div className="atm__scrim" onClick={() => setMessage(null)} role="presentation">
          <div aria-modal="true" className="atm__modal is-wide" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="atm__mt">{copy.history.message}</div>
            <div className="atm__mpre">{message}</div>
            <div className="atm__mf">
              <button className="atm__btn" onClick={() => setMessage(null)} type="button">
                {copy.history.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── 설정 ─────────────────────────────────────────────────────────────────

function SettingsPane({
  job,
  data,
  copy,
  view,
  flash,
  errorText,
  localeTag,
}: {
  job: AutomationJobView;
  data: AutomationPageData;
  copy: Copy;
  view: boolean;
  flash: (text: string) => void;
  errorText: (code: string) => string;
  localeTag: string;
}) {
  const router = useRouter();
  const original = useMemo(() => draftOf(job), [job]);
  const [draft, setDraft] = useState<Draft>(original);
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const weekdayLabels = copy.settings.weekdayShort.split(",");
  const timed = job.kind === "scheduled";

  const destinationFor = (channelKey: string) => draft.destinations.find((item) => item.channelKey === channelKey);
  const toggleLocale = (channelKey: string, itemLocale: AutomationLocale) => {
    setDraft((current) => {
      const existing = current.destinations.find((item) => item.channelKey === channelKey);
      const locales = existing
        ? existing.locales.includes(itemLocale)
          ? existing.locales.filter((value) => value !== itemLocale)
          : [...existing.locales, itemLocale]
        : [itemLocale];
      const ordered = AUTOMATION_LOCALES.filter((value) => locales.includes(value));
      const rest = current.destinations.filter((item) => item.channelKey !== channelKey);
      return { ...current, destinations: ordered.length > 0 ? [...rest, { channelKey, locales: ordered }] : rest };
    });
  };
  const toggleWeekday = (day: number) =>
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day) ? current.weekdays.filter((value) => value !== day) : [...current.weekdays, day].sort(),
    }));
  const toggleExcluded = (name: string) =>
    setDraft((current) => {
      const list = current.settings.excludedProperties;
      return {
        ...current,
        settings: { ...current.settings, excludedProperties: list.includes(name) ? list.filter((value) => value !== name) : [...list, name] },
      };
    });
  const toggleChannel = (channel: (typeof DAILY_REPORT_CHANNELS)[number]) =>
    setDraft((current) => {
      const list = current.settings.channels;
      const next = list.includes(channel) ? list.filter((value) => value !== channel) : [...list, channel];
      return next.length === 0 ? current : { ...current, settings: { ...current.settings, channels: next } };
    });
  const setResend = (patch: Partial<AutomationSettings["resend"]>) =>
    setDraft((current) => ({ ...current, settings: { ...current.settings, resend: { ...current.settings.resend, ...patch } } }));

  const save = () => {
    // 켜져 있고 바꾼 시각 · 받는 곳으로 지금이 발송 시간대면, 저장 직후 틱이 바로 보낸다 — 한 번 묻는다.
    const sendsNow =
      timed &&
      job.enabled &&
      draft.destinations.length > 0 &&
      isScheduledSendDue({ ...draft, enabled: true, lastDoneOn: job.lastDoneOn }, new Date());
    if (sendsNow && !window.confirm(fill(copy.sendsNowWarning, { until: draft.retryUntil }))) return;
    startSave(async () => {
      const result = await saveAutomationJob({ jobKey: job.jobKey, ...draft });
      if (!result.ok) return flash(errorText(result.error));
      flash(copy.settings.saved);
      router.refresh();
    });
  };

  const changeCount = [
    draft.sendTime !== original.sendTime,
    draft.retryUntil !== original.retryUntil,
    JSON.stringify(draft.weekdays) !== JSON.stringify(original.weekdays),
    JSON.stringify(draft.destinations) !== JSON.stringify(original.destinations),
    JSON.stringify(draft.settings) !== JSON.stringify(original.settings),
  ].filter(Boolean).length;

  const fieldLabel = (key: string) => {
    if (key.startsWith("assignee:")) return copy.settings.fields.assignee;
    return (copy.settings.fields as Record<string, string>)[key] ?? key;
  };

  return (
    <div className="atm__form">
      {view ? <div className="atm__ro">{copy.settings.viewOnly}</div> : null}

      <div className="atm__fs">
        <div className="atm__fsh">
          {copy.settings.when} <span>{copy.settings.tokyo}</span>
        </div>
        {timed ? (
          <>
            <div className="atm__fr">
              <span className="atm__fl">{copy.settings.sendTime}</span>
              {view ? (
                <span className="atm__mono">{draft.sendTime}</span>
              ) : (
                <AdminTimePicker ariaLabel={copy.settings.sendTime} onChange={(value) => setDraft((c) => ({ ...c, sendTime: value }))} value={draft.sendTime} />
              )}
              <span className="atm__note">{copy.settings.sendTimeNote}</span>
            </div>
            <div className="atm__fr">
              <span className="atm__fl">{copy.settings.weekdays}</span>
              <div className="atm__days">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <button
                    className={`atm__day ${draft.weekdays.includes(day) ? "is-on" : ""}`}
                    disabled={view}
                    key={day}
                    onClick={() => toggleWeekday(day)}
                    type="button"
                  >
                    {weekdayLabels[day - 1] ?? day}
                  </button>
                ))}
              </div>
            </div>
            <div className="atm__fr">
              <span className="atm__fl">{copy.settings.retryUntil}</span>
              {view ? (
                <span className="atm__mono">{draft.retryUntil}</span>
              ) : (
                <AdminTimePicker
                  ariaLabel={copy.settings.retryUntil}
                  onChange={(value) => setDraft((c) => ({ ...c, retryUntil: value }))}
                  value={draft.retryUntil}
                />
              )}
              <span className="atm__note">{copy.settings.retryNote}</span>
            </div>
          </>
        ) : (
          <div className="atm__fr">
            <span className="atm__fl">{copy.settings.eventWhen}</span>
            <span className="atm__note">
              {fill(copy.settings.eventNote, { trigger: copy.triggers[job.jobKey as keyof Copy["triggers"]] ?? "" })}
            </span>
          </div>
        )}
      </div>

      <div className="atm__fs">
        <div className="atm__fsh">
          {copy.settings.dest} <span>{copy.settings.destNote}</span>
        </div>
        {data.channels.length === 0 ? (
          <div className="atm__fr">
            <span className="atm__note">{copy.settings.noChannels}</span>
          </div>
        ) : (
          <table className="atm__dtbl">
            <thead>
              <tr>
                <th>{copy.settings.channel}</th>
                <th>{copy.settings.connection}</th>
                {AUTOMATION_LOCALES.map((item) => (
                  <th className="c" key={item}>
                    {LANG_LABEL[item]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.channels.map((channel) => {
                const destination = destinationFor(channel.key);
                return (
                  <tr key={channel.key}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{channel.key}</div>
                      <div className="atm__envk">SLACK_AUTOMATION_{channel.key}_WEBHOOK_URL</div>
                    </td>
                    <td>
                      <span className={`atm__conn ${channel.valid ? "" : "is-bad"}`}>
                        <i />
                        {channel.valid ? copy.settings.connected : copy.settings.invalid}{" "}
                        <span className="atm__mono" style={{ color: "var(--faint)" }}>
                          …{channel.last4}
                        </span>
                      </span>
                    </td>
                    {AUTOMATION_LOCALES.map((item) => {
                      const on = destination?.locales.includes(item) ?? false;
                      return (
                        <td className="c" key={item}>
                          <button
                            aria-label={`${channel.key} ${LANG_LABEL[item]}`}
                            aria-pressed={on}
                            className={`atm__ck ${on ? "is-on" : ""}`}
                            disabled={view || !channel.valid}
                            onClick={() => toggleLocale(channel.key, item)}
                            type="button"
                          >
                            {on ? <Check size={13} strokeWidth={3} /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="atm__fr">
          <span className="atm__note">{copy.settings.channelHint}</span>
        </div>
      </div>

      <div className="atm__fs">
        <div className="atm__fsh">
          {copy.settings.rules} <span>{copy.settings.rulesNote}</span>
        </div>
        {job.jobKey === "daily_report" ? (
          <div className="atm__fr">
            <span className="atm__fl">{copy.settings.channelsRule}</span>
            <div className="atm__chips">
              {DAILY_REPORT_CHANNELS.map((channel) => (
                <button
                  className={`atm__cp ${draft.settings.channels.includes(channel) ? "is-on" : ""}`}
                  disabled={view}
                  key={channel}
                  onClick={() => toggleChannel(channel)}
                  type="button"
                >
                  {copy.settings.channelNames[channel]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {job.jobKey !== "failure_alert" && job.jobKey !== "cancel_alert" ? (
          <div className="atm__fr">
            <span className="atm__fl">{copy.settings.excluded}</span>
            <div className="atm__chips">
              {data.buildings.map((building) => (
                <button
                  className={`atm__cp ${draft.settings.excludedProperties.includes(building.name) ? "is-on" : ""}`}
                  disabled={view}
                  key={building.name}
                  onClick={() => toggleExcluded(building.name)}
                  type="button"
                >
                  {building.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {job.jobKey === "cancel_alert" || job.jobKey === "same_day_alert" || job.jobKey === "failure_alert" ? (
          <div className="atm__fr">
            <span className="atm__fl">{copy.settings.scopeLabel}</span>
            <span className="atm__note">{copy.settings.scope[job.jobKey]}</span>
          </div>
        ) : null}
        {job.jobKey === "cleaning_list" ? (
          <div className="atm__fr">
            <span className="atm__fl">{copy.settings.roomCodesLabel}</span>
            <span className="atm__note">{copy.settings.roomCodes}</span>
          </div>
        ) : null}
        {timed ? (
          <div className="atm__fr">
            <span className="atm__fl">{job.jobKey === "daily_report" ? copy.settings.resendDailyLabel : copy.settings.resendCleaningLabel}</span>
            <div className="atm__inl">
              <button
                aria-pressed={draft.settings.resend.enabled}
                className={`atm__tg sm ${draft.settings.resend.enabled ? "is-on" : ""}`}
                disabled={view}
                onClick={() => setResend({ enabled: !draft.settings.resend.enabled })}
                type="button"
              >
                <i />
              </button>
              <span>{job.jobKey === "daily_report" ? copy.settings.resendDaily : copy.settings.resendCleaning}</span>
              <label className="atm__inl">
                {copy.settings.debounce}
                <input
                  className="atm__num"
                  disabled={view}
                  max={120}
                  min={1}
                  onChange={(event) => setResend({ debounceMinutes: Number(event.target.value) || 1 })}
                  type="number"
                  value={draft.settings.resend.debounceMinutes}
                />
              </label>
              <label className="atm__inl">
                {copy.settings.max}
                <input
                  className="atm__num"
                  disabled={view}
                  max={20}
                  min={0}
                  onChange={(event) => setResend({ maxPerDay: Number(event.target.value) || 0 })}
                  type="number"
                  value={draft.settings.resend.maxPerDay}
                />
              </label>
              <span>{copy.settings.until}</span>
              {view ? (
                <span className="atm__mono">{draft.settings.resend.until}</span>
              ) : (
                <AdminTimePicker ariaLabel={copy.settings.until} onChange={(value) => setResend({ until: value })} value={draft.settings.resend.until} />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {dirty && !view ? (
        <div className="atm__save">
          <span style={{ flex: 1 }}>{fill(copy.settings.unsaved, { n: changeCount })}</span>
          <button className="atm__btn is-ghost" onClick={() => setDraft(original)} type="button">
            {copy.settings.revert}
          </button>
          <button className="atm__btn is-white" disabled={saving} onClick={save} type="button">
            {copy.settings.save}
          </button>
        </div>
      ) : null}

      <div className="atm__fs">
        <div className="atm__fsh">{copy.settings.history}</div>
        {job.logs.length === 0 ? (
          <div className="atm__log">{copy.settings.noLogs}</div>
        ) : (
          job.logs.map((log) => (
            <div className="atm__log" key={log.id}>
              <span className="atm__mono">{formatTime(log.createdAt, localeTag)}</span>
              <b>{log.actorName ?? "—"}</b>
              <span>
                {Object.keys(log.changes)
                  .map((key) => fieldLabel(key))
                  .join(" · ")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
