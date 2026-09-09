"use client";

import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";
import { buildInviteName, generateInviteCode } from "@/lib/invite-code-gen";

export type InviteCreateOrganization = {
  id: string;
  name: string;
  /** 코드 앞자리를 만드는 데 쓴다 (slug 가 비면 이름). */
  codeSource: string;
};

export type InviteCreateFormCopy = {
  organization: string;
  role: string;
  autoHint: string;
  advanced: string;
  regenerate: string;
  autoName: string;
  nameLabel: string;
  codeLabel: string;
  expiresLabel: string;
  maxUsesLabel: string;
  submit: string;
  datePlaceholder: string;
  datePrev: string;
  dateNext: string;
  dateToday: string;
};

type InviteCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  organizations: InviteCreateOrganization[];
  roles: { value: string; label: string }[];
  /** 도쿄 기준 오늘 (YYYY-MM-DD) — 기본 이름의 날짜와 만료일 하한. */
  today: string;
  /** 서버에서 계산한 기본 만료일. 랜덤이 아니라 하이드레이션 문제는 없다. */
  defaultExpiresAt: string;
  /**
   * 서버에서 미리 만들어 둔 코드. 클라이언트 첫 렌더에서 새로 뽑으면 SSR 결과와 달라져
   * 하이드레이션이 깨지므로, 최초 값은 반드시 서버가 정한다. 이후 재생성은 사용자 조작(조직 변경 /
   * 다시 생성 버튼)에서만 일어난다.
   */
  defaultCode: string;
  defaultMaxUses: number;
  localeTag: string;
};

/**
 * 초대코드 생성 폼 (2026-09-09 재설계).
 *
 * 예전에는 6개 항목을 전부 손으로 채워야 했고, 그래서 조직에는 파트타임용 코드 하나만 만들어져
 * 있었다 — 사무직으로 초대하려면 매번 이름/코드/만료일/횟수를 새로 짜야 했기 때문이다. 이제
 * **조직과 역할만** 고르면 나머지는 자동으로 채워지고, 필요할 때만 "세부 설정"을 펼쳐 덮어쓴다.
 */
export function InviteCreateForm({
  action,
  organizations,
  roles,
  today,
  defaultExpiresAt,
  defaultCode,
  defaultMaxUses,
  localeTag,
  copy,
}: InviteCreateFormProps & { copy: InviteCreateFormCopy }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [code, setCode] = useState(defaultCode);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [maxUses, setMaxUses] = useState(String(defaultMaxUses));

  // 이름은 사용자가 직접 건드리기 전까지 역할 선택을 따라간다. 한 번이라도 입력하면 그 값을 지킨다.
  const [nameTouched, setNameTouched] = useState(false);
  const [name, setName] = useState("");

  const roleLabel = roles.find((option) => option.value === role)?.label ?? "";
  const autoName = buildInviteName(copy.autoName, roleLabel, today);
  const nameValue = nameTouched ? name : autoName;

  function regenerateCode(nextOrganizationId = organizationId) {
    const organization = organizations.find((item) => item.id === nextOrganizationId);
    setCode(generateInviteCode(organization?.codeSource ?? organization?.name ?? ""));
  }

  function handleOrganizationChange(nextId: string) {
    setOrganizationId(nextId);
    regenerateCode(nextId);
  }

  return (
    <form
      action={action}
      style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <AdmDropdown
        options={organizations.map((organization) => ({
          value: organization.id,
          label: organization.name,
        }))}
        value={organizationId}
        onChange={handleOrganizationChange}
        placeholder={copy.organization}
        ariaLabel={copy.organization}
      />

      <input type="hidden" name="defaultRole" value={role} />
      <AdmDropdown
        options={roles}
        value={role}
        onChange={setRole}
        placeholder={copy.role}
        ariaLabel={copy.role}
      />

      <p className="chint">{copy.autoHint}</p>

      <button
        type="button"
        className={`invf__toggle${advancedOpen ? " is-open" : ""}`}
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        <ChevronDown className="size-4" aria-hidden="true" />
        {copy.advanced}
      </button>

      {/*
        닫혀 있을 때도 값은 hidden 으로 실어 보낸다. 자동 생성값이 서버로 가지 않으면 서버가 다시
        뽑게 되는데, 그러면 화면에 미리 보여준 코드와 실제로 만들어진 코드가 달라진다.
      */}
      {advancedOpen ? (
        <div className="invf__adv">
          <label className="invf__row">
            <span className="invf__label">{copy.nameLabel}</span>
            <input
              className="ui-input"
              name="name"
              value={nameValue}
              onChange={(event) => {
                setNameTouched(true);
                setName(event.target.value);
              }}
              placeholder={autoName}
            />
          </label>

          <label className="invf__row">
            <span className="invf__label">{copy.codeLabel}</span>
            <div className="invf__code">
              <input
                className="ui-input"
                name="code"
                value={code}
                spellCheck={false}
                onChange={(event) => setCode(event.target.value)}
              />
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm invf__regen"
                onClick={() => regenerateCode()}
                title={copy.regenerate}
                aria-label={copy.regenerate}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </button>
            </div>
          </label>

          <label className="invf__row">
            <span className="invf__label">{copy.expiresLabel}</span>
            <AdminDatePicker
              value={expiresAt}
              onChange={setExpiresAt}
              min={today}
              localeTag={localeTag}
              ariaLabel={copy.expiresLabel}
              placeholder={copy.datePlaceholder}
              labels={{
                prevMonth: copy.datePrev,
                nextMonth: copy.dateNext,
                today: copy.dateToday,
              }}
            />
          </label>

          <label className="invf__row">
            <span className="invf__label">{copy.maxUsesLabel}</span>
            <input
              className="ui-input"
              min={1}
              type="number"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {!advancedOpen && <input type="hidden" name="name" value={nameValue} />}
      {!advancedOpen && <input type="hidden" name="code" value={code} />}
      <input type="hidden" name="expiresAt" value={expiresAt} />
      <input type="hidden" name="maxUses" value={maxUses} />

      <button
        className="ui-btn ui-btn--primary fw-black"
        disabled={organizations.length === 0}
        type="submit"
      >
        {copy.submit}
      </button>
    </form>
  );
}
