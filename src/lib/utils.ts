import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Split an array into fixed-size chunks. Used to keep PostgREST `.in(...)` filters below the
 * request URL-length limit — a single `.in()` with hundreds of UUIDs builds a multi-KB query
 * string that the Supabase gateway rejects (surfacing as a low-level `fetch failed`). Callers
 * run one query per chunk and merge the results.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
