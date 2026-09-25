#!/usr/bin/env node
/**
 * Beds24 invite code → long-life refresh token 교환 + `.env` 주입.
 *
 * Beds24 의 invite code 는 **1회용**이고 수 분 안에 만료된다. 이 스크립트는
 *   GET /authentication/setup   (header: code, deviceName)
 * 로 교환한 refreshToken 을 `.env` 의 `BEDS24_API_REFRESH_TOKEN` 에 바로 써 넣는다.
 *
 * 토큰·리프레시토큰은 **절대 stdout 에 찍지 않는다** (CLAUDE.md — Secrets).
 * 확인용으로는 발급된 scope 목록과 길이만 출력한다.
 *
 * 사용법 — 둘 중 하나. 어느 쪽이든 코드가 셸 히스토리에 남지 않는다:
 *   (a) 파일로 건네기 (에이전트가 대신 실행할 때)
 *       프로젝트 루트에 `.beds24-invite-code` 파일을 만들어 코드만 한 줄 적는다.
 *       node scripts/dev/beds24-redeem-invite-code.mjs
 *       → 교환이 끝나면 파일은 자동으로 지워진다.
 *   (b) 직접 입력
 *       node scripts/dev/beds24-redeem-invite-code.mjs
 *       → 파일이 없으면 프롬프트가 뜬다.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const ENV_PATH = ".env";
const KEY = "BEDS24_API_REFRESH_TOKEN";

function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const map = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) map[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { raw, map };
}

function writeEnvKey(raw, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  return pattern.test(raw) ? raw.replace(pattern, line) : `${raw.replace(/\n*$/, "\n")}${line}\n`;
}

const { raw, map } = readEnv();
const base = (map.BEDS24_API_BASE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("BEDS24_API_BASE_URL 이 .env 에 없습니다.");
  process.exit(1);
}

const CODE_FILE = ".beds24-invite-code";
let code = "";
let deviceName = "stay-ops";

if (existsSync(CODE_FILE)) {
  code = readFileSync(CODE_FILE, "utf8").trim();
  console.log(`${CODE_FILE} 에서 invite code 를 읽었습니다.`);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  code = (await rl.question("Beds24 invite code: ")).trim();
  deviceName = (await rl.question("device name [stay-ops]: ")).trim() || "stay-ops";
  rl.close();
}

if (!code) {
  console.error("invite code 가 비어 있습니다.");
  process.exit(1);
}

const setup = await fetch(`${base}/authentication/setup`, {
  headers: { accept: "application/json", code, deviceName },
  cache: "no-store",
});
const setupJson = await setup.json().catch(() => null);

if (!setup.ok || !setupJson?.refreshToken) {
  console.error(`교환 실패 (HTTP ${setup.status})`);
  console.error(`  code=${setupJson?.code ?? "-"} error=${setupJson?.error ?? "-"}`);
  console.error("  invite code 는 1회용이고 곧 만료됩니다 — Beds24 에서 새로 발급하세요.");
  process.exit(1);
}

const refreshToken = String(setupJson.refreshToken);
if (existsSync(CODE_FILE)) rmSync(CODE_FILE); // 1회용 — 교환됐으면 즉시 폐기

// 교환 직후 실제로 access token 이 발급되는지, 스코프가 기대대로인지 확인한다.
const mint = await fetch(`${base}/authentication/token`, {
  headers: { accept: "application/json", refreshToken },
  cache: "no-store",
});
const mintJson = await mint.json().catch(() => null);
if (!mint.ok || !mintJson?.token) {
  console.error(`발급 검증 실패 (HTTP ${mint.status}) — .env 를 건드리지 않았습니다.`);
  process.exit(1);
}

const details = await fetch(`${base}/authentication/details`, {
  headers: { accept: "application/json", token: String(mintJson.token) },
  cache: "no-store",
});
const detailsJson = await details.json().catch(() => null);

writeFileSync(ENV_PATH, writeEnvKey(raw, KEY, refreshToken), "utf8");

console.log("교환 성공 — .env 에 기록했습니다.");
console.log(`  refreshToken 길이: ${refreshToken.length}`);
console.log(`  access token expiresIn: ${mintJson.expiresIn ?? "-"}초`);
console.log(`  scopes: ${JSON.stringify(detailsJson?.scopes ?? detailsJson ?? null)}`);
console.log("");
console.log("다음: Vercel 프로덕션에도 같은 값을 넣어야 합니다.");
console.log(`  node scripts/dev/beds24-push-token-to-vercel.mjs`);
