import { redirect } from "next/navigation";
import { RoomLinksConsole } from "@/components/admin/ops/room-links-console";
import { AdminShell } from "@/components/shell/admin-shell";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";
import { canAccessRoomLinks } from "@/lib/ops-admin";
import { getRoomLinksPageData } from "@/lib/room-links";

/**
 * 룸 링크 — 객실별 Airbnb · Booking.com 리스팅 링크 (2026-10-02).
 *
 * 도메인 계약: docs/product/35-room-links.md
 *
 * 사이드바 맨 아래 「운영 관리자」 묶음에 있지만 **판매 캘린더와 따로 준다**(`room_links.access`). 메뉴 숨김은 편의다 —
 * 주소를 직접 쳐서 들어와도 여기서 막는다. 권한이 없으면 대시보드로 보낸다(운영 관리자 화면과 같은 방식).
 */
export const dynamic = "force-dynamic";

export default async function RoomLinksPage() {
  const session = await requireAdminPageSession({ nextPath: "/admin/ops/room-links" });
  if (!canAccessRoomLinks(session)) redirect("/admin");
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const data = await getRoomLinksPageData(session, locale);

  return (
    <AdminShell activeItem="ops-room-links" title={dictionary.roomLinks.title}>
      <RoomLinksConsole copy={dictionary.roomLinks} data={data} />
    </AdminShell>
  );
}
