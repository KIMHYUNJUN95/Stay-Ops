/**
 * iOS · Android 앱 아이콘 · 시작 화면 생성 (계획 B1-2, docs/planning/17-app-release-plan.md).
 *
 * **원본 = 실제 제품 로고 `public/icons/icon-512.png`(회색 종이 질감 위 열린 문, 2026-06-23 교체).** PWA · 오프라인 화면과 같은 그림이다.
 * 2026-10-07 첫 버전은 옛 `generate-pwa-icons.mjs` 의 남색 "S" 임시 마크로 만들어 브랜드가 틀렸다 — 2026-10-08 실제 로고로 다시 만든다.
 *
 *   node scripts/dev/generate-app-icons.mjs [원본.png]
 *
 * 원본이 512px 라 App Store 1024 아이콘은 2배로 늘린 것이다(약간 흐림). **1024px 이상 원본이 생기면 인자로 넘겨 다시 돌린다.**
 *
 * 만드는 것:
 * - iOS   `AppIcon.appiconset/AppIcon-512@2x.png` (1024, 알파 없음 — App Store 규칙. 모서리는 iOS 가 자기 곡률로 잘라낸다)
 * - iOS   `Splash.imageset/splash-2732x2732*.png` (아이보리 바탕 + 가운데 로고, LaunchScreen 이 aspectFill)
 * - Android `mipmap-*` ic_launcher(둥근 네모) · ic_launcher_round(원) · 적응형 ic_launcher_foreground(로고) + ic_launcher_background(회색)
 * - Android `drawable-nodpi/splash_icon.png` — Android 12+ 시작 화면 아이콘(960px, 240dp 로 그려지므로 크게)
 * - `capacitor-www/icon.png` — 앱 연결 실패 화면 로고
 * - 스토어 원본 `store-assets/icon-1024.png` · `play-icon-512.png`
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.resolve(root, process.argv[2] ?? "public/icons/icon-512.png");

const IVORY = "#f7f4ee";
// 로고 가장자리 회색(종이 질감의 어두운 테두리 쪽). 적응형 아이콘 배경 · 알파를 없앨 때 바탕으로 쓴다.
const LOGO_EDGE = "#8f8d8d";

async function out(rel, buf) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  console.log("wrote", rel);
}

/**
 * 깨끗한 원본: 512 내보내기의 모서리에 반투명 검정 테두리가 남아 있어(모서리 픽셀 rgba(0,0,0,221)) 둥근 네모 마스크로 한 번 더 깎는다.
 * 결과 = 투명 바탕 위 둥근 네모 로고(1024 기준).
 */
async function cleanMaster(size = 1024) {
  // 바깥 3% 를 잘라낸다 — 512 원본 테두리에 어두운 테 · 검은 잔여가 둘러 있다.
  const over = Math.round(size * 1.06);
  const cut = Math.round((over - size) / 2);
  const base = await sharp(SOURCE)
    .resize(over, over, { kernel: "lanczos3" })
    .extract({ left: cut, top: cut, width: size, height: size })
    .ensureAlpha()
    .png()
    .toBuffer();
  const r = Math.round(size * 0.185); // 원본 곡률(약 80/512)보다 살짝 크게 — 검은 테두리를 남기지 않는다
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(base).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** 정사각 캔버스(투명 또는 단색) 가운데에 로고를 scale 비율로 얹는다. */
async function onCanvas(master, size, scale, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  const inner = Math.round(size * scale);
  let logo = await sharp(master).resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer();
  if (inner > size) {
    // 캔버스보다 크게 → 가운데만 잘라 쓴다(원형 아이콘에서 로고 모서리 곡선이 보이지 않게).
    const cut = Math.floor((inner - size) / 2);
    logo = await sharp(logo).extract({ left: cut, top: cut, width: size, height: size }).png().toBuffer();
  }
  const off = Math.max(0, Math.round((size - inner) / 2));
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, left: off, top: off }])
    .png()
    .toBuffer();
}

/** 원 마스크. */
async function circle(buf, size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(buf).resize(size, size).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const master = await cleanMaster(1024);

// ── iOS ──────────────────────────────────────────────────────────────
// 알파 없는 꽉 찬 정사각형. iOS 마스크 곡률(약 22%)이 로고 곡률(약 18.5%)보다 커서 바탕색 모서리는 잘려 보이지 않는다.
const ios1024 = await sharp(master).flatten({ background: LOGO_EDGE }).png().toBuffer();
await out("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", ios1024);
const iosSplash = await onCanvas(master, 2732, 0.16, IVORY);
const iosSplashRgb = await sharp(iosSplash).flatten({ background: IVORY }).png().toBuffer();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await out(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, iosSplashRgb);
}

// ── Android ──────────────────────────────────────────────────────────
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const res = "android/app/src/main/res";
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  // 옛 런처(적응형 이전): 둥근 네모 그대로 · 원형.
  await out(`${res}/mipmap-${d}/ic_launcher.png`, await onCanvas(master, legacy, 0.92));
  await out(`${res}/mipmap-${d}/ic_launcher_round.png`, await circle(await onCanvas(master, legacy, 1.12, LOGO_EDGE), legacy));
  // 적응형: 108dp 중 가운데 72dp 원만 보인다. 로고를 68%(73dp)로 얹으면 보이는 72dp 원이 로고 안쪽에 들어가 테두리 · 모서리는 안 보이고
  // 문 전체가 여백을 두고 보인다(원형 옛 아이콘과 같은 구도). 바깥은 회색 배경 층.
  await out(`${res}/mipmap-${d}/ic_launcher_foreground.png`, await onCanvas(master, adaptive, 0.68));
  await out(
    `${res}/mipmap-${d}/ic_launcher_background.png`,
    await sharp({ create: { width: adaptive, height: adaptive, channels: 3, background: LOGO_EDGE } }).png().toBuffer(),
  );
}
// Android 12+ 시작 화면 아이콘(아이콘 배경색 = 로고 회색, styles.xml). 240dp 중 가운데 160dp 원만 보인다 — 적응형과 같은 비율.
await out(`${res}/drawable-nodpi/splash_icon.png`, await onCanvas(master, 960, 0.68));

// 시작 테마는 더 이상 비트맵을 쓰지 않는다(N11) — 예전 Capacitor 기본 splash.png 들은 지운다.
for (const dir of ["drawable", ...["port", "land"].flatMap((o) => Object.keys(densities).map((d) => `drawable-${o}-${d}`))]) {
  await rm(path.join(root, res, dir, "splash.png"), { force: true });
}

// ── 연결 실패 화면 · 스토어 원본 ────────────────────────────────────────
await out("capacitor-www/icon.png", await sharp(master).resize(192, 192).png().toBuffer());
await out("store-assets/icon-1024.png", ios1024);
await out("store-assets/play-icon-512.png", await sharp(ios1024).resize(512, 512).png().toBuffer());

console.log("done");
