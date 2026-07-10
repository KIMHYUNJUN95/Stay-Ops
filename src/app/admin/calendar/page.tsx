import { AdminReservationConsole } from "@/components/admin/calendar/admin-reservation-console";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  buildMonthLabel,
  getAdminCalendarDashboardData,
} from "@/lib/admin-calendar-dashboard";
import { requireAdminSession } from "@/lib/admin-session";

type PageProps = {
  searchParams: Promise<{
    month?: string;
    property?: string;
  }>;
};

function buildMobileCalendarHref(month: string, property: string | null) {
  const params = new URLSearchParams({ month });
  if (property) {
    params.set("property", property);
  }
  return `/mobile/calendar?${params.toString()}`;
}

export default async function AdminCalendarPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([requireAdminSession(), searchParams]);
  const data = await getAdminCalendarDashboardData(session, params);

  return (
    <AdminShell
      activeItem="calendar"
      mobileHref={buildMobileCalendarHref(data.selectedMonth, data.selectedProperty)}
      title={buildMonthLabel(data.selectedMonth, data.locale)}
    >
      <AdminReservationConsole
        beds24SyncPaused={data.beds24SyncPaused}
        blockedProperties={[]}
        buildingInfos={data.buildingInfos}
        currentMonth={data.currentMonth}
        dates={data.dates}
        initialLocale={data.locale}
        isOutOfWindow={data.isOutOfWindow}
        nextMonth={data.nextMonth}
        prevMonth={data.prevMonth}
        propertyOptions={data.propertyOptions}
        reservationNotes={data.reservationNotes}
        reservations={data.reservations}
        roomRows={data.roomRows}
        selectedMonth={data.selectedMonth}
        selectedProperty={data.selectedProperty}
        today={data.today}
      />
    </AdminShell>
  );
}
