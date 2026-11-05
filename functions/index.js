/* ===================== 眠窗 · RevenueCat Webhook 接收端 =====================

   这个函数做的事很简单：RevenueCat 那边每次有购买/续费/取消/过期等事件，会发一个 HTTP POST
   请求过来，这个函数负责："这真的是 RevenueCat 发的吗？" → 校验通过后，把会员状态写进
   Firestore 的 memberships 这张表，key 是 RevenueCat 的 app_user_id。

   为什么要这一步（前端不是已经能直接从 RevenueCat SDK 读到会员状态了吗）：
     1. 以后接账号系统（见 /backend-reference/accounts-design.md）时，后端需要一份"独立于
        用户当前设备"的会员记录——用户换了新手机、卸载重装，前端本地状态没了，但只要后端这份
        记录还在，重新登录账号后台就能恢复，不用依赖"这台设备还留着 RevenueCat 的本地缓存"
     2. 大陆版/官网版以后如果也要认"这个人是不是会员"，不能指望大陆网络环境下顺畅地直接
        连 RevenueCat/Firebase 的 SDK，由你自己的后端统一出一个"是不是会员"的查询接口更可靠
     3. 客服处理"我明明付了钱但显示没会员"这类投诉时，有一份服务端记录可以核对，不用非得
        让用户发截图

   现阶段（还没做账号系统）：这份 Firestore 记录暂时还没有谁在查询它，纯粹是先把数据存起来，
   不影响 App 现在的购买流程——App 现在的会员状态判断，走的是 payments.js 里直接调用
   RevenueCat SDK 本地查询，不依赖这个函数。等账号系统做起来了，再加一个"查询会员状态"的
   函数，读这里存的数据。

   ===================== 部署前要做的事 =====================
   这些步骤需要在你自己能上网的电脑上完成，这个云端环境没法替你跑：
     1. 装 Firebase CLI：npm install -g firebase-tools
     2. firebase login，然后在项目根目录（不是 functions/ 目录里）跑 firebase use --add
        （会列出你账号下的 Firebase 项目，选一个，没有的话先去 console.firebase.google.com 新建一个）
        ⚠️ 不要跑 firebase init——它会提示"要不要覆盖 firebase.json / firestore.rules /
        functions/index.js 这些已经写好的文件"，一旦手滑选了覆盖，这些内容就没了。
        firebase use --add 只是把本地项目和你的 Firebase 项目关联起来，不会动任何已有文件，
        这一步做完会自动生成一个 .firebaserc。（这一条和仓库根目录 REVENUECAT_SETUP.md
        第五部分保持一致，两份文档以前这里写得不一样，已经改成一致的了。）
     3. 去 Firebase 控制台（console.firebase.google.com），确认这个项目的 Firestore
        数据库已经建好（原生模式，不是实时数据库）
     4. 在下面 WEBHOOK_SHARED_SECRET 这一行，换成你自己随便生成的一长串随机字符串
        （比如用 `openssl rand -hex 32` 生成），不要用示例里这个
     5. 部署：cd functions && npm install && cd .. && firebase deploy --only functions,firestore:rules
        部署成功后，终端会打印出这个函数的 URL（形如
        https://us-central1-你的项目id.cloudfunctions.net/revenueCatWebhook）
     6. 去 RevenueCat 后台 → Project Settings → Integrations → Webhooks，
        把上一步的 URL 填进去，Authorization header 那一栏填你在第4步生成的同一串密钥
================================================================= */
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAppCheck } = require('firebase-admin/app-check');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();
const appCheck = getAppCheck();

// ⚠️ 换成你自己生成的随机字符串，并且要和 RevenueCat 后台 Webhooks 设置里填的
// Authorization header 值完全一致。两边对不上，所有 webhook 请求都会被这里拒绝（403），
// RevenueCat 后台的 Webhooks 页面能看到每次投递的失败记录，方便你排查是不是密钥没对上。
const WEBHOOK_SHARED_SECRET = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';

// ⚠️ 真实bug修复（互查时发现）：之前这里直接用 !== 比较两个字符串，这种比较会在第一个
// 不一样的字符处就提前结束，执行时间和"猜中了多少个开头字符"相关——理论上存在被人通过
// 反复发请求、测量响应时间来一点点猜出密钥的风险（timing attack）。换成 crypto.timingSafeEqual
// 做定长比较，不管猜中了多少个字符，比较花的时间都一样，就没有这个side channel了。
function secretsMatch(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false; // 长度都不一样肯定不对，不需要也不能喂进timingSafeEqual（它要求定长）
  return crypto.timingSafeEqual(bufA, bufB);
}

// ⚠️ 真实bug修复（互查时发现）：event.app_user_id 之前直接拿来拼 Firestore 文档路径
// （db.collection('memberships').doc(appUserId)），Firestore 的 doc() 会把字符串里的 '/'
// 当成路径分隔符处理，如果这个 id 里混进了 '/'，写入的就不是预期的那条记录，含偶数个'/'时
// 甚至会写到完全不同的集合里。RevenueCat 默认的匿名 app_user_id 不会有这个问题，但
// payments.js 里已经留了 logIn(appUserId) 这个口子，为将来接账号系统、把 app_user_id 换成
// 自己后端的 user_id 做准备——那个 user_id 一旦来源不单纯可控，就必须在这里挡一道。
function sanitizeAppUserId(id) {
  const s = String(id || '');
  if (!s || s.includes('/')) return null;
  return s;
}

// Firebase App Check 校验：确认请求真的来自你自己的 App（而不是别人拿 URL 直接 curl）。
// 用法：前端在请求头里带 X-Firebase-AppCheck: <token>，这里用 Admin SDK 验证。
// ⚠️ 要在 Firebase 控制台先开启 App Check 并注册你的 App（Play Integrity / DeviceCheck），
// 否则 token 验证会失败。开启后把下面 REQUIRE_APP_CHECK 改成 true，就会强制校验。
const REQUIRE_APP_CHECK = true; // 2026-11-03 正式版上线前开启
async function verifyAppCheck(req) {
  const token = req.headers['x-firebase-appcheck'];
  if (!token) return REQUIRE_APP_CHECK ? false : true; // 没 token 且不强制 → 放行（兼容旧调用）
  try {
    await appCheck.verifyToken(token);
    return true;
  } catch (e) {
    console.warn('AppCheck verify failed:', e.code || e.message);
    return false;
  }
}

// 会让会员资格"生效"的事件类型。TEST（RevenueCat 后台"Send Test Event"按钮发的测试事件）
// 也放进来，方便你验证整条链路通不通；下面处理时会把 TEST/SANDBOX 写到独立的 memberships_test
// 集合，不会碰到 memberships 这张真实会员表，参见下面 collectionForEvent() 的注释。
// ⚠️⚠️ 真实bug修复（这轮"互查"查到的、目前最严重的一个漏洞，直接对应"退款黑产/恶意退款白嫖"
// 这个风险——用户给的检查清单里第四条明确点名了这一类问题）：REFUND_REVERSED 加进来的原因见
// 下面 CANCELLATION 分支的大段注释；这里先说结论：RevenueCat 官方文档（已核实：
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields）明确写着——
// **RevenueCat 不会发一个专门叫"REFUND"的事件类型**，真实的"用户向Apple/Google申请退款、
// 退款成功"这件事，是通过 CANCELLATION 事件、附带 cancel_reason:'CUSTOMER_SUPPORT' 来表达的，
// 和"用户自己点了取消自动续费"用的是同一个事件类型，只能靠 cancel_reason 这个字段区分！
// 之前的代码完全没检查 cancel_reason，把所有 CANCELLATION 都当成"只是关自动续费"处理
// （只设 autoRenewOff:true，不收权益）——这意味着：如果有人买了钻石/终身（一次性、永不过期），
// 然后立刻去找Apple/Google客服申请退款成功，RevenueCat会发一个CANCELLATION+
// cancel_reason=CUSTOMER_SUPPORT过来，之前的代码对它的处理和"用户只是关了续费"完全一样——
// 不收回isPremium，而钻石/终身本来就没有"到期"这个环节，意味着退款成功后，服务器记录会
// **永久**显示这个人仍然是会员，钱退了、权益却一直留着，这是我们目前查到的、最直接的
// "合法途径白嫖"路径，比console伪造还隐蔽（这是走Apple/Google官方退款流程，完全合规操作）。
// 对订阅（月付/年付）退款虽然不是永久问题（原本的EXPIRATION迟早会来），但退款生效和那笔
// 订阅真正到期之间这段时间，用户也是在"钱退了但还能用"的状态，同样不公平。
// 修法见下面 CANCELLATION 分支：按 cancel_reason 区分"真退款"和"只是关续费"，真退款走和
// EXPIRATION 一样"立即收回、但只在匹配当前生效商品时才收回"的逻辑，不等到期。
// REFUND_REVERSED 是这件事的反面——RevenueCat文档里这个事件代表"之前的退款被撤销/反转了"
// （比如用户申诉退款后Apple又判定维持原购买），对应的权益应该被重新授予，所以放进
// GRANTING_EVENT_TYPES，复用同样的升级/等级保护逻辑。
const GRANTING_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
  'NON_RENEWING_PURCHASE', 'TRANSFER', 'TEST', 'REFUND_REVERSED'
]);
// 会让会员资格"失效"的事件类型。
// ⚠️ 真实bug修复（互查时发现，对应 terms-of-service.html「如何取消」一节的承诺：
// "取消订阅后，你仍可以继续使用会员权益直到当前已付费周期结束"）：
// CANCELLATION 以前也在这个集合里，但 CANCELLATION 只代表"用户关掉了自动续费"，
// 不代表当前这个计费周期已经结束——用户理论上应该还能用到期为止。之前"收到 CANCELLATION
// 就清空"的简化处理，一旦以后账号系统接上、真的开始读这张表，就会变成"用户刚点了取消，
// 立刻就被收走会员权益"，直接违反服务条款里写的承诺，也是订阅类App最常见的投诉模式之一。
// 现在只有 EXPIRATION（计费周期真正结束）才清空 is_premium；CANCELLATION 单独记一个
// autoRenewOff:true 标记（见下面处理逻辑），不动 isPremium，后续谁要用这个字段判断
// "是否还会继续自动扣费"可以直接读它。
const REVOKING_EVENT_TYPES = new Set(['EXPIRATION']);
const AUTO_RENEW_OFF_EVENT_TYPES = new Set(['CANCELLATION']);

// ⚠️ 真实bug修复（这次"互查"专门针对"月付/年付/终身老用户升级钻石"这条路径查出来的问题）：
// 这张表每个用户只存"最后一次事件带来的状态"，不是按商品分别记录——这意味着如果一个人先
// 升级成了钻石（permanent，expiresAt null），后来才想起去取消之前忘记取消的月付/年付订阅，
// 旧订阅会继续按周期正常发 RENEWAL 事件（这是正常的，只是这个人忘了取消）。RENEWAL 属于
// GRANTING_EVENT_TYPES，时间戳也是合法的新事件、不会被上面的 isStale 挡住——如果不做任何
// 等级判断，这些 RENEWAL 会把 source/productId/expiresAt 从'diamond'（永久）覆盖回
// 'nightwindow_monthly'（下个月就到期），一个真实的终身钻石会员，服务器记录会被这些旧订阅
// 的续费噪音悄悄"降级"回月付——这正是这次要重点检查的"升级钻石后，这条记录是否稳得住"。
// 和下面 isStale 的区别：isStale 防的是"同一条状态线"上的时间倒退，这里要防的是"不同商品"
// 之间，级别更高、仍然有效的凭据被级别更低的凭据用更新的时间戳反而把它覆盖掉。
// 用和客户端 pricing.js 里 TIER_RANK 完全对应的等级表（钻石 > 终身 > 年付 > 月付）来判断。
// ⚠️ 2026-10-03 加了 nightwindow_lifetime_upgrade_from_yearly（"年付→终身补差价升级"那个
// 折扣商品，见 pricing.js 顶部注释）——等级和普通终身一样是3。没加的话这个商品会落进下面
// "认不出的商品id给0级"分支：一个真实年付会员（等级2，仍然有效）买了这个折扣商品，
// newRank会是0，0<2，shouldProtectExisting会判定"新事件等级更低，不覆盖"，于是这笔真实的
// 终身购买反而不会被服务器记录升级成终身，仍然停留在年付——这是必须在它真正上线前修好的
// bug，不是"顺手优化"。
const SERVER_TIER_RANK = {
  nightwindow_monthly: 1,
  nightwindow_yearly: 2,
  nightwindow_lifetime: 3,
  nightwindow_lifetime_upgrade_from_yearly: 3
};
function rankForGrant(productId, entitlementIds) {
  if ((entitlementIds || []).includes('diamond')) return 4;
  return SERVER_TIER_RANK[productId] || 0; // 认不出的商品id给0级，不参与"保护"判断，按正常逻辑覆盖
}

// ⚠️ 2026-10-03 新增（配合"补差价升级终身"这个折扣——回答你问的"有人冒充第一年年付用户
// 蹭优惠价"这个风险）：先说清楚这里能防住什么、不能防住什么。
//   • "拿别人的付款/订阅凭证"这种——这个App的会员状态从来不是靠一个能被复制粘贴的"凭证
//     字符串"认定的，是RevenueCat SDK直接问苹果/Google"这台设备当前登录的这个商店账号，
//     真实买过什么"，而且payments.js里的verifyWithServer()还会再问一次这张只有RevenueCat
//     webhook能写的服务器记录做二次核实——这两层都是"问平台/问服务器"，不是"读一段用户自己
//     能改的本地文本"，没有可以伪造/转移给别人的"凭证"这种东西存在，这条路径已经被现有架构
//     挡住了，不需要为这次新加的折扣再单独写防护。
//   • 真正的风险不是"伪造凭证"，是"商业逻辑漏洞"：这个折扣商品一旦在App Store/Google Play
//     后台真实建出来，就是一个任何人都能在商店里直接搜到、直接买的正常商品——苹果/Google的
//     一次性内购没有"只有订阅过XX的人才能买这个商品"这种平台级限制（这是订阅的"促销优惠"
//     才有的能力，换不到"订阅转一次性买断"这种跨商品场景上）。我们App里"isPremium &&
//     getSource()==='yearly'才显示这一行"的判断，只能决定我们自己的付费墙要不要显示这个
//     选项，完全不能决定别人能不能直接从商店买到它——这是苹果/Google商店本身的限制，
//     不是这份代码可以再加几行判断就能堵住的技术漏洞。
//   • 这个App没有自己的后端授权系统（现在只有这一个webhook，用来记录，不做实时拦截），
//     做不到"购买前先问服务器同意不同意"这种完全杜绝的方案。下面这段改成现实可行的折中：
//     不拦截购买（真金白银的合法交易，强行不给用户东西反而是我们这边违约），只是在这笔
//     折扣购买的记录上打一个"不符合预期资格"的标记，供你以后自己去Firestore里查、
//     或者在客服看到有人投诉/对账时核对，真遇到明显滥用的情况，你可以自己联系Apple/Google
//     申请对那一笔退款——这是开发者唯一真正能"拿回"已完成内购的途径，App自己不能单方面
//     收回一笔已经验证通过的购买。
//   • 判断"资格够不够"用的是这次购买事件发生前，服务器记录里这个人上一次的source是不是
//     'nightwindow_yearly'——只是一个启发式判断（比如webhook事件乱序/延迟时可能短暂误判），
//     所以只打标记、不拦截，避免真实符合资格的用户因为这个判断本身的误差而被冤枉。
const DISCOUNT_UPGRADE_PRODUCT_ID = 'nightwindow_lifetime_upgrade_from_yearly';

// 供 EXPIRATION 和"真退款"(CANCELLATION+CUSTOMER_SUPPORT)共用的收回逻辑：只有当这次失效/被退款
// 的商品，确实就是当前记录里正记着的那个商品时，才真的把 isPremium 收回；否则只记日志——
// 见调用处的大段注释（这是两处原本几乎一样的逻辑，抽成一个函数，避免两边各自为政、以后改一边
// 忘了改另一边）。reasonLabel 只用于日志里说明是哪种事件触发的，不影响判断逻辑本身。
function applyRevocationIfProductMatches(tx, docRef, existing, event, eventTimeMs, reasonLabel) {
  const affectedProductId = event.product_id || null;
  const currentProductId = (existing.exists && existing.data().productId) || null;
  const productMatchesCurrent = !currentProductId || !affectedProductId || affectedProductId === currentProductId;
  if (!productMatchesCurrent) {
    console.log(
      '[revenueCatWebhook] 收到' + reasonLabel + '，但涉及的商品(' + affectedProductId +
      ')不是当前记录里生效的商品(' + currentProductId + ')，跳过收回isPremium（仍会记事件日志）：',
      event.id || null
    );
    return;
  }
  tx.set(docRef, {
    isPremium: false,
    lastEventType: event.type,
    lastEventTimeMs: eventTimeMs || Date.now(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

// TEST/SANDBOX 事件写到独立集合，不混进真实会员表——之前的写法里 TEST 事件和真实购买走的
// 是同一个 docRef.set(...)，唯一区别只是多存一个 environment 字段，没有任何代码真的按这个
// 字段分流，等于"写了标记但没人看"。现在直接物理隔离：真实环境事件写 memberships，
// TEST 类型或 environment==='SANDBOX' 的事件写 memberships_test，两张表的 app_user_id
// 哪怕撞上了也不会互相覆盖。
function collectionForEvent(event) {
  const isTestish = event.type === 'TEST' || event.environment === 'SANDBOX';
  return isTestish ? 'memberships_test' : 'memberships';
}

exports.revenueCatWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const authHeader = req.get('Authorization');
  if (!WEBHOOK_SHARED_SECRET || WEBHOOK_SHARED_SECRET.indexOf('REPLACE_WITH_') === 0) {
    console.error('[revenueCatWebhook] WEBHOOK_SHARED_SECRET 还没配置，拒绝所有请求（见文件顶部注释）');
    res.status(500).send('Server not configured');
    return;
  }
  if (!secretsMatch(authHeader, WEBHOOK_SHARED_SECRET)) {
    console.warn('[revenueCatWebhook] Authorization header 不匹配，拒绝请求');
    res.status(403).send('Forbidden');
    return;
  }

  const event = req.body && req.body.event;
  if (!event || !event.app_user_id || !event.type) {
    console.warn('[revenueCatWebhook] 请求体格式不对，缺少 event.app_user_id 或 event.type：', JSON.stringify(req.body));
    res.status(400).send('Bad Request');
    return;
  }

  const appUserId = sanitizeAppUserId(event.app_user_id);
  if (!appUserId) {
    console.warn('[revenueCatWebhook] app_user_id 格式不合法（包含非法字符），拒绝请求：', event.app_user_id);
    res.status(400).send('Bad Request');
    return;
  }
  const docRef = db.collection(collectionForEvent(event)).doc(appUserId);

  try {
    // ⚠️ 真实bug修复（互查时发现）：RevenueCat 投递失败会自动重试，网络抖动也可能让同一个
    // 事件被处理两次；不同事件之间也可能因为网络延迟乱序到达（比如一个更早发生的事件反而
    // 更晚才送达）。用 event.id 做幂等（同一个事件只处理一次），用 event.event_timestamp_ms
    // 和已存的时间比较，不让"更旧"的事件覆盖"更新"的状态。
    //
    // ⚠️ 真实bug修复（互查第二轮发现，这是对上面这段幂等逻辑本身的修复）：最早的写法是
    // 先 await seenRef.get() 查"处理过没有"，中间做完所有状态更新，最后才 await
    // eventDocRef.set(...) 把"已处理"标记写进去——"检查"和"标记"这两步不是原子的。
    // 如果 RevenueCat 几乎同时重试投递同一个事件（它自己的文档说明确实会在网络抖动时这样做），
    // 两个并发的请求都可能在对方写完标记之前，各自查到"还没处理过"，于是都会继续往下执行、
    // 都会把这个事件的效果应用一遍——这正好违背了这段代码本来要做到的"同一个事件只处理一次"。
    // 改成用 db.runTransaction 把"查有没有处理过"和"写入会员状态+处理标记"全部包进同一个
    // 事务：Firestore 的事务保证这整段读写在多个并发请求之间是互斥的，不会再有这个空子。
    const eventId = event.id || null;
    const eventTimeMs = event.event_timestamp_ms || 0;

    const outcome = await db.runTransaction(async (tx) => {
      if (eventId) {
        const seenRef = docRef.collection('events').doc(eventId);
        const seenSnap = await tx.get(seenRef);
        if (seenSnap.exists) {
          return { duplicate: true };
        }
      }
      const existing = await tx.get(docRef);
      const lastEventTimeMs = (existing.exists && existing.data().lastEventTimeMs) || 0;
      const isStale = eventTimeMs && lastEventTimeMs && eventTimeMs < lastEventTimeMs;

      if (isStale) {
        console.log('[revenueCatWebhook] 收到一个比已记录状态更旧的事件，跳过状态更新（仍会记事件日志）：', event.type, eventId);
      } else if (GRANTING_EVENT_TYPES.has(event.type)) {
        const entitlementIds = event.entitlement_ids || [];
        const isDiamond = entitlementIds.includes('diamond');
        const newRank = rankForGrant(event.product_id, entitlementIds);

        // ⚠️ 见上面 SERVER_TIER_RANK/rankForGrant 的注释：这次新事件授予的等级，如果比当前
        // 记录里"仍然有效"的那个凭据级别更低，就不应该覆盖掉 source/productId/expiresAt——
        // 典型场景：已经是钻石会员，旧的月付订阅又续费了一次，这次RENEWAL不该把钻石记录冲掉。
        // "仍然有效"的判断用 existing 记录自己的 isPremium + expiresAt（null代表永不过期）。
        const existingData = existing.exists ? existing.data() : null;
        const existingRank = existingData ? rankForGrant(existingData.productId, existingData.entitlementIds) : 0;
        const existingStillValid = !!(existingData && existingData.isPremium &&
          (!existingData.expiresAt || existingData.expiresAt > Date.now()));
        const shouldProtectExisting = existingStillValid && existingRank > newRank;

        if (shouldProtectExisting) {
          // 不覆盖 source/productId/entitlementIds/expiresAt，保住级别更高、仍然有效的记录；
          // 但仍然要推进 lastEventTimeMs/lastEventType——否则以后这个较低等级商品自己真实的
          // 后续事件（比如它自己的EXPIRATION）会被上面的isStale逻辑误判成"比已记录的更旧"而
          // 跳过处理，反而让"较低商品到期"这件事永远没被正确记录下来。
          console.log(
            '[revenueCatWebhook] 收到的事件(' + event.type + ', 商品:' + (event.product_id||'?') +
            ', 等级' + newRank + ')比当前记录的有效凭据(等级' + existingRank + ')低，不覆盖主记录，只推进事件时间戳：',
            eventId
          );
          tx.set(docRef, {
            lastEventType: event.type,
            lastEventTimeMs: eventTimeMs || Date.now(),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        } else {
          // ⚠️ 见上面 DISCOUNT_UPGRADE_PRODUCT_ID 的大段说明：只在"这次购买的正是那个折扣商品"
          // 时才检查，不影响其它任何商品的正常授予逻辑；existingData 读的是这次事件处理之前
          // （也就是"这次购买发生之前"）的记录，不会被下面这次tx.set()自己覆盖掉的结果干扰。
          const isDiscountUpgrade = event.product_id === DISCOUNT_UPGRADE_PRODUCT_ID;
          const hadYearlyBefore = !!(existingData && existingData.productId === 'nightwindow_yearly' && existingData.isPremium);
          const discountEligibilitySuspicious = isDiscountUpgrade && !hadYearlyBefore;
          if (discountEligibilitySuspicious) {
            console.warn(
              '[revenueCatWebhook] 折扣升级商品(' + DISCOUNT_UPGRADE_PRODUCT_ID + ')的购买者，' +
              '在这次购买之前的服务器记录里不是年付会员（之前记录：' +
              (existingData ? existingData.productId : '无记录') + '）——不拦截这笔已完成的真实购买，' +
              '只打标记供人工核对：', appUserId, eventId
            );
          }
          tx.set(docRef, {
            isPremium: true,
            autoRenewOff: false, // 新一次授予（购买/续费/取消续订又重新开启等）清掉这个标记
            billingIssueDetectedAt: null, // 能走到这个分支说明扣费这次成功了，清掉"之前扣费失败过"的标记
            source: isDiamond ? 'diamond' : (event.product_id || 'unknown'),
            productId: event.product_id || null,
            entitlementIds,
            // expiration_at_ms 为 null/undefined 代表买断类一次性商品，永不过期
            expiresAt: event.expiration_at_ms || null,
            environment: event.environment || null, // 'SANDBOX' | 'PRODUCTION'——排查"测试购买被当成真实订单"类问题时有用
            store: event.store || null,
            lastEventType: event.type,
            lastEventTimeMs: eventTimeMs || Date.now(),
            // discountEligibilityFlag 只在"这是折扣升级商品、且购买前的记录不是年付"时才写入
            // true；其它情况（包括其它所有商品）这个字段保持不动——用 merge:true 的 set()，
            // 不传这个字段就不会把一个正常购买的记录意外写上这个标记，也不会把之前
            // 没有问题的记录清空这个字段（反正默认就是没有这个字段，等价于"没问题"）。
            ...(discountEligibilitySuspicious ? { discountEligibilityFlag: 'no_prior_yearly_record' } : {}),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } else if (event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT') {
        // ⚠️⚠️ 真实bug修复（这轮"互查"查到的最严重漏洞，见上面 GRANTING_EVENT_TYPES 定义处的
        // 大段说明）：这才是 RevenueCat 真正用来表达"用户向Apple/Google申请退款、退款成功"的
        // 事件——不是什么"REFUND"类型，是 CANCELLATION + cancel_reason:'CUSTOMER_SUPPORT'。
        // 钱已经退了，不应该再等到（可能永远不会来的）EXPIRATION才收权益，这里直接按退款立即
        // 收回处理，但同样要套用和下面 EXPIRATION 一样的"只在匹配当前生效商品时才收回"保护——
        // 道理相同：如果这笔被退款的商品早就被更高档的购买取代了（比如退的是已经被终身取代的
        // 月付订阅），不应该因为一笔早就不是"当前生效凭据"的退款，错误收回真实、未退款的终身权益。
        console.log('[revenueCatWebhook] 收到真实退款事件(CANCELLATION+CUSTOMER_SUPPORT)：', event.product_id, eventId);
        applyRevocationIfProductMatches(tx, docRef, existing, event, eventTimeMs, 'REFUND');
      } else if (REVOKING_EVENT_TYPES.has(event.type)) {
        // ⚠️ 真实bug修复（互查时发现，直接关系到会员资格被错误收回）：这里以前不管三七二十一，
        // 收到一个 EXPIRATION 事件就把 isPremium 直接设成 false。但这张表（见文件顶部设计）
        // 每个用户只存"当前这一条"状态，不是按每个商品分别记录——现实中完全可能发生：
        // 一个人先买了终身（lifetime，永不过期），后来才想起自己之前还开着一个月付订阅忘记取消，
        // 这笔月付订阅继续按月扣费又续费了几次（RENEWAL事件，因为时间更新，会把 source 从
        // 'lifetime' 覆盖成 'nightwindow_monthly'，这是上面 GRANTING 分支已知的、可以接受的
        // 覆盖行为——毕竟那一刻两个商品都在生效，只是记录的是"最后一个动作"），直到某天这个人
        // 终于在商店里取消了月付订阅，月付自然到期，RevenueCat 发来这笔月付自己的 EXPIRATION
        // 事件——但这个人明明还是一个真实的终身会员（lifetime 权益从来没有、也不会过期），
        // 之前的代码会直接把 isPremium 设成 false，等于把一个终身付费用户在服务器记录上错误地
        // "降级"成了非会员，客服以后用这张表核对"这个人是不是真的付过钱"时会看到错误的结果，
        // 这正是我们最想避免的"会员权益被不公平收回"。
        // 修法：只有当这次过期的商品/权益，确实就是当前这条记录里正记着的那个商品/权益时，
        // 才真的把 isPremium 收回；如果这次过期的是一个"早就不是当前生效凭据"的旧商品
        // （比如上面例子里已经被 lifetime 取代的月付订阅），只记日志、不改 isPremium——
        // 这样处理的代价是：如果用户确实只有这一个订阅、现在真的到期了，当前记录的 productId
        // 会和这次事件的 product_id 一致，仍然会被正确收回，不影响"正常过期"这个最常见场景。
        applyRevocationIfProductMatches(tx, docRef, existing, event, eventTimeMs, 'EXPIRATION');
      } else if (AUTO_RENEW_OFF_EVENT_TYPES.has(event.type)) {
        // 用户关掉了自动续费（或者是上面已经处理过的真退款，走到这里说明cancel_reason不是
        // CUSTOMER_SUPPORT），当前已付费周期还没结束——只记标记，不清 isPremium，
        // 真正的权益收回要等后面真的收到 EXPIRATION 事件（见上面 REVOKING_EVENT_TYPES 的注释）
        tx.set(docRef, {
          autoRenewOff: true,
          lastEventType: event.type,
          lastEventTimeMs: eventTimeMs || Date.now(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } else if (event.type === 'BILLING_ISSUE') {
        // ⚠️ 对应用户给的检查清单第五条"扣费失败(Billing Retry)"——真正让用户在扣费失败期间
        // 还能继续用（宽限期/Grace Period）的，是Apple/Google自己平台层面的机制：只要你在
        // App Store Connect / Google Play Console 后台把"账单宽限期"打开，扣费失败那几天，
        // 平台自己就会继续认为这笔订阅"有效"，RevenueCat查到的entitlements.active不会立刻
        // 消失，客户端 getCustomerInfo()/reconcileOnLaunch() 该查到的还是"有效"，不需要这里
        // 做任何特殊处理——这是**后台配置项，不是代码能打开的开关**，务必去两个商店后台确认
        // 已经打开（REVENUECAT_SETUP.md 里已经补了这条提醒）。
        // 这里只做一件之前完全没做的事：把"扣费失败"这个状态记下来（billingIssueDetectedAt），
        // 不碰isPremium——用途：① 客服以后处理"怎么我的会员突然没了"投诉时，能看到这单之前
        // 经历过扣费失败，不是毫无征兆；② 预留给以后要做"提醒用户更新支付方式"推送/弹窗功能时，
        // 服务端已经有这个信号可以用，不需要再回头补数据。真正主动提醒用户"你的支付方式可能有
        // 问题，宽限期还剩几天"这件事，客户端现在还没有对应的UI（这是一个还没做的功能，不是这次
        // 互查范围内能顺手修的bug，需要单独设计文案和界面）。
        tx.set(docRef, {
          billingIssueDetectedAt: eventTimeMs || Date.now(),
          lastEventType: event.type,
          lastEventTimeMs: eventTimeMs || Date.now(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        // 其余事件类型（比如 SUBSCRIBER_ALIAS 等）先只记日志，不改会员状态——
        // 不认识的事件类型，宁可什么都不做，也不要猜测性地改动会员资格
        console.log('[revenueCatWebhook] 收到一个暂不处理会员状态的事件类型：', event.type);
      }

      // 不论哪种事件，都顺手存一份原始事件到子集合，方便以后客服申诉/对账时回查
      // （对应 /backend-reference/accounts-design.md 里 purchase_receipts 表的"审计留痕"用途），
      // 并且用 event.id 当文档 id（没有 id 时退回自动生成）——这正是上面幂等检查依赖的记录。
      // 这一步和上面的状态更新在同一个事务里一起提交，不会出现"状态改了但标记没写上"
      // 或反过来的中间状态。
      const eventDocRef = eventId ? docRef.collection('events').doc(eventId) : docRef.collection('events').doc();
      tx.set(eventDocRef, {
        type: event.type,
        raw: event,
        receivedAt: FieldValue.serverTimestamp()
      });
      return { duplicate: false };
    });

    if (outcome.duplicate) {
      console.log('[revenueCatWebhook] 事件已处理过（重复投递），直接返回OK：', eventId);
      res.status(200).send('OK (duplicate)');
      return;
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[revenueCatWebhook] 处理事件时出错：', err);
    res.status(500).send('Internal Error');
  }
});

/* ===================== 眠窗 · 会员状态服务端查询接口 =====================

   背景（对应一次"互相找茬"安全审查挖出来的真实问题）：这个App之前判断"是不是会员"完全依赖
   客户端——本地 localStorage 缓存 + RevenueCat SDK 的查询结果。payments.js 里
   `Membership.setPremium()` 是一个公开、不受保护的函数，任何能在WebView里执行JS的人
   （比如开了调试的测试包、重打包的APK，或者纯粹搜到"眠窗 解锁会员"的分享帖子）都能直接
   调用它把自己伪造成永久钻石会员。更糟的是，为了避免"网络一抖动就把真实付费用户误判成
   非会员"，reconcileOnLaunch() 的设计原则是"查询失败就保留本地缓存，不清空"——这个本来
   是对的（见 payments.js 的注释），但也意味着只要RevenueCat SDK那次查询失败（比如故意开
   飞行模式，或者像现在这样API Key还没配置好），伪造的状态就能一直保留下去，不会被纠正。

   这个函数提供一条**独立于RevenueCat SDK**的核实路径：App用自己生成的设备id（不是
   RevenueCat的匿名id，是 auth.js 里 deviceId() 生成的那个，App启动时会通过
   payments.js 调 Purchases.logIn() 把两者绑定成同一个值，见 payments.js 的注释）直接
   问这个函数"你们自己存的会员记录里，这个id到底是不是会员"——而这张 memberships 表
   只有 revenueCatWebhook 这个函数（用 Admin SDK，不受 firestore.rules 限制）能写，
   任何客户端都没有写权限（firestore.rules 默认拒绝所有客户端读写），所以伪造本地状态
   骗不过这个函数：除非真的有一笔经 RevenueCat 校验过的购买事件把这个id写进了这张表，
   否则这个函数只会诚实地回答"不是会员"。

   这不是完整的"账号系统"（没有登录、没有换设备找回、没有身份合并，这些仍然按
   /backend-reference/accounts-design.md 里的设计，留给以后真正做账号系统时再接），
   只是把"会员资格的真相来源"从纯客户端挪到了服务端这一步先做掉，优先级最高是因为它
   直接关系到钱（见上面背景部分）。

   ===================== 部署 =====================
   和 revenueCatWebhook 用同一个 `firebase deploy --only functions` 一起部署，不需要
   额外步骤。部署后把打印出来的这个函数的URL，填进 www/js/payments.js 的
   MEMBERSHIP_VERIFY_URL 常量（REVENUECAT_SETUP.md 里有写）。
================================================================= */

// 允许跨域调用：这个函数会被 Capacitor WebView 里的页面用 fetch() 直接调用，WebView的
// 页面源（比如 https://localhost 或 capacitor://localhost）和 Cloud Functions 的域名
// 不是同一个源，浏览器的CORS机制默认会拦掉这种跨域请求，必须显式允许。这里返回的数据
// 不含敏感信息（只有"是不是会员"这类状态，不含邮箱/支付信息），允许任意来源读取的风险可以接受；
// 更严格的做法是以后配合 Firebase App Check 只允许"确认是这个App自己发出的请求"，见下面的
// TODO注释。
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
}

exports.getMembershipStatus = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Firebase App Check：确认请求来自本 App，防止别人直接拿 URL 批量试探任意 app_user_id
  const appCheckOk = await verifyAppCheck(req);
  if (!appCheckOk) {
    res.status(403).json({ error: 'app_check_failed' });
    return;
  }

  const appUserId = sanitizeAppUserId(req.query.app_user_id);
  if (!appUserId) {
    res.status(400).json({ error: 'missing or invalid app_user_id' });
    return;
  }

  // TODO（以后有空再做，不是上线前必须项）：加 Firebase App Check 校验，确认请求真的来自
  // 这个App自己（而不是别人直接拿这个URL发请求查任意id），能进一步压低"批量试探别人id"
  // 这类滥用的空间——现在返回的信息本身不敏感（只是isPremium布尔值），先不做也不是漏洞，
  // 只是纵深防御没做满，留个记录，省得以后忘了为什么没加。
  try {
    // ⚠️ 同时查 memberships 和 memberships_test 两张表（见 collectionForEvent() 的注释）：
    // RevenueCat 的 Sandbox/License Testing 购买会被 webhook 写进 memberships_test，
    // 如果这里只查 memberships，开发者自己在 Google Play 内部测试阶段做真实的购买全流程
    // 测试时，会一直查到"不是会员"，看起来像这个功能本身是坏的——这张查询接口需要两边都照顾到。
    //
    // ⚠️ 这次"互查"主动找出来、但暂时不打算改代码、只记录清楚的一个边界风险：这个"两张表都查、
    // 测试表也当真"的设计，意味着只要有人能让 RevenueCat 认定"这是一笔沙盒/测试购买"（比如被
    // 加进了你 Google Play Console 的 License Testing 测试名单，或者 Apple 的 Sandbox 测试者），
    // 就能用$0或极低成本走一遍测试购买流程，拿到一条写进 memberships_test 的记录，而这个函数
    // 会把它当成和真实付费完全等价的"isPremium:true"返回——对一个真实生产环境的App来说，这就
    // 相当于用"沙盒购买"白嫖到了和真实付费一样的效果。这不是代码bug，是"方便开发者自己验证测试
    // 购买"这个功能本身自带的权衡，真正的防线在于：**License Testing / Sandbox 测试者名单
    // 必须只填你自己和真正需要测试的人的账号，不能是"任何人都能加入"的内部测试轨道**——
    // 如果你的 Google Play 内部测试轨道设置成"任何有链接的人都能加入"，相当于任何人都能让自己
    // 变成"测试者"、伪造出一条 memberships_test 记录，这个口子就被打开了。上线前务必检查一遍
    // Play Console 的测试者名单范围，不要留成"任何人都能加入"。
    const [prodSnap, testSnap] = await Promise.all([
      db.collection('memberships').doc(appUserId).get(),
      db.collection('memberships_test').doc(appUserId).get()
    ]);
    const snap = prodSnap.exists ? prodSnap : (testSnap.exists ? testSnap : null);

    if (!snap) {
      // 两张表都没有这个id的记录——诚实地回答"不是会员"，这是一个有把握的否定结果，
      // 不是"查询失败"，调用方（payments.js）应该把这个结果当真，可以据此清空伪造的本地状态。
      res.status(200).json({ isPremium: false, source: null, expiresAt: null, found: false });
      return;
    }

    const data = snap.data();
    // expiresAt 为 null 代表买断/钻石类永不过期；有值时还要跟当前时间比一下，
    // 已经过了那个时间点，即使webhook当时写的是isPremium:true，现在也不该再算有效——
    // 正常情况下 EXPIRATION 事件会及时把 isPremium 改成 false，这里的时间检查是双重保险，
    // 防止因为某种原因（比如 webhook 暂时故障）EXPIRATION 事件没能及时处理到。
    const now = Date.now();
    const notExpired = !data.expiresAt || data.expiresAt > now;
    const isPremium = !!data.isPremium && notExpired;

    res.status(200).json({
      isPremium,
      source: data.source || null,
      expiresAt: data.expiresAt || null,
      autoRenewOff: !!data.autoRenewOff,
      found: true
    });
  } catch (err) {
    console.error('[getMembershipStatus] 查询时出错：', err);
    res.status(500).json({ error: 'internal error' });
  }
});

/* ===================== 2026-10-03 新增：可疑折扣购买的查询接口 =====================

   背景：上面 revenueCatWebhook 在发放"年付→终身补差价升级"这个折扣商品时，如果发现
   购买前这个用户的记录不是"年付"，会在写入 Firestore 的时候顺手打一个
   discountEligibilityFlag:'no_prior_yearly_record' 的标记（不拦截购买，只留痕——
   具体原因见 revenueCatWebhook 里 DISCOUNT_UPGRADE_PRODUCT_ID 那段注释）。

   但光写进 Firestore 没有用——开发者不可能天天自己打开 Firestore 控制台、一页一页翻
   去找有没有这种记录。这个函数就是补上"怎么方便地看到这些记录"这一步：给一个简单的
   查询接口，配套下面 admin/suspicious-purchases.html 这个静态页面，开发者打开页面、
   填一下口令，就能看到所有被标记过的记录，不用再去翻 Firestore 控制台。

   ⚠️ 诚实说明这里的安全模型，不要误以为这是什么高级权限系统：
   这个接口直接复用最上面的 WEBHOOK_SHARED_SECRET 当"管理员口令"，通过请求头
   Authorization 传进来做校验——这是只有一个开发者在用的小App最简单可行的方案，不是
   企业级的权限系统（没有多用户、没有权限分级、没有登录会话）。好处是不需要再去多开一套
   账号体系；代价是如果这个密钥泄露，泄露的人不仅能伪造RevenueCat的webhook事件，也能看到
   这份可疑购买名单——跟原来 WEBHOOK_SHARED_SECRET 泄露的后果是同一个量级，没有新增攻击面，
   所以复用是合理的，但这个口令本身要像密码一样保管好，不要把它写进会被公开看到的地方
   （比如不要提交进公开的 git 仓库、不要贴在聊天记录里发给别人）。
*/
exports.listSuspiciousDiscountPurchases = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  if (!WEBHOOK_SHARED_SECRET || WEBHOOK_SHARED_SECRET.indexOf('REPLACE_WITH_') === 0) {
    res.status(503).json({ error: 'WEBHOOK_SHARED_SECRET 还没配置，这个查询接口暂时拒绝所有请求' });
    return;
  }
  const authHeader = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secretsMatch(authHeader, WEBHOOK_SHARED_SECRET)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    // 正式表 + 测试表都查一遍，道理跟 getMembershipStatus() 里一样：开发者自己用 Sandbox/
    // License Testing 走测试购买流程时，记录会落在 memberships_test 里，不应该被这个
    // 查询接口漏掉（不然开发者会误以为"标记功能是坏的，因为我测试时怎么都看不到"）。
    const results = [];
    for (const collectionName of ['memberships', 'memberships_test']) {
      const snap = await db.collection(collectionName)
        .where('discountEligibilityFlag', '==', 'no_prior_yearly_record')
        .get();
      snap.forEach(doc => {
        const d = doc.data();
        results.push({
          appUserId: doc.id,
          collection: collectionName,
          productId: d.productId || null,
          isPremium: !!d.isPremium,
          source: d.source || null,
          // lastEventTimeMs 是这条记录最近一次被 webhook 更新时的事件时间（纯数字毫秒时间戳，
          // 写入时就是这个格式，不是 Firestore 的 Timestamp 对象）——用它既能排序，也能直接在
          // 前端用 new Date(ms) 显示，不用再处理 Firestore Timestamp 转换。
          lastEventTimeMs: d.lastEventTimeMs || null
        });
      });
    }
    results.sort((a, b) => (b.lastEventTimeMs || 0) - (a.lastEventTimeMs || 0));
    res.status(200).json({ count: results.length, results });
  } catch (err) {
    console.error('[listSuspiciousDiscountPurchases] 查询时出错：', err);
    res.status(500).json({ error: 'internal error' });
  }
});

/* ===================== 2026-10-15 新增：账号删除 =====================

   这个函数做的事：用户在前端点"注销账号"后，前端先走 Firebase Auth 的 user.delete() 删除
   认证账号，然后调用这个函数删除 Firestore 里这个用户的所有数据。

   为什么需要这个函数（而不是只在前端删 localStorage）：
     1. Apple 审核指南 5.1.1(v) 要求"支持 App 内创建账号的 App，必须支持 App 内直接注销账号"——
        注销意味着"服务器上也不再保留这个账号的数据"，不是只清本地缓存。
     2. GDPR 第 17 条"被遗忘权"：用户有权要求删除其个人数据，包括服务器端的。
     3. 我们只在 Firestore 的 memberships / memberships_test 两张表里按 app_user_id 存了数据
        （webhook 写入的会员状态），这些数据必须在注销时一并清除。

   安全模型：
     - 前端必须先完成 Firebase Auth 的 user.delete()（这会触发 Firebase 自己的安全验证，
       比如要求用户近期登录过、或要求重新输入密码/重新 OAuth 验证）。
     - 前端调用这个函数时，需要带上 Firebase Auth 的 ID Token（证明"我是这个用户本人"），
       函数里用 Admin SDK 验证 token 里的 uid 和请求要删的 app_user_id 是否一致。
     - 不一致 → 403，防止"我传你的 app_user_id 删你的数据"。

   部署：
     和 revenueCatWebhook 用同一个 `firebase deploy --only functions` 一起部署。
     部署后把打印出来的 URL 填进 www/js/auth.js 的 ACCOUNT_DELETE_URL 常量。
================================================================= */

exports.deleteAccount = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Firebase App Check：确认请求来自本 App
  const appCheckOk = await verifyAppCheck(req);
  if (!appCheckOk) {
    res.status(403).json({ error: 'app_check_failed' });
    return;
  }

  const appUserId = sanitizeAppUserId(req.body && req.body.app_user_id);
  if (!appUserId) {
    res.status(400).json({ error: 'missing or invalid app_user_id' });
    return;
  }

  // 验证 Firebase Auth ID Token：确保调用者就是这个用户本人
  const authHeader = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!authHeader) {
    res.status(401).json({ error: 'missing_authorization_token' });
    return;
  }
  let decodedToken;
  try {
    decodedToken = await require('firebase-admin/auth').getAuth().verifyIdToken(authHeader);
  } catch (e) {
    console.warn('[deleteAccount] ID token 验证失败：', e.code || e.message);
    res.status(401).json({ error: 'invalid_authorization_token' });
    return;
  }

  // 关键校验：token 里的 uid 必须和要删除的 app_user_id 一致
  // （payments.js 里 Purchases.logIn({ appUserID: Auth.deviceId() }) 把 deviceId 绑成了
  //  RevenueCat 的 app_user_id，所以这里用 deviceId 做关联）
  if (decodedToken.uid !== appUserId) {
    res.status(403).json({ error: 'uid_mismatch' });
    return;
  }

  try {
    // 删除 Firestore 里这个用户的所有记录（两张表都删）
    const batch = db.batch();
    const collections = ['memberships', 'memberships_test'];
    for (const col of collections) {
      const docRef = db.collection(col).doc(appUserId);
      batch.delete(docRef);
    }
    await batch.commit();

    console.log(`[deleteAccount] 已删除用户 ${appUserId} 的 Firestore 记录（memberships + memberships_test）`);
    res.status(200).json({ ok: true, deletedCollections: collections });
  } catch (err) {
    console.error('[deleteAccount] 删除时出错：', err);
    res.status(500).json({ error: 'internal error' });
  }
});
