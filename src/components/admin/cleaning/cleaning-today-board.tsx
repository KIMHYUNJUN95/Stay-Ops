"use client";

// Admin cleaning console — "오늘 현황" board: KPI-driven room-status cards grouped either by
// building or by status bucket, plus the 셋팅 대상 and 직원별 오늘 요약 sections below. Mirrors
// clean-views.js todayBoard()/buildingSections()/statusBuckets()/staffSummary() from the design
// handoff, rebuilt as React components over the shared .rmc/.bkgrid/.csec/.setgrid/.staffgrid CSS.
// Data is real (src/lib/admin-cleaning.ts) as of 2026-07-14.
import type { ReactNode } from "react";
import { Building2, Check, Clock, KeyRound, Search, Users } from "lucide-react";
import type { AdminCleaningTask, AdminSettingTarget } from "@/lib/admin-cleaning";
import { BUILDING_ORDER, durationMin, elapsedMin, fmtDur, type BuildingKey } from "./cleaning-console-data";
import {
  ReportBadges,
  StaffAvatar,
  StatusPill,
  buildingLabelOf,
  type ConsoleCopy,
  type StaffDirectory,
  staffLabelOf,
  typeLabel,
} from "./cleaning-console-shared";

type TodayBoardProps = {
  tasks: AdminCleaningTask[];
  setupTargets: AdminSettingTarget[];
  staffDirectory: StaffDirectory;
  t: ConsoleCopy;
  buildingLabels: Record<string, string>;
  group: "building" | "status";
  propFilter: BuildingKey | "all";
  staffFilter: string;
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedSetupKey: string | null;
  onSelectSetupTarget: (roomKey: string) => void;
  onClearFilters: () => void;
};

function RoomCard({
  task,
  t,
  buildingLabels,
  staffDirectory,
  showProp,
  selected,
  onSelect,
}: {
  task: AdminCleaningTask;
  t: ConsoleCopy;
  buildingLabels: Record<string, string>;
  staffDirectory: StaffDirectory;
  showProp: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const dur = durationMin(task.start, task.end);
  const elapsed = elapsedMin(task.start);

  return (
    <div
      className={`rmc is-${task.status}${selected ? " sel" : ""}`}
      onClick={() => onSelect(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
    >
      <div className="rmc__top">
        <div style={{ minWidth: 0 }}>
          <div className="rmc__rm">{task.room}</div>
          <div className="rmc__type">
            {showProp ? `${buildingLabelOf(task, buildingLabels)} · ` : ""}
            {typeLabel(task.type, t)}
          </div>
        </div>
        <div className="rmc__badges">
          <ReportBadges reports={task.reports} t={t} />
        </div>
      </div>

      <div className="rmc__st">
        <StatusPill status={task.status} t={t} />
        {task.status === "progress" ? (
          <span className="elapsed">
            <span className="ic">
              <Clock />
            </span>
            {fmtDur(elapsed)}
          </span>
        ) : null}
      </div>

      {task.staffId || task.status === "done" || task.status === "progress" ? (
        <div className="rmc__meta">
          {task.staffId ? (
            <div className="rmc__row">
              <span className="rmc__who">
                <StaffAvatar staffId={task.staffId} directory={staffDirectory} />
                <span>{staffLabelOf(task.staffId, staffDirectory)}</span>
              </span>
              {task.proxy ? (
                <>
                  <span className="sp" />
                  <span className="proxytag">{t.proxy}</span>
                </>
              ) : null}
            </div>
          ) : null}
          {task.status === "done" ? (
            <div className="rmc__row">
              <Clock className="ic" aria-hidden="true" />
              <span className="k">{t.duration}</span>
              <span className="mono">{fmtDur(dur)}</span>
              <span className="sp" />
              <span className="k">{t.endAt}</span>
              <span className="mono">{task.end}</span>
            </div>
          ) : null}
          {task.status === "progress" ? (
            <div className="rmc__row">
              <Clock className="ic" aria-hidden="true" />
              <span className="k">{t.startAt}</span>
              <span className="mono">{task.start}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {task.status === "done" ? (
        <div className="rmc__foot">
          <span className="rmc__done">
            <Check className="ic" aria-hidden="true" />
            {task.start} → {task.end}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SectionHead({
  icon,
  title,
  count,
  progress,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  progress?: ReactNode;
}) {
  return (
    <div className="csec">
      <span className="csec__ic">{icon}</span>
      <span className="csec__t">{title}</span>
      <span className="csec__c">{count}</span>
      <span className="csec__line" />
      {progress ? <span className="csec__prog">{progress}</span> : null}
    </div>
  );
}

function BuildingSections(props: {
  tasks: AdminCleaningTask[];
  t: ConsoleCopy;
  buildingLabels: Record<string, string>;
  staffDirectory: StaffDirectory;
  propFilter: BuildingKey | "all";
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { tasks, t, buildingLabels, staffDirectory, propFilter, selectedId, onSelect } = props;

  // Group by known BuildingKey first (fixed operational order); any task whose room label didn't
  // resolve to one of the 7 canonical buildings gets its own group, appended after, keyed by the
  // raw property name so real data never silently drops a room.
  const knownGroups = new Map<BuildingKey, AdminCleaningTask[]>();
  const otherGroups = new Map<string, AdminCleaningTask[]>();
  for (const task of tasks) {
    if (task.building) {
      const list = knownGroups.get(task.building) ?? [];
      list.push(task);
      knownGroups.set(task.building, list);
    } else {
      const list = otherGroups.get(task.buildingRaw) ?? [];
      list.push(task);
      otherGroups.set(task.buildingRaw, list);
    }
  }

  const sections: { key: string; label: string; items: AdminCleaningTask[] }[] = [];
  for (const b of BUILDING_ORDER) {
    if (propFilter !== "all" && b !== propFilter) continue;
    const items = knownGroups.get(b);
    if (items?.length) sections.push({ key: b, label: buildingLabels[b] ?? b, items });
  }
  if (propFilter === "all") {
    for (const [raw, items] of [...otherGroups].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (items.length) sections.push({ key: raw, label: raw, items });
    }
  }

  return (
    <>
      {sections.map(({ key, label, items }) => {
        const done = items.filter((task) => task.status === "done").length;
        const pct = Math.round((done / items.length) * 100);
        return (
          <div key={key}>
            <SectionHead
              icon={<Building2 aria-hidden="true" />}
              title={label}
              count={items.length}
              progress={
                <>
                  {done}/{items.length} {t.doneN}
                  <span className="csec__bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  {pct}%
                </>
              }
            />
            <div className="rmcgrid">
              {items.map((task) => (
                <RoomCard
                  key={task.id}
                  task={task}
                  t={t}
                  buildingLabels={buildingLabels}
                  staffDirectory={staffDirectory}
                  showProp={false}
                  selected={selectedId === task.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function StatusBuckets(props: {
  tasks: AdminCleaningTask[];
  t: ConsoleCopy;
  buildingLabels: Record<string, string>;
  staffDirectory: StaffDirectory;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { tasks, t, buildingLabels, staffDirectory, selectedId, onSelect } = props;
  const buckets: Array<{
    key: "pending" | "progress" | "done";
    label: string;
    icon: ReactNode;
    has: (task: AdminCleaningTask) => boolean;
  }> = [
    {
      key: "pending",
      label: t.bkPending,
      icon: <Clock aria-hidden="true" />,
      has: (task) => task.status === "pending",
    },
    {
      key: "progress",
      label: t.bkProgress,
      icon: <Clock aria-hidden="true" />,
      has: (task) => task.status === "progress",
    },
    { key: "done", label: t.bkDone, icon: <Check aria-hidden="true" />, has: (task) => task.status === "done" },
  ];
  return (
    <div className="bkgrid">
      {buckets.map((bucket) => {
        const items = tasks.filter(bucket.has);
        return (
          <section className={`bkcol bkcol--${bucket.key}`} key={bucket.key}>
            <div className="bkcol__h">
              <span className="bkcol__ic">{bucket.icon}</span>
              <span className="bkcol__t">{bucket.label}</span>
              <span className="bkcol__c">{items.length}</span>
            </div>
            <div className="bkcol__body">
              {items.length ? (
                items.map((task) => (
                  <RoomCard
                    key={task.id}
                    task={task}
                    t={t}
                    buildingLabels={buildingLabels}
                    staffDirectory={staffDirectory}
                    showProp
                    selected={selectedId === task.id}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <div className="cnone">
                  <Check className="ic" aria-hidden="true" />
                  {t.emptyT}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SetupSection({
  targets,
  t,
  buildingLabels,
  selectedSetupKey,
  onSelectSetupTarget,
}: {
  targets: AdminSettingTarget[];
  t: ConsoleCopy;
  buildingLabels: Record<string, string>;
  selectedSetupKey: string | null;
  onSelectSetupTarget: (roomKey: string) => void;
}) {
  if (!targets.length) return null;
  return (
    <>
      <SectionHead
        icon={<KeyRound aria-hidden="true" style={{ color: "var(--primary)" }} />}
        title={t.secSetup}
        count={targets.length}
        progress={<span style={{ color: "var(--muted)" }}>{t.secSetupSub}</span>}
      />
      <div className="setgrid">
        {targets.map((target) => (
          <div
            className={`setrow${selectedSetupKey === target.roomKey ? " sel" : ""}`}
            key={target.roomKey}
            onClick={() => onSelectSetupTarget(target.roomKey)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSetupTarget(target.roomKey);
              }
            }}
          >
            <span className="setrow__rm">{target.room}</span>
            <div className="setrow__b">
              <div className="setrow__t">{target.guest}</div>
              <div className="setrow__s">
                {buildingLabelOf(target, buildingLabels)} · {t.arriving} <span className="mono">{t.today}</span>
              </div>
            </div>
            <span className="setrow__pax">
              <Users className="ic" aria-hidden="true" />
              {target.pax}
              {t.pax}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function StaffSummarySection({
  tasks,
  t,
  staffDirectory,
}: {
  tasks: AdminCleaningTask[];
  t: ConsoleCopy;
  staffDirectory: StaffDirectory;
}) {
  const done = tasks.filter((task) => task.status === "done" && task.staffId);
  const doneStaffIds = new Set(done.map((task) => task.staffId));
  const staffList = [...staffDirectory.values()].filter((s) => doneStaffIds.has(s.id));
  if (!staffList.length) return null;
  return (
    <>
      <SectionHead icon={<Users aria-hidden="true" />} title={t.secStaff} count={staffList.length} />
      <div className="staffgrid">
        {staffList.map((s) => {
          const mine = done.filter((task) => task.staffId === s.id);
          const durs = mine.map((task) => durationMin(task.start, task.end)).filter((v): v is number => v != null);
          const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
          return (
            <div className="staffc" key={s.id}>
              <span className="staffc__av" style={{ background: s.bg }}>
                {s.name.slice(0, 1)}
              </span>
              <div className="staffc__b">
                <div className="staffc__nm">{s.name}</div>
                <div className="staffc__s">
                  {t.doneN} {mine.length}
                  {t.unitCount}
                </div>
              </div>
              <div className="staffc__sep" />
              <div className="staffc__stat">
                <div className="staffc__v">{avg == null ? "—" : fmtDur(avg)}</div>
                <div className="staffc__k">{t.avg}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function TodayBoard({
  tasks,
  setupTargets,
  staffDirectory,
  t,
  buildingLabels,
  group,
  propFilter,
  staffFilter,
  query,
  selectedId,
  onSelect,
  selectedSetupKey,
  onSelectSetupTarget,
  onClearFilters,
}: TodayBoardProps) {
  const q = query.trim().toLowerCase();
  const match = (task: AdminCleaningTask) => {
    if (propFilter !== "all" && task.building !== propFilter) return false;
    if (staffFilter !== "all" && task.staffId !== staffFilter) return false;
    if (!q) return true;
    const buildingText = buildingLabelOf(task, buildingLabels).toLowerCase();
    const staffText = task.staffId ? staffLabelOf(task.staffId, staffDirectory).toLowerCase() : "";
    return task.room.toLowerCase().includes(q) || staffText.includes(q) || buildingText.includes(q);
  };
  const all = tasks.filter((task) => task.type !== "setup" && match(task));

  const setups = setupTargets.filter(
    (target) => propFilter === "all" || target.building === propFilter,
  );
  const filtersActive = staffFilter !== "all" || propFilter !== "all" || Boolean(q);

  if (!all.length) {
    return (
      <div className="card">
        <div className="state">
          <div className={`state__ic ${filtersActive ? "empty" : "ok"}`}>
            {filtersActive ? <Search aria-hidden="true" /> : <Check aria-hidden="true" />}
          </div>
          <div className="state__t">{t.emptyT}</div>
          <div className="state__s">{t.emptyS}</div>
          {filtersActive ? (
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={onClearFilters}>
              {t.clearFilter}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      {group === "status" ? (
        <StatusBuckets
          tasks={all}
          t={t}
          buildingLabels={buildingLabels}
          staffDirectory={staffDirectory}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <BuildingSections
          tasks={all}
          t={t}
          buildingLabels={buildingLabels}
          staffDirectory={staffDirectory}
          propFilter={propFilter}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <SetupSection
        targets={setups}
        t={t}
        buildingLabels={buildingLabels}
        selectedSetupKey={selectedSetupKey}
        onSelectSetupTarget={onSelectSetupTarget}
      />
      <StaffSummarySection tasks={tasks} t={t} staffDirectory={staffDirectory} />
    </>
  );
}
