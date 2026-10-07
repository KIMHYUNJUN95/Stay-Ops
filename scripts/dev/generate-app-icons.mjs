/**
 * iOS · Android 앱 아이콘 · 스플래시 생성 (계획 B1-2, docs/planning/17-app-release-plan.md).
 *
 * PWA 아이콘(`generate-pwa-icons.mjs`)과 같은 마크 — 남색 그라데이션 + 아이보리 세리프 이탤릭 "S" — 를 SVG 로 그려서
 * 네이티브 프로젝트에 필요한 크기로 모두 뽑는다. 정식 로고가 생기면 `mark()` 만 바꾸고 다시 돌린다.
 *
 *   node scripts/dev/generate-app-icons.mjs
 *
 * 만드는 것:
 * - iOS   `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024, 알파 없음 — App Store 규칙)
 * - iOS   `Splash.imageset/splash-2732x2732*.png` (아이보리 바탕 + 가운데 아이콘. LaunchScreen 이 aspectFill 로 잘라 씀)
 * - Android `mipmap-*` ic_launcher · ic_launcher_round · ic_launcher_foreground · ic_launcher_background
 *   (적응형 아이콘: 배경 = 그라데이션, 전경 = 66/108 안전 영역 안의 "S")
 * - Android `drawable*` splash.png (Android 11 이하 시작 화면. 12+ 는 styles.xml 의 windowSplashScreen* 가 쓰인다)
 * - 스토어 등록용 원본 `store-assets/icon-1024.png`, Google Play 용 `store-assets/play-icon-512.png`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const NAVY_LIGHT = "#36568f";
const NAVY_DARK = "#1a2c4f";
const IVORY = "#f7f4ee";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** 남색 바탕 + S. radius 0 = 꽉 찬 정사각형(OS 가 직접 마스크). glyph = 한 변 대비 글자 크기. */
function mark(size, { radius = 0, glyph = 0.62, background = true, circle = false } = {}) {
  const shape = circle
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY_LIGHT}"/>
      <stop offset="1" stop-color="${NAVY_DARK}"/>
    </linearGradient>
  </defs>
  ${background ? shape : ""}
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
    font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif" font-style="italic"
    font-weight="700" font-size="${Math.round(size * glyph)}" fill="${IVORY}">S</text>
</svg>`;
}

/** 아이보리 바탕 가운데에 둥근 아이콘을 얹은 시작 화면. */
async function splash(width, height, iconRatio) {
  const icon = Math.round(Math.min(width, height) * iconRatio);
  const iconPng = await sharp(Buffer.from(mark(icon, { radius: Math.round(icon * 0.22) }))).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: IVORY } })
    .composite([{ input: iconPng, left: Math.round((width - icon) / 2), top: Math.round((height - icon) / 2) }])
    .png()
    .toBuffer();
}

async function out(rel, buf) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  console.log("wrote", rel);
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// ── iOS ──────────────────────────────────────────────────────────────
// App Store 는 알파 채널이 있는 아이콘을 거절한다 → flatten.
const ios1024 = await sharp(Buffer.from(mark(1024))).flatten({ background: NAVY_DARK }).png().toBuffer();
await out("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", ios1024);
const iosSplash = await splash(2732, 2732, 0.16);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await out(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, iosSplash);
}

// ── Android ──────────────────────────────────────────────────────────
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const res = "android/app/src/main/res";
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  await out(`${res}/mipmap-${d}/ic_launcher.png`, await png(mark(legacy, { radius: Math.round(legacy * 0.22) })));
  await out(`${res}/mipmap-${d}/ic_launcher_round.png`, await png(mark(legacy, { circle: true, glyph: 0.56 })));
  // 적응형 아이콘: 108dp 중 가운데 72dp 만 늘 보인다(나머지는 마스크) → 글자는 그 안에.
  await out(`${res}/mipmap-${d}/ic_launcher_foreground.png`, await png(mark(adaptive, { background: false, glyph: 0.4 })));
  await out(`${res}/mipmap-${d}/ic_launcher_background.png`, await png(mark(adaptive, { glyph: 0 }).replace(/<text[\s\S]*?<\/text>/, "")));
}

const splashSizes = {
  "drawable": [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(splashSizes)) {
  await out(`${res}/${dir}/splash.png`, await splash(w, h, 0.28));
}

// ── 스토어 등록 자료 원본 ───────────────────────────────────────────────
await out("store-assets/icon-1024.png", ios1024);
await out("store-assets/play-icon-512.png", await sharp(ios1024).resize(512, 512).png().toBuffer());

console.log("done");
