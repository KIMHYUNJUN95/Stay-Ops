import { redirect } from "next/navigation";

// Legacy Todoist admin route. The desktop Todoist console now lives at /admin/tasks
// (see docs/product/28-admin-todoist-console.md). Keep this path as a redirect so old links resolve.
export default function AdminRecurringWorkPage() {
  redirect("/admin/tasks");
}
