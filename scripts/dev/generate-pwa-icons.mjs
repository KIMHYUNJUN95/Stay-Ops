/**
 * One-off: generate StayOps PWA / home-screen icons from an inline SVG (no binary asset needed).
 *
 * Brand mark: deep ink-navy gradient squircle + ivory serif italic "S" (the "Stay Ops" wordmark is
 * serif italic). This is a clean placeholder mark; swap the SVG for a real logo later and re-run.
 *
 *   node scripts/dev/generate-pwa-icons.mjs
 *
 * Emits into public/icons/: icon-192.png, icon-512.png (purpose "any", rounded),
 * maskable-512.png (full-bleed for Android adaptive), apple-touch-icon.png (180, full square).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const NAVY_LIGHT = "#36568f"; // hsl(223 50% 42%)
const NAVY_DARK = "#1a2c4f"; // hsl(223 54% 22%)
const IVORY = "#f7f4ee";

function svg(size, { maskable = false } = {}) {
  const radius = maskable ? 0 : Math.round(size * 0.22); // OS masks adaptive icons itself
  // Serif italic "S", slightly smaller on maskable so it sits inside the adaptive safe zone.
  const fontSize = Math.round(size * (maskable ? 0.52 : 0.62));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY_LIGHT}"/>
      <stop offset="1" stop-color="${NAVY_DARK}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
    font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif" font-style="italic"
    font-weight="700" font-size="${fontSize}" fill="${IVORY}">S</text>
</svg>`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../public/icons");

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: true },
];

await mkdir(outDir, { recursive: true });
for (const t of targets) {
  const buf = Buffer.from(svg(t.size, { maskable: t.maskable }));
  const png = await sharp(buf).png().toBuffer();
  await writeFile(path.join(outDir, t.name), png);
  console.log("wrote", path.relative(path.resolve(here, "../.."), path.join(outDir, t.name)), `${t.size}px`);
}
console.log("done");
