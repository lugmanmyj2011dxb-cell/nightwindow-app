/* ===================== 眠窗 · 会员定价配置 =====================
   这里的数字是"建议售价"，用于付费墙界面展示 —— 真正生效的价格，
   还需要你去 App Store Connect / Google Play Console / 微信支付后台
   分别配置一遍（两个应用商店会按当地购买力自动折算成其他货币，
   不需要你把全世界每个国家的价格都手动填一遍，选一个"价格等级"即可）。

   ⚠️ 2026-10-03 定价全面调整（"商业定价与策略最终方案"，钻石档当时未动；2026-10-14 钻石档已由 $999 下调为 $600，原因见下面 PRICING.diamond 的注释）：
   这次改的是定价的"角色分工"逻辑，不再是单纯"月付×12打折"：
     - 月付 $8.99/月，无试用，直接扣款——这档现在的角色是"价格锚点"：故意定得
       不便宜，不是真指望很多人长期按月付，而是让年付的折扣看起来极有性价比，
       把大多数用户的选择推向年付。
     - 年付 $49.99/年（主推"MOST POPULAR"），配 3 天免费试用（试用期后自动按
       $49.99扣费）。折合$4.17/月，比月付省53%——这是营收主力，3天试用期是为了
       让用户至少有2~3个真实的夜晚体验助臥效果，不是1天（24小时）那种"还没来得
       及用就被扣款"的短窗口，用来降低因试用期太短导致的批量差评/恶意退款/平台
       "诱导订阅"合规风险。
     - 终身 $199.99 一次性买断，回本周期约4.25年（对应长期HD视频CDN带宽成本），
       拉长回本周期是为了让终身用户的长期边缘流量成本不会把这档的LTV拖成负数，
       同时给黑五大促这类场合留出降价空间（例如降到$149.99）。
     - 3天试用需要在 App Store Connect / Play Console 后台把试用天数从7天改成3天
       勾选启用，不需要写代码；下面付费墙里展示试用说明的文案（i18n.js 的
       planTrialNote/planTrialNoteExplicit）已经同步改成"3天"。

   以下是更早几轮定价留下的历史背景，倍数关系已经不完全对应当前数字，但调价
   思路（参照Endel/Calm等同类App的终身:年付倍数）仍然有参考价值，先保留：
     - 终身 ≈ 年付的 4 倍左右，参考了同类"工具型"App Endel（终身是年付的2～2.5倍，但Endel有
       实时生成式AI+音乐人IP合作撑得起更高倍数）和"内容库型"App Calm（终身是年付的约7倍，
       靠海量内容库+真人课程撑着）——眠窗现在的音效技术和品牌积累都还够不上这两家，
       所以倍数落在中间，没有在自己还没攒够内容/品牌积累的时候硬跟内容库型App拼价格

   人民币/新元价格用于"大陆微信支付宝渠道"和"网页 Stripe 渠道"的展示。其中 cny 已按
   App Store Connect 实际生效的地区价校准（2026-11-07），sgd 仍是粗略参考值，上线前
   需按当时汇率与心理价位核对，不要直接照抄。

   ⚠️ 不建议直接全量上线这轮新价格——iOS 和 Android 后台都支持"价格实验"
   （一部分用户看旧价、一部分看新价，跑一两周比转化率和总收入），先用这个做 A/B
   测试验证真实转化数据，而不是凭感觉一次性切换全部用户，这样出问题也能随时切回去。

   ⚠️ 钻石💎版（第四档，面向完全不在乎价格、只在乎"专属感"的高净值用户，全球统一
   上架，不是地区限定价）2026-10-03 那次调价没动它，2026-10-14 已由 $999 下调为 $600（原因见 PRICING.diamond 的注释）——地区定价在Apple/Google后台只能精确到
   "国家/地区商店"，没法精确到城市/人群，所以想精准触达"迪拜/纽约/伦敦的富豪"这批
   人，更现实的办法不是把整个美国/英国商店的价格都抬高（会误伤这两个主力市场里的
   普通用户），而是像这样全球统一放出一档高价选项，让真正不在乎钱的人自己选进来，
   普通用户完全不受影响，该买年付/终身还是原价。
   这一档必须有真实的差异化权益，不能只是"同样的东西标个更贵的价格"——否则
   对价格最敏感、也最反感被割的这批用户来说，一眼就能看穿是套路，口碑风险比
   不做还大。现在先上线"零/低开发成本"就能兑现的权益（见 diamondPerks 列表），
   独家专属场景内容以后视真实购买情况再投入，不先为一个还没验证的假设做内容。
================================================================= */
const PRICING = {
  // ⚠️ 2026-11-07 校正：cny 字段以前是"按旧汇率粗略拍的参考价"，跟 App Store 中国区
  // 实际扣款金额差得很远（年付展示¥168、商店实际扣¥328），用户看到的价和账单不一致，
  // 属于 Guideline 3.1.2 最容易踩的坑。现在这里的数字全部改用 App Store Connect 里
  // 实际生效的地区价（2026-11-07 通过 ASC API 核对）：月付 ¥58 / 年付 ¥328 /
  // 终身 ¥1298 / 钻石 ¥3998 / 升级 ¥998。以后在后台改价，这里必须同步改。
  monthly:  { productId:'nightwindow_monthly',  usd:8.99,  cny:58,   sgd:11.9 },
  yearly:   { productId:'nightwindow_yearly',   usd:49.99, cny:328,  sgd:64.9, monthlyEquivUsd:4.17, savePct:53 },
  lifetime: { productId:'nightwindow_lifetime', usd:199.99, cny:1298, sgd:268 },
  // ⚠️ 2026-10-14 调价（原定 usd:999 降为 600），两个原因：
  // ① 技术硬约束：$999 正好顶到 Google Play 的各国价格上限——多数国家上限是 US$999.99，
  //    而"把上限提高到 US$8,000"只对年收入≥100万美元的开发者开放，个人开发者申请不到；
  //    韩国更是硬性固定 US$400（改不了）。所以 $999 会让丹麦、乌克兰、乌兹别克斯坦、乌干达
  //    等一批国家直接报"价格必须介于 X 和 Y 之间"，后台得逐国手动剔除，维护成本高。
  // ② 定价心理：$500 以上的高档位适合用整数价（prestige pricing）表达"不靠价格把戏"；
  //    "9 结尾"的 charm pricing 是大众市场打法，放在钻石档这种奢侈语境里反而像在玩心理定价。
  // 降为 $600 后，各国上限内都有余量（如乌克兰约为上限的 81%、丹麦约 72%）。
  diamond:  { productId:'nightwindow_diamond',  usd:600,   cny:3998, sgd:799 },
  // ⚠️ 2026-10-03 新增"年付→终身补差价升级"（对应定价策略文档"方案一：补差价升级"）：
  // 算法是用户自己给的——终身价$199.99减去年付已付的$49.99≈$150，取整成$149.99，
  // 比直接原价买终身省$50，用来在用户快续费/想取消的那一刻，把"再交一次全款"的抵触感
  // 降下来。只对"当前是真实年付会员"的人生效（见index.html的renderPlanList()里
  // eligibleForUpgradeDiscount的判断），不是对所有人开放的隐藏折扣。
  // ⚠️ 诚实限制，这一点非常重要：下面这个productId现在还只是"写好了逻辑等着用"，
  // 在App Store Connect / Google Play Console后台**还没有**对应的真实商品——必须先
  // 在两边后台都新建一个ID叫nightwindow_lifetime_upgrade_from_yearly、价格设成$149.99
  // 的商品，并且在RevenueCat后台把它关联到跟nightwindow_monthly/yearly/lifetime
  // 共用的那个"premium"entitlement上（注意：这个App里只有'premium'和'diamond'两个
  // entitlement，并没有单独的"lifetime"entitlement——月付/年付/终身都是共享'premium'，
  // 客户端是靠productId而不是entitlement来区分到底是哪个档位的，见payments.js里的
  // sourceFromProductId()）。如果误关联成别的/不存在的entitlement，买了这个折扣价商品，
  // Membership.setPremium()收到的权益判定会对不上，这几步都是店铺后台配置，这个代码环境
  // 没有权限/API能帮你
  // 配置，必须你自己上线前去配置好，不然用户点"补差价升级"会直接购买失败（Payments.purchase()
  // 会抛错，不会误扣款，但也买不到）。
  lifetimeUpgradeFromYearly: { productId:'nightwindow_lifetime_upgrade_from_yearly', usd:149.99, cny:998, sgd:199 }
};

// ⚠️ 真实bug防护：购买是异步的（等StoreKit/Google Play弹出原生支付面板、等用户输入密码/
// FaceID、等回调），这中间用户很容易因为"点了好像没反应"而再点一次，甚至是在人多手滑/网络卡顿
// 时连续点同一个或不同的价位选项——不加防护的话，`Payments.purchase()` 可能被并发调用两次，
// 对应到真实支付SDK接入后，有概率变成"被扣两次钱"或者两个原生支付弹窗叠在一起、用户不知道该
// 处理哪一个。用一个模块级的锁，购买进行中禁用所有价位选项的点击，不管点哪个按钮都不会叠加。
let purchaseInFlight = false;

// ⚠️ 真实bug修复：Membership.setPremium() 是无条件覆盖当前会员状态的（见 membership.js），
// 购买流程本身也从来没检查过"要买的这个档位，是不是反而比我现在已经有的档位低"。
// 实际会发生的事：一个已经是钻石💎会员的用户，手滑点了"月付"——真的被扣了月付的钱，
// 然后 setPremium() 直接把他的身份从 diamond 覆盖成 monthly，钻石的所有权益瞬间消失，
// 30天后这个身份还会过期变回免费用户。用户是在"已经花了$600"之后，又被扣一笔新钱
// 导致自己被降级的，这种情况申诉/退款/差评的风险极高，必须在真正调用付费SDK之前挡住。
// ⚠️ 真实bug修复（互查时发现）：月付和年付之前给的是同一个等级（都是1），导致月付会员
// 点"年付"升级时，targetRank(1) <= currentRank(1) 成立，被误判成"降级"直接拦掉弹窗提示——
// 年付升级恰恰是转化策略里最想促成的那一步（见上面定价逻辑的注释），被这个判断堵死了。
// 月付和年付必须是不同等级，年付排在月付之上，才能让"月付→年付"正常放行，
// 同时"年付→月付"依然会被正确拦住（targetRank(1) <= currentRank(2) 成立）。
const TIER_RANK = { monthly:1, yearly:2, lifetime:3, diamond:4 };
function isDowngradePurchase(targetPlan){
  if(typeof Membership==='undefined' || !Membership.isPremium()) return false;
  const currentSource = Membership.getSource ? Membership.getSource() : null;
  const currentRank = TIER_RANK[currentSource] || 0;
  const targetRank = TIER_RANK[targetPlan] || 0;
  return targetRank <= currentRank;
}
// 判断 RevenueCat/平台返回的错误是不是"降级购买被拒"。
// 场景：用户取消了年付的自动续费，但权益还在有效期内；此时本地 Membership 状态可能已过期
// （isPremium() 返回 false），导致 isDowngradePurchase() 没拦住，请求打到平台被拒。
// 不同平台/语言的报错文案不同，这里按关键词匹配，命中即视为降级错误。
function isDowngradeError(err){
  if(!err) return false;
  const msg = (err.message || err.toString() || '').toLowerCase();
  const code = err.code ? String(err.code) : '';
  const downgradeKeywords = [
    '档位', '更高', '失去现有的权益', '降级',
    'already have a higher', 'higher tier', 'downgrade',
    'existing entitlement', 'already subscribed'
  ];
  if(downgradeKeywords.some(k => msg.includes(k.toLowerCase()))) return true;
  // RevenueCat 在安卓上对降级场景可能返回 PURCHASE_INVALID_ERROR，
  // 但这个码也可能涵盖其他购买失败，所以只在文案也含降级信号时才认定。
  if(code === 'PURCHASE_INVALID_ERROR' && /tier|entitlement|higher|existing|subscription/.test(msg)) return true;
  return false;
}

function currentCurrency(){
  // zh-CN 语言环境默认展示人民币（对应大陆微信/支付宝渠道），其余语言展示美元参考价
  // 实际价格最终以用户所在 App Store / Google Play 地区商店显示的为准，这里只是付费墙的展示逻辑
  return (I18N.getLang()==='zh-CN') ? 'cny' : 'usd';
}
function currencySymbol(code){ return code==='cny' ? '¥' : (code==='sgd' ? 'S$' : '$'); }

function renderPlanList(){
  const el = document.getElementById('planList');
  if(!el) return;
  const cur = currentCurrency();
  const sym = currencySymbol(cur);
  // 续费/试用价格说明：同类App被投诉最多的"隐藏费用"类问题就是这句话写得太含糊——
  // 原来只写"年付享7天免费试用"，完全没告诉用户试用结束后会自动按年付价格扣费、也没写具体金额，
  // 用户当时心里的预期是"先试试看"，真正扣费那天却毫无预兆，于是去应用商店写"骗我订阅"的差评或申诉退款。
  // 这里把试用结束后"会自动续费"+"具体多少钱"都提前写死在同一句话里，不管用户有没有仔细看，
  // 至少这句话本身不构成误导。
  // ⚠️ 位置问题（审查时专门挑出来的）：这句话以前是页面上单独一个固定元素，摆在"年付/月付/终身"
  // 三个选项下面、三个选项外面，视觉上像是对整份付费墙的通用说明，容易让人误以为也适用于月付/
  // 终身（它们根本没有试用，也不该被这句话影响）。现在改成直接拼在"年付"这个选项卡自己内部、
  // 紧跟在年付价格下面，视觉上明确只属于年付，月付/终身两个选项卡里完全不出现这句话。
  const trialNoteHtml = I18N.t('planTrialNoteExplicit')
    .replace('{price}', sym + PRICING.yearly[cur])
    .replace('{period}', I18N.t('perYearShort'));
  // ⚠️ "年付→终身补差价升级"：只对真实年付会员生效（见PRICING.lifetimeUpgradeFromYearly顶部
  // 的详细说明），不是对所有人开放的隐藏折扣——所以这里不是另外加一行"终身"选项，是让
  // 本来就存在的那一行"终身"在满足条件时，直接显示折扣价+改用折扣商品ID，付费墙的卡片结构
  // 完全不变，继续走下面同一套 el.querySelectorAll('.plan-option') 购买逻辑（降级保护、
  // "记得去取消旧订阅"提醒等等全部沿用，不用重新实现一遍）。
  const eligibleForUpgradeDiscount = (typeof Membership!=='undefined') && Membership.isPremium() && Membership.getSource()==='yearly';
  const lifetimeCfg = eligibleForUpgradeDiscount ? PRICING.lifetimeUpgradeFromYearly : PRICING.lifetime;
  const lifetimeBadgeHtml = eligibleForUpgradeDiscount
    ? `<div class="badge" data-i18n="lifetimeUpgradeBadge">补差价升级 · 限时</div>`
    : '';
  const lifetimeNoteHtml = eligibleForUpgradeDiscount
    ? `<div class="trial-note" id="planLifetimeUpgradeNote">${I18N.t('lifetimeUpgradeNote').replace('{price}', sym+lifetimeCfg[cur])}</div>`
    : '';
  el.innerHTML = `
    <div class="plan-option recommended" data-plan="yearly" data-product="${PRICING.yearly.productId}">
      <div class="plan-option-row">
        <div>
          <div class="badge" data-i18n="planRecommended">推荐 · 更划算</div>
          <div class="plan-name" data-i18n="planYearly">年付</div>
          <div class="plan-sub">${sym}${(cur==='cny'? (PRICING.yearly.cny/12).toFixed(1) : PRICING.yearly.monthlyEquivUsd)}<span data-i18n="perMonthShort">/月</span></div>
          <div class="plan-sub plan-anchor">${sym}${(cur==='cny'? (PRICING.yearly.cny/365).toFixed(1) : (PRICING.yearly.usd/365).toFixed(2))}<span data-i18n="perDayShort">/天</span> · ${I18N.t('yearlySaveAnchor').replace('{pct}','53')}</div>
        </div>
        <div class="plan-price">${sym}${PRICING.yearly[cur]}<small data-i18n="perYearShort">/年</small></div>
      </div>
      <div class="trial-note" id="planTrialNote">${trialNoteHtml}</div>
    </div>
    <div class="plan-option" data-plan="monthly" data-product="${PRICING.monthly.productId}">
      <div><div class="plan-name" data-i18n="planMonthly">月付</div></div>
      <div class="plan-price">${sym}${PRICING.monthly[cur]}<small data-i18n="perMonthShort">/月</small></div>
    </div>
    <div class="plan-option" data-plan="lifetime" data-product="${lifetimeCfg.productId}">
      <div class="plan-option-row">
        <div>
          ${lifetimeBadgeHtml}
          <div class="plan-name" data-i18n="planLifetime">终身</div>
        </div>
        <div class="plan-price">${sym}${lifetimeCfg[cur]}<small data-i18n="oneTime">一次性</small></div>
      </div>
      ${lifetimeNoteHtml}
    </div>
    <a href="#" class="diamond-expand-toggle" data-i18n="diamondExpandToggle">查看全部权益 ▾</a>
    <div class="diamond-expand-body" style="display:none">
    <div class="plan-option diamond-tier" data-plan="diamond" data-product="${PRICING.diamond.productId}">
      <div class="plan-option-row">
        <div>
          <div class="badge" data-i18n="planDiamondBadge">💎 钻石</div>
          <div class="plan-name" data-i18n="planDiamond">钻石💎版</div>
        </div>
        <div class="plan-price">${sym}${PRICING.diamond[cur]}<small data-i18n="oneTime">一次性</small></div>
      </div>
      <div class="diamond-perks" data-i18n="diamondPerksTeaser">专属主题 · 独家音效 · 创始人直通 · 还有更多</div>
      <!-- currentCurrency() 只按语言环境决定展示人民币还是美元做参考，和用户App Store/Google Play
           账号实际注册的地区商店可能不是一回事——其他三档价格不大，地区差价通常只有几美元，
           但钻石版$600这个量级，万一账号注册地区和界面语言对不上，最终扣款可能和这里看到的
           数字差出几十到上百美元，必须提前说清楚，不能让用户扣完款才发现不一样 -->
      <div class="diamond-price-disclaimer" data-i18n="diamondPriceDisclaimer">最终扣款金额以你的 App Store / Google Play 账号所在地区商店为准，可能与此处展示价格不同</div>
      <!-- ⚠️ 合规+原则要求（苹果Guideline 3.1.2 + 我们自己"明明白白"的原则）：
           花600美元买的是什么，必须在用户点"购买"之前就能看全，不能藏起来或者只写一句模糊的话。
           这里用一个可展开的完整权益列表，默认收起（不占地方），但点一下就能看到全部9条，
           不是点了购买之后才知道，也不是要跳转到别的页面才能看到。 -->
      <a href="#" class="diamond-detail-toggle" data-i18n="diamondDetailToggle">查看全部钻石权益 ▾</a>
      <ul class="diamond-detail-list" style="display:none"></ul>
    </div>
    </div>
  `;
  // 钻石档默认折叠在"查看全部权益"后面（付费墙只保留年付/月付/终身三档在明面上），
  // 点开才显示，不默认占位；展开/收起不影响里面已有的购买与权益列表逻辑
  const expandToggle = el.querySelector('.diamond-expand-toggle');
  const expandBody = el.querySelector('.diamond-expand-body');
  if(expandToggle && expandBody){
    expandToggle.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const opening = expandBody.style.display === 'none';
      expandBody.style.display = opening ? 'block' : 'none';
      expandToggle.textContent = I18N.t(opening ? 'diamondExpandToggleOpen' : 'diamondExpandToggle');
    });
  }
  // 展开/收起完整权益列表——必须 stopPropagation，不然点这个链接会被当成"点了钻石选项"直接触发购买
  const toggleEl = el.querySelector('.diamond-detail-toggle');
  const listEl = el.querySelector('.diamond-detail-list');
  if(toggleEl){
    toggleEl.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const opening = listEl.style.display === 'none';
      listEl.style.display = opening ? 'block' : 'none';
      if(opening){
        const items = I18N.t('diamondPerksList');
        // diamondPerksList 是用 '\n' 分隔的多条权益文案（见 i18n.js），不是普通的单句翻译
        listEl.innerHTML = String(items).split('\n').map(line=>`<li>${line}</li>`).join('');
      }
      toggleEl.textContent = I18N.t(opening ? 'diamondDetailToggleOpen' : 'diamondDetailToggle');
    });
  }
  // ⚠️ 真实bug修复：展开权益列表后，用户点列表里任意一行文字（这是UI明确引导用户做的事——
  // 让他点开"查看全部钻石权益"、认真读一遍再决定要不要买）都会冒泡到整张卡片的click监听
  // （下面 el.querySelectorAll('.plan-option') 那段），变成"只是想看清楚权益，结果不小心
  // 真的下单付了600美元"。stopPropagation 必须加在列表本身，不能只加在toggle链接上。
  if(listEl){
    listEl.addEventListener('click', (e)=>{ e.stopPropagation(); });
  }
  el.querySelectorAll('.plan-option').forEach(opt=>{
    opt.addEventListener('click', async ()=>{
      if(purchaseInFlight) return; // 见上面 purchaseInFlight 的注释：购买进行中，任何价位选项的点击都先忽略
      purchaseInFlight = true;
      el.querySelectorAll('.plan-option').forEach(o=>o.classList.add('disabled')); // 视觉上也禁用，不能让用户以为没反应又去点别的
      if(typeof window.ConversionStats!=='undefined') window.ConversionStats.bump('planOptionClicked_'+opt.dataset.plan);
      // 降级保护：已经是更高档会员时，不静默允许再花钱买一个更低的档位——见上面 isDowngradePurchase 的注释
      if(isDowngradePurchase(opt.dataset.plan)){
        alert(I18N.t('downgradePurchaseBlocked'));
        purchaseInFlight = false;
        el.querySelectorAll('.plan-option').forEach(o=>o.classList.remove('disabled'));
        return;
      }
      const productId = opt.dataset.product;
      try{
        // 买断前先记一下"买之前是不是订阅制会员"、以及具体是哪个档位——苹果/Google 不会因为
        // 你买了"终身"或升级到另一个订阅档位，就自动帮你取消原来那笔订阅，这两笔订单在平台
        // 那边是完全独立的，除非后台把它们配置成同一个订阅分组内的"换购"（这个App目前的购买
        // 代码没有传递安卓的"换购"参数，见下面 ⚠️ 真实bug修复的说明）。不提醒的话，用户会在
        // 买完之后还继续被旧订阅扣费，这是看起来"多收了钱"但其实是用户自己没取消旧订阅导致的
        // 投诉，务必在新订单成功的那一刻就提醒，不要等客服介入。
        const previousSource = (typeof Membership!=='undefined') ? Membership.getSource() : null;
        const wasSubscriber = (typeof Membership!=='undefined') && Membership.isPremium()
          && previousSource && previousSource!=='lifetime' && previousSource!=='diamond';
        // ⚠️ 真实bug修复（这次"互查"新发现、直接关系到钱的问题）：之前这条"记得去取消旧订阅"
        // 的提醒只在买"终身"或"钻石"的时候才弹出来（下面原来的条件是
        // `opt.dataset.plan==='lifetime' || opt.dataset.plan==='diamond'`）。但"月付升级到
        // 年付"同样会创建一笔新的、独立的订单——Google Play/App Store 不会因为这是"升级"就
        // 自动帮用户取消旧的月付订阅（除非后台把月付/年付配置成同一个订阅分组下的"base plan"，
        // 且客户端购买时显式传递了"换购(product change)"参数，而 revenueCatAdapter.purchase()
        // 目前调用 purchasePackage()/purchaseStoreProduct() 时都没有传这个参数，见
        // REVENUECAT_SETUP.md 待办）。结果就是：一个月付会员点"升级到年付"之后，完全可能同时
        // 背着两笔在扣费的订阅（月付$8.99/月 + 年付$49.99/年）却毫不知情，直到对账单上发现
        // 多扣了钱——这正是用户最担心的"升级后反而不公平地多花钱"这类风险，只是方向和"白嫖"
        // 相反（这次是用户自己被多收费，不是平台/开发者被白嫖）。修法：把判断条件从"只看买的是
        // 不是终身/钻石"改成"只要之前是订阅制会员、且这次买的档位和之前不一样，就提醒"，
        // 这样月付→年付这条路径也会被覆盖到，不再是只提醒买断/钻石这两种情况。
        const planChanged = wasSubscriber && opt.dataset.plan !== previousSource;
        // Payments.purchase() 内部（见 payments.js 的 revenueCatAdapter）在拿到平台真实校验
        // 结果之后，已经自己调用了 Membership.setPremium()——这里不再需要、也不应该自己猜测
        // 到期时间再调一次 setPremium()，猜测值（比如年付精确剩几天、免费试用天数）很容易跟
        // 平台真实返回的不一致，真相来源必须是 Payments.purchase() 返回的结果。
        await Payments.purchase(productId);
        Membership.hidePaywall();
        // ⚠️ 真实bug修复（互查时发现）：这里以前在购买成功后自己又调了一次
        // `currentVideoScene=null; updateVideoLayer(currentScene);`——但 Payments.purchase()
        // 内部已经调用了 Membership.setPremium()，setPremium() 会同步派发 'membership-changed'
        // 事件，index.html 里监听这个事件的代码已经做了同样的两行操作。结果就是购买成功的
        // 那一刻，视频层被连续刷新两次，造成刚解锁的画面闪一下/重新加载一次，而且是正好在
        // "购买成功应该最有成就感"的那个瞬间，体验上很扎眼。现在不在这里重复做，交给
        // membership-changed 的监听统一处理，两处只保留一处。
        if(typeof refreshLockIcons==='function') refreshLockIcons();
        if(typeof renderDiamondPresets==='function') renderDiamondPresets(); // 买完钻石版/从钻石版降级后，专属配方区块要立刻跟着显示/隐藏
        if(planChanged && typeof showActionBanner==='function'){
          // 买断/钻石用"买断成功"的措辞(lifetimeCancelSubReminder)，其余的订阅间切换
          // (比如月付→年付)用更准确的"订阅升级成功"措辞(subscriptionUpgradeCancelOldReminder)，
          // 不能对一次订阅升级显示"买断成功"这种文案上就说不通的提示。
          const isBuyout = (opt.dataset.plan==='lifetime' || opt.dataset.plan==='diamond');
          showActionBanner(
            I18N.t(isBuyout ? 'lifetimeCancelSubReminder' : 'subscriptionUpgradeCancelOldReminder'),
            I18N.t('manageBadgeOpenStore'),
            ()=>{ if(typeof openStoreSubscriptionSettings==='function') openStoreSubscriptionSettings(); }
          );
        }
      }catch(err){
        // 用户自己在系统购买弹窗里点"取消"，payments.js 会抛出 message==='CANCELLED' 的错误——
        // 这是正常操作，不是故障，不应该弹一个"出错了"的提示吓用户，静默忽略即可。
        if(err && err.message === 'CANCELLED'){
          // 什么都不做
        }else if(isDowngradeError(err)){
          // 降级购买被平台拦截：当前本地状态可能已过期（比如用户取消了自动续费但权益还在有效期），
          // RevenueCat/Google Play 会拒绝向更低档位的购买。用友好文案替代平台的原始报错。
          alert(I18N.t('downgradePurchaseBlocked'));
        }else{
          alert(err.message || String(err));
        }
      } finally {
        purchaseInFlight = false;
        el.querySelectorAll('.plan-option').forEach(o=>o.classList.remove('disabled'));
      }
    });
  });
  // ⚠️ 真实bug修复（死循环导致栈溢出崩溃）：这里原来写的是全局的 I18N.applyToDOM()，
  // 但 applyToDOM() 末尾会调用 window.onLanguageChanged()，而 onLanguageChanged() 只要看到
  // 付费墙是打开状态，就会再调用一次 renderPlanList()——renderPlanList() 末尾又调用
  // I18N.applyToDOM()，三者首尾相接形成死循环：只要在付费墙打开时切换语言，就会一路递归到
  // "Maximum call stack size exceeded"，整个页面当场崩掉。用无头浏览器模拟"开付费墙+切语言"
  // 这个操作组合时实测触发，之前没人发现是因为没人测过这个组合操作。
  // 修法：renderPlanList() 自己只翻译自己刚生成的这几个新节点（el 内部），不调用会触发
  // onLanguageChanged() 的全局 applyToDOM()，链路从源头断开，不需要再给 onLanguageChanged()
  // 加防重入锁那种更绕的修法。
  el.querySelectorAll('[data-i18n]').forEach(e=>{ e.textContent = I18N.t(e.getAttribute('data-i18n')); });
  el.querySelectorAll('[data-i18n-aria]').forEach(e=>{ e.setAttribute('aria-label', I18N.t(e.getAttribute('data-i18n-aria'))); });
}
window.onPlanListNeedsRender = renderPlanList; // 语言切换/打开付费墙时调用
