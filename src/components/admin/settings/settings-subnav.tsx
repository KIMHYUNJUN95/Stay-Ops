import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, QrCode } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

// 설정 섹션의 탭 바. 근태 콘솔의 `AttendanceSubnav` 와 같은 역할이고, 시각 표현은 공용
// `.lvsubtabs` / `.lvsubtab` 프리미티브를 그대로 쓴다 — 설정만의 탭 스타일을 새로 만들지 않는다.
//
// 초대코드는 2026-07-13 에 `/admin/users/invites` 로 옮겨져 여기 탭이 아니다.
// 조직 설정은 플랫폼 개발자 전용이라 권한이 없으면 탭 자체를 노출하지 않는다.

export type SettingsTab = "organization" | "attendance";

type Settings = Dictionary["admin"]["settings"];

const TABS: { id: SettingsTab; href: string; icon: ReactNode; labelKey: keyof Settings }[] = [
  { id: "organization", href: "/admin/settings/organization", icon: <Building2 />, labelKey: "organizationTitle" },
  { id: "attendance", href: "/admin/settings/attendance", icon: <QrCode />, labelKey: "attendanceTitle" },
];

export function SettingsSubnav({
  active,
  settings,
  showOrganization,
}: {
  active: SettingsTab;
  settings: Settings;
  /** 조직 설정 탭 노출 여부 — 플랫폼 개발자만 true. */
  showOrganization: boolean;
}) {
  const tabs = TABS.filter((tab) => tab.id !== "organization" || showOrganization);
  if (tabs.length <= 1) return null;

  return (
    <nav className="lvsubtabs">
      {tabs.map((tab) => (
        <Link
          className={`lvsubtab${tab.id === active ? " on" : ""}`}
          href={tab.href}
          key={tab.id}
        >
          <span className="ic">{tab.icon}</span>
          {String(settings[tab.labelKey])}
        </Link>
      ))}
    </nav>
  );
}
