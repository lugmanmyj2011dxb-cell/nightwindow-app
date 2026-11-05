/**
 * 软著申请 · 用户手册文档生成器（图文版）
 * ============================================================
 * 生成《眠窗助眠音效软件 V1.0 用户手册》.docx
 *  - 内容全部基于 App 真实功能与真实界面文案（i18n.js zh-CN 区核对于 2026-10-18）
 *  - 插图全部为 App 真实界面的实拍截图（本机 Chrome 无头渲染 www/ 实拍，
 *    见 _shot-tools/shot.js；非手绘、非想象图，界面语言为简体中文）
 *  - 手册页数不足 60 页时全部提交即合规
 *  - 软件名称/版本与 generate-source-doc.js 保持一致（与登记申请表必须一字不差）
 *
 * 用法：node 软著申请/generate-manual-doc.js
 * 生成：软著申请/眠窗助眠音效软件V1.0-用户手册.docx
 * 依赖：软著申请/screenshots/*.png（缺图时自动跳过并在控制台告警）
 * ============================================================
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell,
  AlignmentType, PageNumber, BorderStyle, WidthType, ShadingType, ImageRun
} = require('docx');

// ===== 与源程序文档保持一致 =====
const SOFTWARE_NAME = '眠窗助眠音效软件';
const VERSION = 'V1.0';
// ================================

const OUT_FILE = `${SOFTWARE_NAME}${VERSION}-用户手册.docx`;
const HEI = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: '黑体' };   // 标题
const SONG = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: '宋体' };  // 正文

// ---------- 内容组装 helper ----------
const children = [];
const H1 = t => children.push(new Paragraph({
  spacing: { before: 280, after: 160 }, keepNext: false, keepLines: false,
  children: [new TextRun({ text: t, font: HEI, size: 30, bold: true })]
}));
const H2 = t => children.push(new Paragraph({
  spacing: { before: 200, after: 100 }, keepNext: false, keepLines: false,
  children: [new TextRun({ text: t, font: HEI, size: 24, bold: true })]
}));
const P = t => children.push(new Paragraph({
  spacing: { before: 0, after: 80, line: 300, lineRule: 'auto' },
  indent: { firstLine: 420 },
  children: [new TextRun({ text: t, font: SONG, size: 21 })]
}));
const LI = t => children.push(new Paragraph({
  numbering: { reference: 'dot', level: 0 },
  spacing: { before: 0, after: 60, line: 300, lineRule: 'auto' },
  children: [new TextRun({ text: t, font: SONG, size: 21 })]
}));

// 表格 helper（双宽度 + cantSplit + CLEAR 底纹）
const BORDER = { style: BorderStyle.SINGLE, size: 2, color: '888888' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
function cell(text, w, bold, fill) {
  return new TableCell({
    borders: BORDERS, width: { size: w, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, font: SONG, size: 20, bold: !!bold })] })]
  });
}
function TBL(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  children.push(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ cantSplit: true, children: headers.map((h, i) => cell(h, widths[i], true, 'EFEFEF')) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], false)) }))
    ]
  }));
  children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [] }));
}

// 插图 helper：真实界面截图居中插入 + 图号题注
const SHOT_DIR = path.join(__dirname, 'screenshots');
const IMG_W = 300;                              // 显示宽度（px，96dpi 下约 3.1 英寸）
const IMG_H = Math.round(IMG_W * 1688 / 780);   // 截图原始比例 780x1688
let figNo = 0;
const missingShots = [];
function FIG(file, caption) {
  const p = path.join(SHOT_DIR, file);
  if (!fs.existsSync(p)) { missingShots.push(file); return; }
  figNo++;
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 140, after: 50 }, keepNext: true,
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(p),
      transformation: { width: IMG_W, height: IMG_H } })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 0, after: 180 },
    children: [new TextRun({ text: `图 ${figNo}　${caption}`, font: SONG, size: 18, color: '666666' })]
  }));
}

// ================= 正文 =================
// 标题页（首页顶部，不单独占页，软著手册无需封面）
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 400, after: 80 },
  children: [new TextRun({ text: `${SOFTWARE_NAME}`, font: HEI, size: 44, bold: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
  children: [new TextRun({ text: `用 户 手 册`, font: HEI, size: 36, bold: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 300 },
  children: [new TextRun({ text: `（版本号：${VERSION}）`, font: SONG, size: 24 })]
}));

H1('一、软件概述');
P(`${SOFTWARE_NAME}（以下简称"本软件"）是一款在移动设备上运行的白噪音环境声应用。本软件的全部声音均由算法在设备端实时合成，无需下载音频素材即可播放，并提供与声音联动的动态画面。用户可以在入睡前选择喜欢的自然声场景，配合定时关闭、音量渐入、屏幕防误触锁定等功能，获得陪伴式的放松体验。`);
P('本软件支持简体中文、繁体中文、英语、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、印地语、旁遮普语、乌尔都语、阿拉伯语、印尼语、越南语、意大利语、土耳其语、荷兰语、芬兰语、挪威语、波斯语、斯瓦希里语、豪萨语、阿姆哈拉语共 25 种界面语言，启动后自动跟随系统语言，也可在界面内手动切换。');
P('本软件主要功能包括：');
LI('78 款实时合成环境声，按雨、雪、木屋、水声、自然、室内、噪声、太空、旅途、低频共鸣等 12 个分组组织，即点即播；');
LI('多轨混音器：多个声音叠加播放、独立调节音量，支持保存与载入个人组合；');
LI('会员视频场景：提供与声音联动的动态视频画面，支持下载后离线播放；');
LI('定时关闭（30 分钟至 8 小时，结束前声音缓缓淡出）、音量渐入、播放中屏幕防误触锁定；');
LI('睡前提醒、次日清晨回顾卡片、减员动态效果适配等辅助能力；');
LI('邮箱 / Google / Apple 三种账号登录方式，会员资格跨设备同步；');
LI('月付、年付（含 3 天免费试用）、终身买断、钻石版四档会员，通过应用商店内购完成购买，支持恢复购买。');

H1('二、运行环境');
TBL(['项目', '要求'], [
  ['操作系统', 'Android 7.0 及以上；iOS 15.0 及以上'],
  ['硬件要求', '普通智能手机或平板，无特殊硬件要求'],
  ['存储空间', '安装包约数十 MB；下载视频场景会占用额外存储空间'],
  ['网络连接', '声音功能实时合成、无需联网；下载视频场景、账号登录、购买与恢复购买需要网络'],
  ['其他依赖', '无']
], [2200, 7160]);

H1('三、安装与启动');
H2('3.1 安装');
P('Android 用户可在 Google Play 等应用商店搜索本软件名称进行安装；iOS 用户可在 App Store 搜索安装。安装完成后桌面出现应用图标。');
H2('3.2 首次启动');
P('首次启动时，应用会加载主界面并自动跟随系统语言。本软件不需要强制授权任何敏感权限；仅当您主动开启"睡前提醒"功能时，才会请求发送本地通知的权限，拒绝该权限不影响其他功能使用。');
H2('3.3 退出与后台播放');
P('点击播放后，声音将持续播放；将应用切到后台或锁屏后，播放不会中断。如需停止，可回到应用内暂停，或使用定时关闭功能等待其自动淡出结束。');

H1('四、主界面与基本操作');
H2('4.1 主界面布局');
P('主界面自上而下依次为：软件标语与当前场景动态画面区、场景分组选择区、播放控制区。画面会跟随当前音量最高的声音自动切换场景；所有声音均为设备端实时合成，选择后立即播放，无需下载素材。');
FIG('01-main.png', '主界面：软件标语、与声音联动的动态画面、场景分组列表');
H2('4.2 场景分组与选择');
P('场景选择区按 12 个分组组织 78 款声音，分组名称如下表。点击任意场景名称即开始播放对应声音；再次点击可停止。');
TBL(['分组名称', '内容举例'], [
  ['雨 · RAIN', '窗前雨、毛毛雨、帐篷听雨、屋檐雨声、雨打树叶、花房夜雨、林间暴雨等'],
  ['雪 · SNOW', '大雪、暴雪、雪枝、密林雪、静雪等'],
  ['木屋 · CABIN', '壁炉、篝火、炉火特写、烛芯噼啪等'],
  ['更多质感 · EXTRA', '风声、风声夜、安眠夜等'],
  ['雪夜市井 · CITY SNOW', '雪夜林荫道、雪夜广场、雪窗微光、雪夜倒影等'],
  ['水声 · WATER', '轻浪拍岸、夜海呼吸、山涧溪流、水滴石潭、远山瀑布、茶室注水等'],
  ['自然 · NATURE', '蟋蟀鸣夜、夏夜虫鸣、林间鸟鸣、森林夜息、草甸晚风、竹林风吟等'],
  ['室内 · INDOOR', '桌面风扇、老风扇、空调夜风、挂钟嘀嗒、深夜公路、城市夜底噪等'],
  ['噪声 · NOISE', '白噪音、粉噪音、棕噪音、纸笔沙沙'],
  ['太空 · SPACE', '空间站低鸣、星云漂流、视界边缘'],
  ['旅途 · TRAVEL', '夜行列车、红眼机舱、夜航轮渡'],
  ['低频共鸣 · RESONANCE', '颂钵余韵、暖雾低鸣、水晶音束、风铃轻响、432Hz 柔音、7.83Hz 低频脉动、Delta 低鸣（需耳机）、Theta 沉潜（需耳机）等']
], [2600, 6760]);
P('其中 Delta 低鸣与 Theta 沉潜采用左右声道不同频率的双声道差频方式播放，需要佩戴耳机才能获得设计的效果。');
FIG('03-groups.png', '场景分组列表：每条声音带独立音量滑块，锁形图标表示会员内容');
H2('4.3 播放控制');
P('播放控制区提供播放/暂停按钮与音量滑杆。若在设置中开启了"音量渐入"，开始播放时音量会在数秒内缓缓升起，避免突然的声音惊扰。');
H2('4.4 定时关闭');
P('点击定时入口可为本次播放设定自动结束时间，可选 30 分钟、60 分钟、2 小时、3 小时、5 小时、8 小时。到达设定时间前，声音会先缓缓淡出再停止，界面上会显示"未设置定时 · 将持续播放""将在 XX 后开始渐渐淡出""正在缓缓淡出 · 还剩 XX"等状态，并随时可以取消定时。');
FIG('04-timer.png', '底部控制区：定时关闭档位（30 分钟至 8 小时）与播放/暂停按钮');
H2('4.5 我的助眠音（添加自己的录音）');
P('除内置场景外，用户还可以从手机中选择自己的录音或音乐作为助眠声音。打开"我的助眠音 · MY SOUND"分组后选择本地音频文件即可播放：该音频只保存在用户自己的手机上，不会上传，也不会被任何人听到或分享。');
P('为避免占用过多空间或造成播放异常，所选文件需在 8MB 以内、时长在 5 分钟以内。当文件过大、过长或不是音频格式时，应用会给出相应提示并引导重新选择；默认名称为"我的助眠音"。');
H2('4.6 呼吸引导');
P('在开始播放前，主界面提供"先做 2 分钟呼吸引导"入口。引导界面以"吸气—屏息—呼气"的节奏提示用户跟随呼吸，帮助在睡前先把呼吸放慢、把注意力收回来。引导结束后会提示"做得很好，准备好就开始播放吧"；如果不想做，也可以随时点击"跳过，直接播放"。');

H1('五、混音器');
P('在任意场景播放时，可以再点选其他场景将多个声音叠加在一起，并为每个声音单独调节音量，形成个人化的环境声组合。画面会跟随音量最高的声音自动切换。');
P('组合支持保存与载入：保存的组合会列在"我的组合"中，最多可保存 8 个，超出时应用会提示先删除旧组合再保存新组合。免费版最多可同时混合 2 个声音，会员不限轨道；打开包含会员场景的已保存组合时，声音部分正常播放，画面部分需要会员解锁。');
FIG('02-playing.png', '多个声音叠加播放：每条声音音量独立可调，画面跟随音量最高的声音');

H1('六、视频场景（会员内容）');
P('视频场景为会员内容：为场景提供与声音联动的动态视频画面。点击未下载的会员场景时，应用会提示"正在下载「XX」场景…"并显示下载进度；下载完成后可离线播放，无需再次联网。');
P('在蜂窝数据网络下触发下载时，应用会先弹出确认提示，避免意外消耗流量；您也可以在设置中调整该行为。非会员点击会员场景时，会出现"会员专属场景"提示面板，可选择开通会员、恢复购买或暂不需要；声音试听不受影响。');

H1('七、免费版与会员');
H2('7.1 免费版');
LI('免费版可不限时长、可离线使用以下 4 款声音：窗前雨、暴雪、壁炉、风声；');
LI('其余声音内容提供约 90 秒的试听预览（预览时长以产品设置为准），预览结束后可选择再听一次或了解会员；');
LI('新用户享有前 3 晚的体验宽限期，宽限期内会员内容的播放不受限制；');
LI('免费版混音上限为同时 2 个声音。');
H2('7.2 会员档位');
TBL(['档位', '计费方式', '说明'], [
  ['月付', '按月自动续订', '随时可在系统订阅设置中取消'],
  ['年付', '按年自动续订', '含 3 天免费试用，试用结束前取消不产生费用'],
  ['终身', '一次性买断', '永久使用会员功能'],
  ['钻石💎版', '一次性买断', '终身版全部权益 + 钻石专属空间（见第八节）']
], [2000, 2600, 4760]);
P('各档位价格以应用内购买页实际展示为准；部分时期提供"年付转终身"的补差价升级通道，具体以购买页说明为准。所有购买均通过 Apple / Google 官方渠道内购完成，本软件不收集银行卡信息。');
FIG('05-paywall.png', '会员购买页：月付 / 年付 / 终身 / 钻石四档，并提供"恢复购买"入口');
H2('7.3 恢复购买与续费提醒');
P('更换设备或重装应用后，登录同一账号并点击"恢复购买"即可找回会员资格；恢复失败时会提示检查网络或联系客服。');
P('会员到期前 5 天，应用会提示续费提醒；开启提前提醒后，会在扣款前几天通过系统通知告知。购买终身或钻石版后，如之前开有订阅，应用会提醒前往系统设置取消旧订阅，避免重复扣费。');

H1('八、钻石专属空间');
P('购买钻石💎版的用户可获得专属空间，包含三项内容：');
LI('六套专属主题色（蓝宝石、紫水晶、琥珀、翡翠、黑曜石、玫瑰石英），可随时切换；');
LI('创始人通讯：以第一人称手写的版本动态与寄语，不定期更新；');
LI('心愿点单：通过邮件直接向开发者提交场景心愿，每自然年可使用一次，超出次数时应用会提示但仍可发送。');
FIG('08-diamond.png', '钻石专属空间：专属主题色、创始人留言与心愿点单');

H1('九、账号');
P('本软件提供三种登录方式：邮箱注册/登录、Google 登录、Apple 登录，可在账号面板中按需选择。登录后，会员资格与使用记录可在换手机、重装应用后找回。部分功能（如跨设备同步）需要登录后使用；不登录也可以正常使用免费版的声音播放功能。');
P('账号面板同时提供退出登录等管理操作。如需注销账号或删除相关数据，可通过"联系反馈"入口提出请求。');
FIG('06-account.png', '账号面板：邮箱注册 / 登录、忘记密码入口');

H1('十、辅助功能与设置');
H2('10.1 锁定屏幕防误触');
P('播放过程中可开启"锁定屏幕防误触"。锁定后界面被冻结，误碰屏幕不会改变播放状态；需要操作时，轻点两下屏幕即可解锁（界面会显示"已锁定 · 轻点两下屏幕解锁"）。');
H2('10.2 减少动态效果');
P('开启后，背景画面将降低或停止动态效果，保留静态画面与声音，适合偏好低视觉刺激、希望进一步省电的用户。');
H2('10.3 音量渐入');
P('开启后每次开始播放时音量从零缓缓升起，避免入睡环境中的突然声响。');
H2('10.4 蜂窝网络下载确认');
P('开启后，在蜂窝数据网络下下载视频场景前会先确认，避免意外流量消耗。');
H2('10.5 睡前提醒');
P('可在设置中开启"睡前提醒"：在您平时入睡的时段，通过系统本地通知轻轻提醒一句（"晚安，需要陪您入睡的声音吗？"）。该功能默认关闭，随时可以关闭；通知完全在设备本地生成。');
H2('10.6 深睡频率律动');
P('作用于星空 / 微光主题的律动效果开关，建议佩戴耳机使用。');
FIG('07-settings.png', '辅助功能开关：深睡频率律动、温馨问候、睡前提醒等');
H2('10.7 渐入唤醒');
P('"渐入唤醒"是一项轻量提醒功能：可为本次播放设定在 20 分钟、45 分钟、1 小时、1.5 小时、2 小时或 3 小时后，用轻柔渐入的声音把人叫醒。设置后界面会显示"将在 XX 后轻柔唤醒你"；到点时提示"正在轻柔唤醒你……"，可点击"我醒了"结束，或点击"取消唤醒"放弃；未设置时显示"未设置渐入唤醒"。');
P('需要如实说明的是：这是轻量级的渐入唤醒提醒，不建议用于必须准时叫醒的场合（如赶飞机、吃药提醒）。');
H2('10.8 温馨问候');
P('开启"温馨问候"后，应用会在打开时偶尔显示一句话（深夜打开时例如"这么晚还醒着啊，没关系，陪您一会儿。"）。该问候只是偶然出现的一句陪伴，用户若不喜欢可以随时关闭。');
H2('10.9 语言切换');
P('支持 25 种界面语言，默认跟随系统语言，也可在语言选择器中手动切换，切换即时生效。');

H1('十一、帮助与反馈');
P('应用页脚提供"隐私政策""联系反馈""服务条款"三个入口，对应内容为在线网页。帮助面板中提供常见问题解答与退款指引：退款由应用商店官方渠道处理，面板中提供跳转商店退款页面的入口，以及分步的退款申请说明；也可通过"联系反馈"与开发者取得联系。');

H1('十二、常见问题');
TBL(['问题', '处理方法'], [
  ['点击场景没有声音', '检查设备媒体音量与静音开关；确认未处于播放暂停状态；检查是否误触了屏幕锁定（锁定时轻点两下屏幕解锁）'],
  ['下载视频场景失败', '检查网络连接；蜂窝网络下需确认下载授权；存储空间不足时请先清理空间后重试'],
  ['恢复购买失败', '确认登录的是购买时使用的账号，检查网络后重试，或通过"联系反馈"联系客服'],
  ['如何取消订阅', 'iOS：设置 → Apple ID → 订阅；Android：Play 商店 → 付款和订阅。取消后会员权益保留至当前计费周期结束'],
  ['换手机后会员还在吗', '登录同一账号并点击"恢复购买"即可找回'],
  ['定时关闭后为什么声音是慢慢变小的', '到达定时时间前应用会先缓缓淡出再停止，这是刻意设计，避免声音突然消失影响睡眠'],
  ['声音需要联网吗', '不需要。全部声音由设备端实时合成，飞行模式下也可正常播放；仅下载视频、登录、购买需要网络']
], [3200, 6160]);

H1('十三、安全与隐私');
LI('声音播放：全部声音在设备端实时合成，不采集、不上传任何音频数据；');
LI('本地数据：使用偏好、播放记录、保存的组合等存储在设备本地；');
LI('账号数据：注册登录时提交的邮箱等账号信息用于身份识别与会员权益同步；');
LI('购买数据：通过应用商店内购完成，本软件不接触银行卡等支付信息；');
LI('数据删除：可通过"联系反馈"请求删除账号及相关数据。');
P('完整隐私政策见应用页脚"隐私政策"链接。');

H1('十四、结语');
P(`${SOFTWARE_NAME} ${VERSION} 以"实时合成的环境声 + 联动动态画面"为核心，为用户提供一套简单、克制、不打扰的睡前陪伴工具。我们坚持功能说明如实、不夸大、不制造焦虑的产品原则，持续打磨声音品质与使用体验。`);
P('感谢您选择本软件。使用过程中如有任何问题或建议，欢迎通过"联系反馈"告诉我们。');

// ================= 文档 =================
const doc = new Document({
  creator: SOFTWARE_NAME,
  title: `${SOFTWARE_NAME} ${VERSION} 用户手册`,
  description: `${SOFTWARE_NAME} ${VERSION} 软件著作权登记用用户手册`,
  numbering: {
    config: [{
      reference: 'dot',
      levels: [{ level: 0, format: 'bullet', text: '·', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 280 } } } }]
    }]
  },
  styles: {
    default: {
      document: {
        run: { font: SONG, size: 21 },
        paragraph: { spacing: { before: 0, after: 80, line: 300, lineRule: 'auto' } }
      }
    }
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1250, right: 1250, bottom: 1250, left: 1250 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } },
          children: [new TextRun({ text: `${SOFTWARE_NAME} ${VERSION}　用户手册`, font: SONG, size: 18 })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '第 ', font: SONG, size: 18 }),
            new TextRun({ children: [PageNumber.CURRENT], font: SONG, size: 18 }),
            new TextRun({ text: ' 页 / 共 ', font: SONG, size: 18 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: SONG, size: 18 }),
            new TextRun({ text: ' 页', font: SONG, size: 18 })
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
  console.log('插图数量 :', figNo);
  if (missingShots.length) console.warn('⚠️ 缺失截图（已跳过）:', missingShots.join(', '));
  console.log('页数由 Word 打开后自动分页（不足 60 页全部提交即合规）');
});
