const UTF8_BOM = "\uFEFF";

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return UTF8_BOM + lines.join("\r\n");
}

/** ASCII-safe fallback for legacy clients (RFC 2616 token). */
export function toAsciiContentDispositionFilename(filename: string): string {
  const trimmed = filename.trim() || "download.csv";
  const ascii = trimmed
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/\s+/g, "_");
  return ascii.length > 0 ? ascii : "download.csv";
}

/** RFC 5987 `filename*` value (UTF-8 percent-encoded, without scheme prefix). */
export function encodeContentDispositionFilenameStar(filename: string): string {
  return encodeURIComponent(filename.trim() || "download.csv").replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildContentDispositionHeader(filename: string): string {
  const ascii = toAsciiContentDispositionFilename(filename);
  const utf8 = encodeContentDispositionFilenameStar(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export function csvDownloadResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildContentDispositionHeader(filename),
      "Cache-Control": "no-store",
    },
  });
}
