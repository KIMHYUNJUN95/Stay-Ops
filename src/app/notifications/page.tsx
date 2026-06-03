import { redirect } from "next/navigation";
import { getCurrentAppSession } from "@/lib/session";

export default async function NotificationsRedirectPage() {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect("/auth/login?next=/mobile/notifications");
  }
  redirect("/mobile/notifications");
}
