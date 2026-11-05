/* ===================== 眠窗 · 钻石💎专属空间 =====================
   这个文件装的是钻石版的"专属感"功能：6套可选主题、创始人专属通讯、
   心愿点单入口。都是刻意选的"零/低成本"实现方式：

   - 主题切换：复用 index.html 里已经定义好的 --diamond-1/2/3/edge 四个CSS变量——
     钻石相关的所有UI（付费墙里的钻石卡、"管理会员"面板）都已经在用这几个变量画色，
     所以切换主题只需要在 :root 上重新赋值这四个变量，不需要给每套主题单独写一遍CSS，
     6套主题的色值表就是下面的 DIAMOND_THEMES。

   - 创始人专属通讯：FOUNDER_NOTES 是一个你自己手动维护的数组，不是自动生成、
     也没有接后端——想"发"一条新消息给钻石用户，就是你自己在这个文件里加一行，
     重新发布一次App更新（或者以后有了后端再改成真的远程拉取）。现在这样做好处是
     零成本、立刻能用，坏处是"发新消息"等于要发一次App更新，频率不会很高，
     这个取舍目前匹配你一个人开发、没有后端的现实情况，先别指望它是实时的。

   - 心愿点单：现在没有后端表单，直接用 mailto: 打开邮件客户端，发到钻石专属邮箱，
     不是花里胡哨的表单UI，但零开发成本，而且"收到一封真实邮件"本身也更有
     "被认真对待"的感觉，比填一个表单更有人情味。
================================================================= */

// 钻石专线邮箱：当前是真实在用、会看的 Gmail，"尽量 24 小时回复"的承诺从这一行开始兑现。
// 可选升级（让发件人显示域名而不是 @gmail.com，更有"专线"的身份感，成本≈一个域名的年费）：
// 买域名 → Cloudflare Email Routing（免费，只管收）或 Zoho Mail 免费版（收发都显示域名）
// 把 diamond@你的域名 指到这个 Gmail → 改掉下面这一行。
// ⚠️ 全项目要同步改两处：这里的 DIAMOND_SUPPORT_EMAIL，和 index.html 里的 SUPPORT_EMAIL（普通客服线）。
// 详细步骤见 REVENUECAT_SETUP.md「钻石档上架专项」第 2 节。
const DIAMOND_SUPPORT_EMAIL = 'lugmanmyj2011dxb@gmail.com';

// 6套主题色值表：都遵循同一个结构——深色宝石底(1) + 一点光泽色(2) + 近白高光(3) + 细金属描边(edge)，
// 保证不管选哪套，看起来都是"同一个高级系列里的不同颜色"，不会有某一套特别花、特别跳的违和感。
const DIAMOND_THEMES = [
  { id:'sapphire',   nameKey:'diamondThemeSapphire',   c1:'#0b2a43', c2:'#5fd4ef', c3:'#eaf8ff', edge:'#cda44e' },
  { id:'amethyst',    nameKey:'diamondThemeAmethyst',   c1:'#1f1230', c2:'#b98cf0', c3:'#f3ecff', edge:'#c9c9d6' },
  { id:'amber',       nameKey:'diamondThemeAmber',      c1:'#1a1208', c2:'#e0a85c', c3:'#fff3e0', edge:'#8c6a3a' },
  { id:'jade',        nameKey:'diamondThemeJade',       c1:'#0d2420', c2:'#5fd9a8', c3:'#eafff6', edge:'#d9b878' },
  { id:'obsidian',    nameKey:'diamondThemeObsidian',   c1:'#0a0a0c', c2:'#f0d78c', c3:'#fdf8e8', edge:'#d4af37' },
  { id:'rosequartz',  nameKey:'diamondThemeRoseQuartz', c1:'#241820', c2:'#e8b4c8', c3:'#fff0f5', edge:'#c9a0a8' }
];

const THEME_STORAGE_KEY = 'nw_diamond_theme';

function getSelectedThemeId(){
  try{ return localStorage.getItem(THEME_STORAGE_KEY) || 'sapphire'; }
  catch(e){ return 'sapphire'; } // localStorage 在部分隐私模式下会抛错，拿不到就用默认主题，不让这点小事崩掉整个面板
}

function applyDiamondTheme(themeId){
  const theme = DIAMOND_THEMES.find(t=>t.id===themeId) || DIAMOND_THEMES[0];
  const root = document.documentElement.style;
  root.setProperty('--diamond-1', theme.c1);
  root.setProperty('--diamond-2', theme.c2);
  root.setProperty('--diamond-3', theme.c3);
  root.setProperty('--diamond-edge', theme.edge);
}

function setTheme(themeId){
  try{ localStorage.setItem(THEME_STORAGE_KEY, themeId); }catch(e){ /* 存不了就算了，这次会话里切换仍然生效，只是刷新后会回到默认 */ }
  applyDiamondTheme(themeId);
}

// 创始人专属通讯——手动维护，见文件头的注释。新的一条加在数组最前面（最新的在最上面）。
// date 用当天真实的 'YYYY-MM-DD'，text 用第一人称、偏私人的语气写，不是正式的"版本更新日志"文风。
//
// ⚠️ 不是每次发版都要写一条——"安静的奢华"这个调性本身就不该很频繁，一两个月有件真事想说
// 再写，没什么可说就别硬凑。内容必须是你自己知道的真实情况，没法代笔，但"怎么写"可以随时
// 让我帮你套语气——跟我说一句大白话（比如"这周加了个新场景"），我帮你写成下面这种风格，
// 你直接改日期、贴进这个数组就行。下面是几条可以直接套用的模板（先注释掉，真的要发的
// 时候取消注释、改成当天日期和真实内容）：
//
// 钻石版刚上线时用这条（内容是真的，不是编的——只在你真正上线那天改好日期启用）：
// { date:'YYYY-MM-DD', text:'钻石版刚刚上线，谢谢你愿意成为第一批加入的人。接下来我想先做的是……' }
//
// 加了新功能/新场景时：
// { date:'YYYY-MM-DD', text:'刚加了一个新场景/新功能：______。做这个的原因是______，之后我还想试试______。' }
//
// 没什么大更新，纯粹想打个招呼时（这种也可以写，不是每条都要有"干货"）：
// { date:'YYYY-MM-DD', text:'最近没什么大动作，App还在稳稳跑着。谢谢你一直在，有想法随时在下面"心愿点单"告诉我。' }
const FOUNDER_NOTES = [
  // —— 第 1 条，已写好（上线即可用，日期就是写下它的真实日期，不依赖上线日）。
  //    文字随时可改，改的时候守住三条：第一人称、只写真话、不写会过期的承诺
  //    （具体的会员人数、具体的上线日期这类会随时间变假的话都不写）。
  //    中英双语放同一条是刻意的：创始人私信是"人的声音"，不做 25 语言本地化——
  //    中文是创始人的母语，英文段给国际会员，真实比"每段都翻译"更像一个真人在说话。
  {
    date:'2026-10-11',
    text:"在做「眠窗」之前，我自己就是一个严重失眠的人。<br><br>那些夜里，辗转反侧，数过星星，数过绵羊，天还是亮了。那种痛苦不只是睡不着——是不知所措，是烦躁到摔东西，是绝望到伤害过自己，是觉得没有人能救我了，甚至，比那还要糟。<br><br>后来，我一点点走了出来，然后做了这款 App——想为同样醒在这种夜里的人，留一扇还亮着的窗。<br><br>如果你此刻就在这样的夜里：你不是一个人。你想说的话，下方「心愿点单」的每一封邮件，我都会亲自看。<br><br>祝你今晚，睡个好觉。<br><br>——<br><br>Before Night Window, I was someone who lived with severe insomnia.<br><br>Night after night: tossing and turning, counting stars, counting sheep — still awake when the sky turned light. The pain was not just not sleeping. It was not knowing what to do, the agitation that made me throw things, the despair in which I hurt myself, the feeling that no one could save me — and worse.<br><br>Little by little, I found my way out. Then I made this app — to leave a window still lit for anyone awake in a night like that.<br><br>If you are in such a night right now: you are not alone. I personally read every email from “Wish a Scene” below.<br><br>Sleep well tonight."
  }
];

// 只翻译某个容器内部刚生成的新节点，不调用全局的 I18N.applyToDOM()——
// 全局 applyToDOM() 末尾会触发 window.onLanguageChanged()，onLanguageChanged() 里又会
// 重新渲染好几个跟这个面板完全无关的模块（最近播放、我的组合、精选推荐……），每次
// 打开钻石专属空间都白白多做一轮这些无关的重渲染。pricing.js 的 renderPlanList() 也用
// 同一个套路，且那边是真的会死循环崩溃（见 pricing.js 里的详细注释），这里虽然不会死循环
// （onLanguageChanged 不会反过来调用 openDiamondLounge），但没必要跟着触发一整套副作用。
function applyScopedI18n(container){
  if(!container) return;
  container.querySelectorAll('[data-i18n]').forEach(e=>{ e.textContent = I18N.t(e.getAttribute('data-i18n')); });
  container.querySelectorAll('[data-i18n-aria]').forEach(e=>{ e.setAttribute('aria-label', I18N.t(e.getAttribute('data-i18n-aria'))); });
}

function renderFounderNotes(container){
  if(!container) return;
  if(FOUNDER_NOTES.length===0){
    container.innerHTML = `<p class="diamond-lounge-empty" data-i18n="diamondFounderNotesEmpty">暂时还没有新消息——下一次更新会先说给你听。</p>`;
    applyScopedI18n(container);
    return;
  }
  container.innerHTML = FOUNDER_NOTES.map(n=>`
    <div class="diamond-founder-note">
      <div class="diamond-founder-note-date">${n.date}</div>
      <div class="diamond-founder-note-text">${n.text}</div>
    </div>
  `).join('');
}

function renderThemeSwatches(container){
  if(!container) return;
  const current = getSelectedThemeId();
  container.innerHTML = DIAMOND_THEMES.map(t=>`
    <button class="diamond-theme-swatch ${t.id===current?'active':''}" data-theme="${t.id}"
      style="background:linear-gradient(135deg, ${t.c1}, ${t.c2});border-color:${t.edge};"
      data-i18n-aria="${t.nameKey}" aria-label="${t.nameKey}"></button>
  `).join('');
  container.querySelectorAll('.diamond-theme-swatch').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setTheme(btn.dataset.theme);
      container.querySelectorAll('.diamond-theme-swatch').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function openDiamondLounge(){
  const modal = document.getElementById('diamondLoungeModal');
  if(!modal) return;
  renderThemeSwatches(document.getElementById('diamondThemeSwatches'));
  renderFounderNotes(document.getElementById('diamondFounderNotes'));
  modal.classList.add('show');
  applyScopedI18n(modal);
}
function closeDiamondLounge(){
  const modal = document.getElementById('diamondLoungeModal');
  if(modal) modal.classList.remove('show');
}

function openWishRequestEmail(){
  // ⚠️ 修复：之前这个函数本身没做任何会员身份校验，完全靠UI入口（专属空间只对钻石用户展示）
  // 挡着——UI挡得住普通用户误触，但挡不住有人直接在控制台执行 DiamondLounge.openWishRequestEmail()，
  // 这样会让你的真实邮箱被任何人触发邮件发送。主题切换那几个函数不受影响（那是有意不加校验的，
  // 纯本地UI偏好，没有外部副作用），但这个函数会真的触发一次邮件发送动作，补上校验。
  if(typeof Membership==='undefined' || !Membership.isPremium() || Membership.getSource()!=='diamond'){
    return;
  }
  // ⚠️ 真实bug修复（互查时发现）：权益文案和付费墙里都明确写了"每年 1 次心愿点单"，
  // 但这个函数之前完全没有任何次数记录——不是真的限制一年一次，是写了一句承诺、代码却
  // 什么都没做，跟你自己定的"明明白白"原则直接冲突（说了的事，代码得真的对应得上）。
  // 不做成硬性拦截（真把一个付了$600的人邮件入口挡住，惹恼人的风险比"多写一封邮件"大得多），
  // 而是如实提示——按年份记录用了几次，超过1次只是提醒一下，不阻止发送。
  const WISH_COUNT_KEY = 'nw_diamond_wish_year_count';
  let record = { year: new Date().getFullYear(), count: 0 };
  try{
    const saved = JSON.parse(localStorage.getItem(WISH_COUNT_KEY) || 'null');
    if(saved && saved.year === record.year) record = saved;
  }catch(e){ /* 读不到就按今年第一次算，不影响邮件照常发出去 */ }
  record.count += 1;
  try{ localStorage.setItem(WISH_COUNT_KEY, JSON.stringify(record)); }catch(e){ /* 存不了不影响这次发送 */ }
  if(record.count > 1 && typeof showActionBanner==='function'){
    // 超过本年度第一次，提示一下但仍然正常打开邮件——不拦、只提醒，见上面的注释
    showActionBanner(I18N.t('diamondWishExtraNotice').replace('{count}', record.count), null, null);
  }
  const subject = encodeURIComponent(I18N.t('diamondWishEmailSubject'));
  const body = encodeURIComponent(I18N.t('diamondWishEmailBody'));
  window.open(`mailto:${DIAMOND_SUPPORT_EMAIL}?subject=${subject}&body=${body}`, '_system');
}

// App启动时，不管是不是钻石用户都先把保存过的主题变量应用一下——这几个CSS变量只会被
// 钻石专属的UI（付费墙钻石卡、管理面板）用到，普通用户的界面不会受影响，所以不需要先判断
// Membership.getSource()==='diamond' 才应用，省一次判断，也不会有副作用。
applyDiamondTheme(getSelectedThemeId());

window.DiamondLounge = {
  open: openDiamondLounge,
  close: closeDiamondLounge,
  openWishRequestEmail,
  DIAMOND_THEMES
};
