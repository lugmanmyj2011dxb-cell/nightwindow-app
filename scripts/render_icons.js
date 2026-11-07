// 用矢量源文件 resources/icon/night-window-icon.svg 生成 iOS / Android 全套图标。
// 用法：node scripts/render_icons.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('/Users/nigelma/Documents/Trae-CN/temp_20261010_03/_shot-tools/node_modules/puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources/icon/night-window-icon.svg');
const svg = fs.readFileSync(SRC, 'utf8');

// 自适应图标的前景层：去掉底色、把线稿缩到安全区内
const fgSvg = svg
  .replace(/\s*<rect width="1024" height="1024" fill="url\(#(bg|glow)\)"\/>/g, '')
  .replace(/<g fill="none"[\s\S]*<\/svg>/, m => '<g transform="translate(512,512) scale(0.72) translate(-512,-512)">' + m.replace('</svg>', '</g></svg>'));

const TARGETS = [
  // iOS：App Store 要求 1024 满版，圆角由系统裁
  { out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024 },
  // 应用商店商品页图标（Play 要求 512×512 无透明通道）
  { out: 'resources/icon/export/icon-512.png', size: 512 },
  // Android 传统图标（带圆角）
  ...[['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]].flatMap(([d, s]) => [
    { out: `android/app/src/main/res/mipmap-${d}/ic_launcher.png`, size: s, radius: '22%' },
    { out: `android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, size: s, radius: '50%' },
    { out: `android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, size: Math.round(s * 108 / 48), fg: true },
  ]),
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  for (const t of TARGETS) {
    const use = t.fg ? fgSvg : svg;
    const radius = t.radius || '0';
    await page.setViewport({ width: t.size, height: t.size, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div style="width:${t.size}px;height:${t.size}px;border-radius:${radius};overflow:hidden">
      ${use.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}
      </div></body></html>`);
    const full = path.join(ROOT, t.out);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await page.screenshot({ path: full, omitBackground: true });
    console.log(`${t.size}px -> ${t.out}`);
  }
  await browser.close();
})();
