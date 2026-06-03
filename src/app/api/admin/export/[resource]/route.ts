import { NextResponse } from "next/server";
import { getAdminSessionForApi } from "@/lib/admin-session";
import {
  buildAdminExportCsv,
  isAdminExportResource,
} from "@/lib/export/admin-export";
import { csvDownloadResponse } from "@/lib/export/csv";

type RouteContext = {
  params: Promise<{ resource: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await getAdminSessionForApi();
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: auth.status });
  }

  const { resource } = await context.params;
  if (!isAdminExportResource(resource)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const result = await buildAdminExportCsv(auth.session, resource, url.searchParams);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return csvDownloadResponse(result.csv, result.filename);
}
