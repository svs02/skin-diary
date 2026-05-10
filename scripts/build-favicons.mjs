// Build raster icon set + multi-size favicon.ico + OG image from the canonical
// "Half" symbol and Skin Diary lockup.
//
// Source of truth: viewBox 0 0 64 64, circle cx=32 cy=32 r=22, half path filled.
// Brand color: #2C6ECB.
//
// Why per-size SVGs instead of one master SVG?
// At 16px and 32px, a stroke-width of 2.4 (from a 64-unit viewBox) becomes
// sub-pixel after downscale and visually disappears. We pre-thicken the
// stroke for those sizes so the outline survives rasterization.
//
// Run: node scripts/build-favicons.mjs
//   Outputs:
//     public/favicon-16.png, favicon-32.png
//     public/apple-touch-icon.png
//     public/icon-192.png, icon-512.png, icon-maskable-512.png
//     public/favicon.ico                 (multi-size: 16/32/48)
//     public/og/skin-diary-og.png        (1200x630, lockup centered)

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// sharp is CJS, hoisted under pnpm — resolve its real path with require.
const require = createRequire(import.meta.url);
const sharp = require(
  resolve(__dirname, '..', 'node_modules', '.pnpm', 'sharp@0.34.5', 'node_modules', 'sharp'),
);
// png-to-ico ships as native ESM with `export default`. Use dynamic import and
// take .default. Pass an array of PNG buffers — each is decoded as-is into a
// frame of the resulting .ico (no internal resize), giving us a true 16/32/48
// multi-size icon.
const pngToIco = (
  await import(
    /* @vite-ignore */ resolve(
      __dirname,
      '..',
      'node_modules',
      '.pnpm',
      'png-to-ico@3.0.1',
      'node_modules',
      'png-to-ico',
      'index.js',
    )
  )
).default;
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const OG_DIR = resolve(PUBLIC_DIR, 'og');

const COLOR = '#2C6ECB';
const WORDMARK_COLOR = '#1F4E94';
const SUBTITLE_COLOR = '#1F4E94';
const SUBTITLE_OPACITY = 0.65;
const LIGHT_SURFACE = '#FBFBFD';

// Font stack: librsvg/sharp resolves through fontconfig, so we list Pretendard
// first (self-hosted in /public/fonts but typically also installed locally),
// then macOS system Korean/sans fallbacks, then a generic family. The OG image
// is built locally and committed — runtime font availability does not matter.
const FONT_STACK =
  "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Symbol-only SVG (no background, transparent canvas, fills entire viewBox). */
function symbolSvg(strokeWidth) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="22" fill="none" stroke="${COLOR}" stroke-width="${strokeWidth}"/>
  <path d="M32 10 A 22 22 0 0 1 32 54 Z" fill="${COLOR}"/>
</svg>`;
}

/**
 * White-background canvas with the symbol centered and scaled to `ratio` of canvas size.
 * Used for 180/192/512 (ratio 0.62) and maskable 512 (ratio 0.40, safe area).
 */
function symbolOnWhiteSvg(canvasSize, ratio, strokeWidth = 2.4) {
  const inner = Math.round(canvasSize * ratio);
  const offset = Math.round((canvasSize - inner) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect width="${canvasSize}" height="${canvasSize}" fill="#FFFFFF"/>
  <svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="22" fill="none" stroke="${COLOR}" stroke-width="${strokeWidth}"/>
    <path d="M32 10 A 22 22 0 0 1 32 54 Z" fill="${COLOR}"/>
  </svg>
</svg>`;
}

async function renderPng(svg, size, outFile) {
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outFile, buf);
  return buf.length;
}

/**
 * Build favicon.ico containing 16/32/48 frames. We render each size from a
 * stroke-corrected symbol SVG so the ring stays visually crisp at all sizes,
 * then compose them into a single multi-image .ico via png-to-ico.
 */
async function buildIco() {
  const frames = [
    { size: 16, stroke: 5.0 },
    { size: 32, stroke: 2.8 },
    { size: 48, stroke: 2.4 },
  ];
  const pngBuffers = [];
  for (const f of frames) {
    const buf = await sharp(Buffer.from(symbolSvg(f.stroke)))
      .resize(f.size, f.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    pngBuffers.push(buf);
  }
  const ico = await pngToIco(pngBuffers);
  const out = resolve(PUBLIC_DIR, 'favicon.ico');
  await writeFile(out, ico);
  return { bytes: ico.length, sizes: frames.map((f) => f.size) };
}

/**
 * Build the Open Graph image: 1200x630, light surface background, centered
 * lockup (symbol + "Skin Diary" wordmark + "스킨 다이어리" subtitle).
 *
 * Layout numbers (units = OG pixels):
 *   - canvas:        1200 x 630
 *   - symbol:        160 x 160 (5% of width, sits left of wordmark)
 *   - gap (sym→wm):  32
 *   - wordmark:      96px font-size, weight 700
 *   - subtitle:      36px font-size, weight 500, baseline 56 below wordmark
 *
 * The whole lockup is rendered inside a single SVG and composited onto a flat
 * background — no shadows, gradients, or marketing copy per spec.
 *
 * Visual width of the lockup hovers around 660px (symbol 160 + gap 32 +
 * "Skin Diary" wordmark ~470px), well within the 600~720 target.
 */
async function buildOg() {
  await mkdir(OG_DIR, { recursive: true });

  const W = 1200;
  const H = 630;

  // Lockup measurements (estimated; SVG is scaled, exact px don't matter for layout).
  const symSize = 160;
  const gap = 32;
  // We don't compute the exact wordmark width — instead anchor the wordmark at
  // text-anchor="start" right after the symbol, then horizontally center the
  // entire <g> via translate. We approximate the wordmark width to position the
  // group; visual eyeballing shows ~660px total which is within the 600–720 band.
  const approxWordmarkPx = 470;
  const lockupWidth = symSize + gap + approxWordmarkPx;
  const lockupX = Math.round((W - lockupWidth) / 2);
  const lockupY = Math.round((H - symSize) / 2); // top of symbol

  // Symbol coords inside its 64-unit viewBox, scaled to symSize.
  const sym = `
    <g transform="translate(${lockupX} ${lockupY})">
      <svg width="${symSize}" height="${symSize}" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="22" fill="none" stroke="${COLOR}" stroke-width="2.4"/>
        <path d="M32 10 A 22 22 0 0 1 32 54 Z" fill="${COLOR}"/>
      </svg>
    </g>`;

  // Text block: vertically centered against the symbol's center line.
  // Wordmark baseline ~ center + 12 (visual optical center for cap-height 96).
  // Subtitle baseline ~ wordmark baseline + 56.
  const textX = lockupX + symSize + gap;
  const symCenterY = lockupY + symSize / 2;
  const wordmarkY = symCenterY + 12;
  const subtitleY = wordmarkY + 56;

  const text = `
    <g font-family="${FONT_STACK}">
      <text x="${textX}" y="${wordmarkY}" fill="${WORDMARK_COLOR}" font-size="96" font-weight="700" letter-spacing="-2.5">Skin Diary</text>
      <text x="${textX}" y="${subtitleY}" fill="${SUBTITLE_COLOR}" fill-opacity="${SUBTITLE_OPACITY}" font-size="36" font-weight="500" letter-spacing="0.4">스킨 다이어리</text>
    </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${LIGHT_SURFACE}"/>
  ${sym}
  ${text}
</svg>`;

  // Render with a high-DPI density hint so text edges stay crisp.
  const buf = await sharp(Buffer.from(svg), { density: 384 })
    .resize(W, H, { fit: 'contain', background: LIGHT_SURFACE })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const out = resolve(OG_DIR, 'skin-diary-og.png');
  await writeFile(out, buf);
  return { bytes: buf.length, width: W, height: H };
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });

  const targets = [
    {
      file: 'favicon-16.png',
      size: 16,
      svg: symbolSvg(5.0), // axis-corrected for 16px
      transparent: true,
    },
    {
      file: 'favicon-32.png',
      size: 32,
      svg: symbolSvg(2.8),
      transparent: true,
    },
    {
      file: 'apple-touch-icon.png',
      size: 180,
      svg: symbolOnWhiteSvg(180, 0.62, 2.4),
      transparent: false,
    },
    {
      file: 'icon-192.png',
      size: 192,
      svg: symbolOnWhiteSvg(192, 0.62, 2.4),
      transparent: false,
    },
    {
      file: 'icon-512.png',
      size: 512,
      svg: symbolOnWhiteSvg(512, 0.62, 2.4),
      transparent: false,
    },
    {
      file: 'icon-maskable-512.png',
      size: 512,
      // 0.40 leaves the symbol within the inscribed circle of the 80% safe area.
      svg: symbolOnWhiteSvg(512, 0.4, 2.4),
      transparent: false,
    },
  ];

  for (const t of targets) {
    const out = resolve(PUBLIC_DIR, t.file);
    const bytes = await renderPng(t.svg, t.size, out);
    const kb = (bytes / 1024).toFixed(2);
    console.log(`${t.file} — ${t.size}x${t.size}, ${kb}KB`);
  }

  const ico = await buildIco();
  console.log(`favicon.ico — sizes ${ico.sizes.join('/')}, ${(ico.bytes / 1024).toFixed(2)}KB`);

  const og = await buildOg();
  console.log(
    `og/skin-diary-og.png — ${og.width}x${og.height}, ${(og.bytes / 1024).toFixed(2)}KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
