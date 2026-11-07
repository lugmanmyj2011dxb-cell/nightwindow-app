/* ===================== 眠窗 · 会员状态与付费墙 =====================
   设计原则（对应商业化方案文档里的"免费能听、会员能看"）：
     - 免费用户：所有场景的【声音】都能正常播放（合成音效成本几乎为零）
     - 会员：额外解锁所有需要"按需下载"的场景的【真实视频画面】
     - 本地打包的核心场景（SCENE_VIDEO 里值是字符串路径的那些）永远免费可看，不受此限制

   本文件只负责"状态"和"要不要弹付费墙"，不负责真的收钱——
   真的收钱、验证订单是 payments.js 的事，两个文件通过 Membership.setPremium() 对接：
   payments.js 确认某个平台的购买/订阅真实有效后，调用 Membership.setPremium(过期时间, 来源)，
   这里就会记住会员状态并刷新界面。

   ⚠️ 本地用 localStorage 记录会员状态只是离线兜底，不能防破解——正式上线后，
   会员状态的"最终依据"应该是后端数据库里、经过官方收据校验过的记录，
   App 启动时应该去问后端"我现在是不是会员"，而不是只信任本地缓存。
   这块后端校验逻辑的参考实现见 /backend-reference/。
================================================================= */
const Membership = (function(){
  const STORAGE_KEY = 'nightwindow_membership_v1';

  // ---- 开发调试用：在浏览器控制台里执行 __setPremiumForTesting(true) / (false)
  //      就能不接真实支付，先把整套付费墙+解锁流程走一遍。
  //
  //      ⚠️ 真实business风险（审出来的）：这段代码本身会原样打包进正式发布的 App 里，
  //      JS 源码在 WebView 里是可以被任何人读到的（哪怕不是"黑客"，随便搜"眠窗 解锁会员"
  //      都可能搜到有人分享"控制台粘贴这行代码就能白嫖会员"）。之前的写法没有任何限制，
  //      相当于给所有真实用户发了一把永久免费解锁的万能钥匙，且零技术门槛。
  //      下面加一道"只在非原生环境（网页预览/开发调试）下才生效"的限制，让 __setPremiumForTesting
  //      这个好记名字的入口在正式 App 里失效。
  //      ⚠️ 互查时发现、必须说清楚这道限制实际防住了什么、没防住什么：这只挡住了"调用这个
  //      好记名字的测试入口"这一种最简单的白嫖方式。它挡不住直接调用下面真正改状态的
  //      setPremium(expiresAt, source) / clearPremium()——这两个函数是 Membership 对象
  //      公开返回的真实方法，本身没有任何环境检查，任何能在这个 WebView 里执行JS的人
  //      （重打包的 APK、开了远程调试的测试版等）依然可以直接调 Membership.setPremium(...)
  //      拿到永久会员，只是需要知道/猜到真实函数名而不是众所周知的调试入口名字，
  //      门槛比以前高了一点，但不是真正堵死了这个口子。真正堵死它必须依赖服务端校验
  //      （本地状态只是离线缓存，不是真相来源——见文件顶部注释和 /backend-reference/），
  //      这正是现在的 Firebase webhook（functions/index.js）将来要承担、但目前还没有
  //      "查询接口"给前端用来对照验证本地状态的部分。
  window.__setPremiumForTesting = function(on){
    if(typeof isNativeApp==='function' && isNativeApp()){
      console.warn('[Membership] __setPremiumForTesting 在正式 App 环境下已禁用，仅限网页开发调试使用');
      return;
    }
    if(on){ setPremium(Date.now()+365*24*3600*1000, 'debug'); console.log('[Membership] 已模拟为会员，仅用于本地测试'); }
    else { clearPremium(); console.log('[Membership] 已清除会员状态'); }
  };

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return {isPremium:false, expiresAt:null, source:null};
      return JSON.parse(raw);
    }catch(e){ return {isPremium:false, expiresAt:null, source:null}; }
  }
  let state = load();

  function persist(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function isPremium(){
    if(!state.isPremium) return false;
    if(state.expiresAt && Date.now() > state.expiresAt) return false; // 本地兜底的过期判断
    return true;
  }

  function setPremium(expiresAt, source){
    state = {isPremium:true, expiresAt:expiresAt||null, source:source||'unknown'};
    persist();
    renderBadge();
    document.dispatchEvent(new CustomEvent('membership-changed', {detail:state}));
  }

  function clearPremium(){
    state = {isPremium:false, expiresAt:null, source:null};
    persist();
    renderBadge();
    document.dispatchEvent(new CustomEvent('membership-changed', {detail:state}));
  }

  function renderBadge(){
    const el = document.getElementById('memberBadge');
    if(el) el.style.display = isPremium() ? 'inline-flex' : 'none';
  }

  // ---- 付费墙弹窗 ----
  let pendingSceneId = null;

  function promptUpgrade(sceneId){
    if(typeof window.ConversionStats!=='undefined') window.ConversionStats.bump('paywallOpenedTotal');
    pendingSceneId = sceneId;
    // 非场景类内部 id（如 isoToggle）没有 scene_<id> 文案键，要映射到该功能自己的本地化名称键；
    // 声音/场景 id 走 sceneLabel——和声音行渲染（index.html addSoundRow）同一套机制，25 语言都本地化
    const FEATURE_NAME_KEYS = { isoToggle:'isoToggleTitle' };
    // ⚠️ 真实bug修复：i18n.js 里的 I18N 是用 const 声明的顶层绑定，不会挂到 window 上，
    // 原来写 window.I18N 永远是 undefined，于是这里一直回退到裸 sceneId——
    // 用户看到的付费墙标题就是「downpour」这种内部 id（截图里已经暴露过）。
    // 判断"有没有加载到 i18n"必须用 typeof 检测，不能用 window.I18N。
    const hasI18N = (typeof I18N !== 'undefined' && I18N && typeof I18N.sceneLabel === 'function');
    const label = hasI18N
      ? (FEATURE_NAME_KEYS[sceneId] ? I18N.t(FEATURE_NAME_KEYS[sceneId]) : I18N.sceneLabel(sceneId))
      : sceneId;
    const nameEl = document.getElementById('paywallSceneName');
    if(nameEl) nameEl.textContent = label;
    // 正常"场景被锁住"的入口，恢复显示场景文案、隐藏买断专用文案（买断入口见 index.html 的 openBuyoutPaywall）
    const sceneBody = document.getElementById('paywallSceneBody');
    const buyoutBody = document.getElementById('paywallBuyoutBody');
    if(sceneBody) sceneBody.style.display='';
    if(buyoutBody) buyoutBody.style.display='none';
    if(typeof window.renderPlanList==='function') window.renderPlanList();
    // 真实画面预览：不用蒙层猜画面，直接给用户看真实的会员画面长什么样——
    // 目的是让"点进去之后真的值了"，不要让用户靠想象/宣传图做购买决定，买完才发现不是想的那样
    if(typeof window.setPaywallPreview==='function') window.setPaywallPreview(sceneId);
    const modal = document.getElementById('paywallModal');
    if(modal) modal.classList.add('show');
  }
  function hidePaywall(){
    const modal = document.getElementById('paywallModal');
    if(modal) modal.classList.remove('show');
    const preview = document.getElementById('paywallPreviewVideo');
    if(preview){ try{ preview.pause(); preview.removeAttribute('src'); preview.load(); }catch(e){} }
    pendingSceneId = null;
  }
  function getPendingScene(){ return pendingSceneId; }
  // 'monthly' / 'yearly' / 'lifetime' / 'debug' / null —— 买断提醒、会员管理面板都要靠这个字段
  // 判断"这个人是订阅制还是已经买断"，不额外存一份状态，直接读 setPremium() 时传入的来源
  function getSource(){ return state.source; }
  // 续费到期时间——用于到期前提醒（RenewalReminder），减少"没收到续费提醒，续费失败/被动过期"类投诉
  function getExpiresAt(){ return state.expiresAt; }

  return {
    isPremium, setPremium, clearPremium, renderBadge,
    promptUpgrade, hidePaywall, getPendingScene, getSource, getExpiresAt
  };
})();
