"use client";

// Admin · Attendance · 추가수당 (attendance allowance) management section.
// Lives inside /admin/attendance/wages (no separate tab, per the MVP design). Privileged create/cancel
// of busy-day / short-staffed-day extra pay for a specific Tokyo operating date. Base rates in
// hourly_rate_history are never touched here. All writes go through service-role server actions that
// also block changes to an already-finalized user-month.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleAlert, HandCoins, Info, Plus, Sparkles, X } from "lucide-react";
import type { AdminAllowanceRow } from "@/lib/admin-attendance";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import {
  createAttendanceAllowance,
  cancelAttendanceAllowance,
} from "@/app/admin/attendance/actions";
import { AdminDatePicker } from "../shared/admin-date-picker";
import { AdminReasonModal } from "../shared/admin-reason-modal";
import { AdminSelectField } from "../shared/admin-select-field";
import { AdminToast, useAdminToast } from "../shared/admin-toast";
import { formatAdminYen } from "../shared/admin-format";

type Att = Dictionary["admin"]["attendanceConsole"];
type AllowanceType = "daily_fixed" | "hourly_extra";
type Category = "regular" | "special";
const CATEGORIES: Category[] = ["regular", "special"];

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="ic">{children}</span>;
}

function typeLabel(t: AllowanceType, c: Att): string {
  return t === "hourly_extra" ? c.allowTypeHourlyExtra : c.allowTypeDailyFixed;
}
function categoryLabel(cat: string, c: Att): string {
  return cat === "special" ? c.allowCatSpecial : c.allowCatRegular;
}

export function AttendanceAllowancesSection({
  allowances,
  staff,
  defaultDate,
  locale,
  localeTag,
}: {
  allowances: AdminAllowanceRow[];
  staff: { userId: string; userName: string }[];
  defaultDate: string; // today (Tokyo)
  locale: Locale;
  localeTag: string;
}) {
  const c = getDictionary(locale).admin.attendanceConsole;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<AllowanceType>("daily_fixed");
  const [scope, setScope] = useState<"all" | "user">("all");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("regular");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const { toast, showToast, dismiss } = useAdminToast();

  function resetForm() {
    setType("daily_fixed");
    setScope("all");
    setTargetUserId("");
    setDate(defaultDate);
    setAmount("");
    setCategory("regular");
    setMemo("");
    setErr(null);
  }

  function errText(reason: string): string {
    switch (reason) {
      case "forbidden":
        return c.allowErrForbidden;
      case "finalized":
        return c.allowErrFinalized;
      case "amount_required":
        return c.allowErrAmount;
      case "target_invalid":
        return c.allowErrTarget;
      default:
        return c.allowErrGeneric;
    }
  }

  function submitCreate() {
    setErr(null);
    const amountYen = Number(amount);
    if (!Number.isFinite(amountYen) || amountYen <= 0) {
      setErr(c.allowErrAmount);
      return;
    }
    if (scope === "user" && !targetUserId) {
      setErr(c.allowErrTarget);
      return;
    }
    start(async () => {
      const res = await createAttendanceAllowance({
        targetDate: date,
        targetUserId: scope === "user" ? targetUserId : null,
        allowanceType: type,
        amountYen,
        category,
        memo: memo.trim() ? memo.trim() : null,
      });
      if (!res.ok) {
        setErr(errText(res.reason));
        return;
      }
      setFormOpen(false);
      resetForm();
      showToast(c.allowCreated);
      router.refresh();
    });
  }

  function submitCancel(reason: string) {
    if (!cancelId) return;
    const id = cancelId;
    start(async () => {
      const res = await cancelAttendanceAllowance({ id, reason: reason || null });
      if (!res.ok) {
        setErr(errText(res.reason));
        setCancelId(null);
        showToast(errText(res.reason));
        return;
      }
      setCancelId(null);
      showToast(c.allowCancelled);
      router.refresh();
    });
  }

  const amountUnit = type === "hourly_extra" ? c.allowAmountUnitHourly : c.allowAmountUnitDaily;

  return (
    <section className="card alw">
      <div className="alw__head">
        <div className="alw__headl">
          <span className="alw__badge">
            <Ic>
              <HandCoins />
            </Ic>
          </span>
          <div>
            <div className="alw__title">{c.allowSecTitle}</div>
            <div className="alw__sub">{c.allowSecDesc}</div>
          </div>
        </div>
        {formOpen ? (
          <button
            type="button"
            className="btn btn--subtle btn--sm"
            onClick={() => {
              setFormOpen(false);
              resetForm();
            }}
          >
            <Ic>
              <X />
            </Ic>
            {c.allowFormClose}
          </button>
        ) : (
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setFormOpen(true)}>
            <Ic>
              <Plus />
            </Ic>
            {c.allowAddBtn}
          </button>
        )}
      </div>

      {formOpen ? (
        <div className="alw__form">
          <div className="wreason">
            <div className="wfield__l">{c.allowFieldType}</div>
            <div className="fseg" role="tablist">
              <button
                type="button"
                className={type === "daily_fixed" ? "on" : ""}
                onClick={() => setType("daily_fixed")}
              >
                {c.allowTypeDailyFixed}
              </button>
              <button
                type="button"
                className={type === "hourly_extra" ? "on" : ""}
                onClick={() => setType("hourly_extra")}
              >
                {c.allowTypeHourlyExtra}
              </button>
            </div>
          </div>

          <div className="wreason">
            <div className="wfield__l">{c.allowFieldScope}</div>
            <div className="fseg" role="tablist">
              <button
                type="button"
                className={scope === "all" ? "on" : ""}
                onClick={() => setScope("all")}
              >
                {c.allowScopeAll}
              </button>
              <button
                type="button"
                className={scope === "user" ? "on" : ""}
                onClick={() => setScope("user")}
              >
                {c.allowScopeUser}
              </button>
            </div>
          </div>

          <div className="wreason">
            <div className="wfield__l">{c.allowFieldAmount}</div>
            <div className="winp">
              <span className="yen">{c.yenSym}</span>
              <input
                type="number"
                inputMode="numeric"
                step={10}
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="alw__unit">{amountUnit}</div>
          </div>

          <div className="wreason">
            <div className="wfield__l">{c.allowFieldDate}</div>
            <AdminDatePicker
              value={date}
              onChange={setDate}
              localeTag={localeTag}
              ariaLabel={c.allowFieldDate}
              labels={{
                prevMonth: c.datePickerPrevMonth,
                nextMonth: c.datePickerNextMonth,
                today: c.datePickerToday,
              }}
            />
          </div>

          <div className="wreason">
            <div className="wfield__l">{c.allowFieldCategory}</div>
            <AdminSelectField
              value={category}
              onChange={(v) => setCategory(v as Category)}
              options={CATEGORIES.map((cat) => ({ value: cat, label: categoryLabel(cat, c) }))}
              ariaLabel={c.allowFieldCategory}
            />
          </div>

          {scope === "user" ? (
            <div className="wreason">
              <div className="wfield__l">{c.allowFieldUser}</div>
              <AdminSelectField
                value={targetUserId}
                onChange={setTargetUserId}
                options={staff.map((s) => ({ value: s.userId, label: s.userName }))}
                placeholder={c.allowUserPlaceholder}
                ariaLabel={c.allowFieldUser}
              />
            </div>
          ) : null}

          <div className={scope === "user" ? "wreason alw__span2" : "wreason alw__span3"}>
            <div className="wfield__l">{c.allowFieldMemo}</div>
            <input
              type="text"
              placeholder={c.allowMemoPlaceholder}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div className="alw__note alw__spanfull">
            <Ic>
              <Info />
            </Ic>
            <span>{c.allowFormNote}</span>
          </div>

          {err ? (
            <div className="errbar is-warn alw__spanfull" style={{ margin: 0 }}>
              <span className="errbar__ic">
                <Ic>
                  <CircleAlert />
                </Ic>
              </span>
              <div>
                <div className="errbar__t">{err}</div>
              </div>
            </div>
          ) : null}

          <div className="alw__formfoot alw__spanfull">
            <button
              type="button"
              className="btn btn--subtle"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              disabled={pending}
            >
              {c.allowFormClose}
            </button>
            <button type="button" className="btn btn--pri" onClick={submitCreate} disabled={pending}>
              <Ic>
                <Plus />
              </Ic>
              {c.allowSave}
            </button>
          </div>
        </div>
      ) : null}

      {allowances.length === 0 ? (
        <div className="alw__empty">
          <span className="alw__emptyic">
            <Ic>
              <Sparkles />
            </Ic>
          </span>
          <span>{c.allowEmpty}</span>
        </div>
      ) : (
        <div className="alw__list">
          {allowances.map((a) => (
            <div
              key={a.id}
              className={`alw__row${a.status === "cancelled" ? " is-cancelled" : ""}`}
            >
              <div className="alw__rowdate">{a.targetDateLabel}</div>
              <div className="alw__rowmain">
                <div className="alw__rowtop">
                  <span className="alw__rowtarget">
                    {a.targetUserName ?? c.allowScopeAll}
                  </span>
                  <span className={`pill ${a.category === "special" ? "pill--warn" : "pill--info"}`}>
                    {categoryLabel(a.category, c)}
                  </span>
                  <span className="pill pill--muted">{typeLabel(a.allowanceType, c)}</span>
                  <span className="alw__rowamt">
                    {c.yenSym}
                    {formatAdminYen(a.amountYen, localeTag)}
                    {a.allowanceType === "hourly_extra" ? c.allowPerHourSuffix : ""}
                  </span>
                </div>
                {a.memo ? <div className="alw__rowsub">{a.memo}</div> : null}
              </div>
              <div className="alw__rowend">
                {a.status === "cancelled" ? (
                  <span className="pill pill--muted">{c.allowStatusCancelled}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--danger-ghost btn--sm"
                    onClick={() => setCancelId(a.id)}
                    disabled={pending}
                  >
                    <Ic>
                      <Ban />
                    </Ic>
                    {c.allowCancelBtn}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {cancelId ? (
        <AdminReasonModal
          title={c.allowCancelTitle}
          description={c.allowCancelDesc}
          placeholder={c.dialogReasonPlaceholder}
          confirmLabel={c.allowCancelBtn}
          cancelLabel={c.dialogCancel}
          pending={pending}
          danger
          onConfirm={submitCancel}
          onCancel={() => setCancelId(null)}
        />
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </section>
  );
}
