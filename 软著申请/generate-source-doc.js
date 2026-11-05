/**
 * 软著申请 · 源程序文档生成器
 * ============================================================
 * 依据《计算机软件著作权登记办法》与版权中心审查惯例：
 *   - 源程序提交「前 30 页 + 后 30 页」，共 60 页；不足 60 页的全部提交
 *   - 每页不少于 50 行（本脚本统一每页 50 行，空行不计入）
 *   - 页眉标注软件名称与版本号，页脚标注页码
 *   - 最后一页的最后一行必须是程序的结尾（本脚本把 index.html 放在最后）
 *
 * 用法：在 nightwindow-app 目录下执行
 *   node 软著申请/generate-source-doc.js
 * 生成：软著申请/眠窗助眠音效软件V1.0-源程序.docx
 * 之后用 Word / WPS / Pages 打开，直接导出 PDF 即可提交。
 *
 * 需要修改软件名称、版本号、每页行数时，改下面「可按需修改」这一段。
 * ============================================================
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, PageNumber, BorderStyle
} = require('docx');

// ===== 可按需修改 =====
const SOFTWARE_NAME = '眠窗助眠音效软件';   // 页眉显示的软件全称（须与登记申请表一致）
const VERSION = 'V1.0';                     // 版本号
const ROWS_PER_PAGE = 50;                   // 每页行数（软著要求不少于 50 行）
const PAGES_FRONT = 30;                     // 前 30 页
const PAGES_BACK = 30;                      // 后 30 页
const MAX_COLS = 88;                        // 每行最大显示宽度（中文/全角算 2 列），超出自动折行
// =====================

const OUT_FILE = `${SOFTWARE_NAME}${VERSION}-源程序.docx`;
const WWW = path.resolve(__dirname, '..', 'www');

// 拼接顺序（有意如此）：业务逻辑 JS 在前 → i18n.js 纯语言数据居中（落在省略区间）
// → index.html 收尾（其文件末尾即程序结尾，满足"最后一页最后一行是程序结尾"）
const FILE_ORDER = [
  'js/auth.js', 'js/payments.js', 'js/pricing.js', 'js/membership.js',
  'js/remote-config.js', 'js/remote-scenes.js', 'js/diamond.js',
  'js/i18n.js',
  'index.html'
];

// 全角/宽字符判定（中文、日文、韩文、全角标点、emoji 等按 2 列计算）
function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) ||
         (cp >= 0x3041 && cp <= 0x33ff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
         (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
         (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
         (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
         (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) ||
         (cp >= 0x20000 && cp <= 0x3fffd);
}

// 超宽行自动折行（按码点遍历，避免拆坏代理对），保证每行渲染宽度不超过 MAX_COLS
function wrapLine(line) {
  const out = [];
  let cur = '', w = 0;
  for (const ch of line) {
    const cw = isWide(ch.codePointAt(0)) ? 2 : 1;
    if (w + cw > MAX_COLS) { out.push(cur); cur = ''; w = 0; }
    cur += ch; w += cw;
  }
  out.push(cur);
  return out;
}

// 1) 读取全部源文件：统一制表符、去掉行尾空白、删掉空行（空行不计入 50 行）
const rows = [];
const stats = {};
let logicalLines = 0;
for (const rel of FILE_ORDER) {
  const text = fs.readFileSync(path.join(WWW, rel), 'utf8');
  let n = 0, r = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
    if (line.trim() === '') continue;
    const wrapped = wrapLine(line);
    rows.push(...wrapped);
    n += 1; r += wrapped.length;
  }
  logicalLines += n;
  stats[rel] = { 源行数: n, 折行后行数: r };
}

const fullPages = Math.ceil(rows.length / ROWS_PER_PAGE);

// 2) 取「前 30 页 + 后 30 页」；不足 60 页则全部提交
let picked;
if (fullPages <= PAGES_FRONT + PAGES_BACK) {
  picked = rows.slice();
} else {
  picked = rows.slice(0, PAGES_FRONT * ROWS_PER_PAGE)
    .concat(rows.slice(rows.length - PAGES_BACK * ROWS_PER_PAGE));
}
const pageCount = Math.ceil(picked.length / ROWS_PER_PAGE);

// 3) 组装段落：每 50 行一页，页首插入分页符
const FONT = { ascii: 'Courier New', hAnsi: 'Courier New', eastAsia: '宋体' };
const children = [];
for (let i = 0; i < picked.length; i++) {
  children.push(new Paragraph({
    pageBreakBefore: i > 0 && i % ROWS_PER_PAGE === 0,
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
    children: [new TextRun({ text: picked[i] || ' ', font: FONT, size: 18 })]  // 9pt
  }));
}

const doc = new Document({
  creator: SOFTWARE_NAME,
  title: `${SOFTWARE_NAME} ${VERSION} 源程序`,
  description: `${SOFTWARE_NAME} ${VERSION} 申请用源程序文档（前30页+后30页）`,
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 18 },
        paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } }
      }
    }
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },                        // A4 210×297mm
        margin: { top: 1020, right: 1020, bottom: 1020, left: 1020 }  // 18mm
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } },
          children: [new TextRun({ text: `${SOFTWARE_NAME} ${VERSION}　源程序`, font: FONT, size: 16 })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '第 ', font: FONT, size: 16 }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 }),
            new TextRun({ text: ` 页 / 共 ${pageCount} 页`, font: FONT, size: 16 })
          ]
        })]
      })
    },
    children
  }]
});

Packer.toBuffer(doc).then(buf => {
  const outPath = path.join(__dirname, OUT_FILE);
  fs.writeFileSync(outPath, buf);
  console.log('=== 生成结果 ===');
  console.log('输出文件 :', outPath);
  console.log('文件大小 :', (buf.length / 1024).toFixed(1) + ' KB');
  console.log('源文件明细:');
  for (const [k, v] of Object.entries(stats)) console.log(`   ${k.padEnd(22)} 源行 ${String(v.源行数).padStart(6)}  折行后 ${String(v.折行后行数).padStart(6)}`);
  console.log('有效源行总数 :', logicalLines, '（已剔除空行）');
  console.log('折行后总行数 :', rows.length, '（若全量提交约', fullPages, '页）');
  console.log('实际提交     :', pageCount, '页 ×', ROWS_PER_PAGE, '行 =', picked.length, '行');
  console.log('首页第一行   :', JSON.stringify(picked[0]));
  console.log('末页最后一行 :', JSON.stringify(picked[picked.length - 1]));
});
