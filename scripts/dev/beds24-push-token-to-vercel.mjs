#!/usr/bin/env node
/**
 * `.env` 의 `BEDS24_API_REFRESH_TOKEN` 을 Vercel 프로덕션 환경변수로 밀어 넣는다.
 *
 * 값은 `vercel env add` 의 stdin 으로만 흐르고, stdout 에는 찍지 않는다.
 * 사전 조건: `vercel login` + `vercel link` 가 끝나 있어야 한다.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const KEY = "BEDS24_API_REFRESH_TOKEN";
const raw = readFileSync(".env", "utf8");
const m = raw.match(new RegExp(`^\\s*${KEY}\\s*=\\s*(.*)$`, "m"));
const value = m?.[1]?.trim().replace(/^["']|["']$/g, "");

if (!value) {
  console.error(`.env 에 ${KEY} 가 없습니다. 먼저 beds24-redeem-invite-code.mjs 를 실행하세요.`);
  process.exit(1);
}

// 기존 값은 먼저 제거해야 add 가 충돌하지 않는다.
spawnSync("npx", ["vercel", "env", "rm", KEY, "production", "--yes"], { stdio: "inherit" });

const add = spawnSync("npx", ["vercel", "env", "add", KEY, "production"], {
  input: value,
  stdio: ["pipe", "inherit", "inherit"],
});

if (add.status !== 0) {
  console.error("vercel env add 실패 — `npx vercel login` 후 다시 시도하세요.");
  process.exit(1);
}

console.log(`${KEY} 를 Vercel production 에 기록했습니다. 재배포해야 반영됩니다.`);
