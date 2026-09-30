"use client";

import { Check, X } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { OpsNavLink, useOpsNavigate } from "@/components/admin/ops/ops-nav";

/**
 * 판매 캘린더의 건물 탭 — **여러 건물을 함께 볼 수 있다**(2026-09-30).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「건물 여러 곳 함께 보기」
 *
 * - 탭을 그냥 누르면 **그 건물만**(예전과 같다). 「전체」는 선택을 비운다.
 * - 탭 왼쪽의 체크 동그라미(올리거나 포커스하면 나타난다) 또는 **Ctrl/⌘/Shift + 클릭**은 그 건물을 지금
 *   선택에 넣거나 뺀다. 하나 남으면 단일 선택, 다 빼면 전체.
 * - 둘 이상 고르면 고른 탭마다 체크가 늘 보이고, 탭 줄 뒤에 「건물 N곳 ×」 요약이 붙는다.
 *
 * 주소(단일/토글/전체)는 전부 서버가 만들어 넘긴다 — URL 규칙(`property` 반복, 탭 순서)을 한곳
 * (`ops-calendar-properties.ts`)에서만 쥔다. 여기는 누름을 이동으로 바꾸기만 한다.
 */
export type OpsPropertyTab = {
  name: string;
  /** 그냥 누름 — 이 건물만. */
  href: string;
  /** 체크 · Ctrl/⌘/Shift + 클릭 — 지금 선택에 넣거나 뺀 주소. */
  toggleHref: string;
  /** 지금 선택에 들어 있는가. */
  selected: boolean;
};

export type OpsPropertyTabsCopy = {
  allProperties: string;
  propertyGroupLabel: string;
  propertyTabHint: string;
  propertyAdd: string;
  propertyRemove: string;
  propertySelectedCount: string;
  propertyClear: string;
};

export function OpsPropertyTabs({
  allHref,
  copy,
  tabs,
}: {
  /** 「전체」 — 선택을 비운 주소. 요약 칩의 ×도 여기로 간다. */
  allHref: string;
  copy: OpsPropertyTabsCopy;
  tabs: OpsPropertyTab[];
}) {
  const { navigate, pending } = useOpsNavigate();
  /** 체크 · 수정키 클릭으로 이동 중인 탭 — 그 탭에 로딩 점을 띄운다. */
  const [pendingName, setPendingName] = useState<string | null>(null);
  const selectedCount = tabs.filter((tab) => tab.selected).length;
  const multi = selectedCount >= 2;

  const toggle = (tab: OpsPropertyTab) => {
    setPendingName(tab.name);
    navigate(tab.toggleHref);
  };

  const onLabelClick = (tab: OpsPropertyTab) => (event: MouseEvent<HTMLAnchorElement>) => {
    // 가운데 버튼은 브라우저에 맡긴다(새 탭). Ctrl/⌘/Shift + 왼쪽 클릭만 「함께 보기」로 바꾼다.
    if (event.button !== 0) return;
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) return;
    event.preventDefault();
    toggle(tab);
  };

  return (
    <>
      <div aria-label={copy.propertyGroupLabel} className="ops__props" role="group">
        <OpsNavLink
          aria-current={selectedCount === 0 ? "page" : undefined}
          className={`ops__prop${selectedCount === 0 ? " on" : ""}`}
          href={allHref}
        >
          {copy.allProperties}
        </OpsNavLink>
        {tabs.map((tab) => {
          const label = (tab.selected ? copy.propertyRemove : copy.propertyAdd).replace("{name}", tab.name);
          return (
            <span
              className={`ops__ptab${tab.selected ? " on" : ""}${multi && tab.selected ? " multi" : ""}`}
              key={tab.name}
            >
              <button
                aria-label={label}
                aria-pressed={tab.selected}
                className="ops__pck"
                onClick={() => toggle(tab)}
                title={label}
                type="button"
              >
                <Check aria-hidden="true" className="ops__pckic" strokeWidth={3.2} />
              </button>
              <OpsNavLink
                aria-current={tab.selected && selectedCount === 1 ? "page" : undefined}
                className="ops__prop"
                href={tab.href}
                onClick={onLabelClick(tab)}
                title={copy.propertyTabHint}
              >
                {tab.name}
                {pending && pendingName === tab.name && <span aria-hidden="true" className="ops__navspin" />}
              </OpsNavLink>
            </span>
          );
        })}
      </div>
      {multi && (
        <span className="ops__psum">
          <span aria-live="polite" className="ops__psumt">
            {copy.propertySelectedCount.replace("{count}", String(selectedCount))}
          </span>
          <OpsNavLink aria-label={copy.propertyClear} className="ops__psumx" href={allHref} title={copy.propertyClear}>
            <X aria-hidden="true" strokeWidth={2.6} />
          </OpsNavLink>
        </span>
      )}
    </>
  );
}
