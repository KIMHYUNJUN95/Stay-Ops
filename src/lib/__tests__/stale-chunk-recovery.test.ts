import { describe, expect, it, vi } from "vitest";
import { FRESH_PARAM, STALE_CHUNK_RECOVERY_SCRIPT } from "../stale-chunk-recovery";

type Listener = (e: { target: unknown }) => void;

function run(href: string, stored: string | null = null) {
  let listener: Listener | null = null;
  const replaced: string[] = [];
  const store = new Map<string, string>(stored ? [["foldy:stale-chunk-reload", stored]] : []);
  const location = { href, replace: (url: string) => replaced.push(url) };
  const history = { state: null, replaceState: vi.fn() };
  const window = { addEventListener: (_: string, fn: Listener) => (listener = fn) };
  const sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  new Function("location", "history", "window", "sessionStorage", STALE_CHUNK_RECOVERY_SCRIPT)(location, history, window, sessionStorage);
  return { fire: (target: unknown) => listener?.({ target }), replaced, history };
}

describe("stale chunk recovery", () => {
  it("reopens with a cache-busting param when a Next chunk fails to load", () => {
    const r = run("https://x.test/mobile?tab=1");
    r.fire({ tagName: "SCRIPT", src: "https://x.test/_next/static/chunks/old.js" });
    expect(r.replaced).toHaveLength(1);
    expect(new URL(r.replaced[0]).searchParams.has(FRESH_PARAM)).toBe(true);
    expect(new URL(r.replaced[0]).searchParams.get("tab")).toBe("1");
  });

  it("ignores other resources", () => {
    const r = run("https://x.test/mobile");
    r.fire({ tagName: "IMG", src: "https://x.test/_next/static/a.png" });
    r.fire({ tagName: "SCRIPT", src: "https://cdn.test/other.js" });
    expect(r.replaced).toHaveLength(0);
  });

  it("does not loop within the guard window", () => {
    const r = run("https://x.test/mobile", String(Date.now()));
    r.fire({ tagName: "SCRIPT", src: "https://x.test/_next/static/chunks/old.js" });
    expect(r.replaced).toHaveLength(0);
  });

  it("strips the param before the app reads the URL", () => {
    const r = run(`https://x.test/mobile?a=1&${FRESH_PARAM}=123#h`);
    expect(r.history.replaceState).toHaveBeenCalledWith(null, "", "/mobile?a=1#h");
  });
});
