/* ===================== 眠窗 · 支付适配层 =====================

   这个文件的作用：把"到底用哪种支付方式"这件事，从界面代码里剥离出来，
   统一成一个 Payments.purchase(productId) 接口。界面只管调用这一个方法，
   具体走 RevenueCat（封装了 iOS StoreKit + Google Play Billing）、
   微信支付/支付宝还是 Stripe，由下面的 platform() 自动判断（原生 iOS / 原生 Android / 网页），
   大陆 Android 包和海外 Android 包如何区分，见下面 isChinaAndroidBuild() 的注释。

   ===================== 当前状态（2026-10 更新）=====================
   iOS / 海外 Android 这两条线：已经接上真实的 RevenueCat SDK（见下面 revenueCatAdapter），
   不再是占位抛错——但要让它真的跑起来，你还需要做几件只能在你自己电脑/各平台后台完成的事：
     1. 在这台云端环境里，我没法执行 `npm install @revenuecat/purchases-capacitor`
        （这个沙盒的网络策略不允许访问 npm 官方仓库），你需要把代码拉到你自己能上网的电脑上，
        自己跑一遍 npm install——具体步骤见仓库根目录的 REVENUECAT_SETUP.md
     2. 去 RevenueCat 官网注册账号、建项目，把 Google Play Console 和（以后）App Store Connect
        的凭证绑定过去，建好 Offerings/Packages，拿到下面 REVENUECAT_API_KEYS 要填的真实 Key
     3. 把下面 REVENUECAT_API_KEYS 里的占位字符串换成你自己项目的真实 Key
   这几步做完之前，configureRevenueCat() 会在控制台报错提醒你"还没配置"，购买会直接失败，
   但不会导致 App 崩溃——这是刻意设计的"没配置就安全失败"，不是 bug。

   微信支付/支付宝/Stripe 这三条线：还是占位阶段，没有改动，原因不变——
   需要你先有对应的平台资质（企业商户号等），不是加几行代码能搞定的，见下面各自的注释。

   商品 ID（productId）已经在 pricing.js 里定下来了，两个平台后台配置商品时要填一模一样的字符串：
     'nightwindow_monthly'   —— 会员·月付
     'nightwindow_yearly'    —— 会员·年付
     'nightwindow_lifetime'  —— 买断·终身
     'nightwindow_diamond'   —— 钻石💎·终身（最高档）

   RevenueCat 权益（Entitlement）设计：建两个 Entitlement，不是四个——
     'premium' —— 由 monthly / yearly / lifetime 三个商品任一授予，代表"普通会员"
     'diamond' —— 只由 diamond 商品授予，代表"钻石档"（钻石档不需要再重复拥有 premium，
                   下面 applyCustomerInfo() 里 diamond 优先于 premium 判断，逻辑上钻石已经包含普通会员的全部权益）
   这两个 Entitlement 的名字（premium / diamond）必须和你在 RevenueCat 后台实际建的 Entitlement
   Identifier 完全一致，拼错不会报错，只会表现成"买了但没解锁"，排查起来很隐蔽，务必对照检查。
================================================================= */
const Payments = (function(){

  function isNative(){
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function nativePlatform(){
    return (window.Capacitor && window.Capacitor.getPlatform) ? window.Capacitor.getPlatform() : null; // 'ios' | 'android'
  }
  // 大陆安卓包 vs 海外安卓包，通常是"打包时的两个不同渠道包"而不是运行时判断——
  // 同一个 Google Play 版本不允许再接微信/支付宝（会因为内购政策被拒审）。
  // 实际做法：打包时用不同的 flavor/构建变体区分，这里的 CHINA_BUILD 常量
  // 由构建脚本在打包大陆渠道包时改成 true（比如用 Capacitor 的环境变量注入）。
  const CHINA_BUILD = false; // ⚠️ 大陆渠道包构建时把这里改成 true，或改造成从构建配置读取

  // ⚠️ 换成你自己 RevenueCat 项目里的真实 Public API Key（在 RevenueCat 后台
  // Project Settings → API Keys 里找，iOS 和 Android 是两把不同的 Key，别填反）。
  // 这两把是"Public"key，设计上就是会被打包进客户端代码、任何人反编译都能看到的，
  // 这是正常的、RevenueCat 官方的用法，不是安全漏洞——真正敏感的 Secret Key
  // 只用在服务端（比如 Google Play Developer API 相关操作），不会出现在这个文件里。
  const REVENUECAT_API_KEYS = {
    ios: 'appl_hggbSqGKRKzDqgHAbseVlZdULdo',
    android: 'goog_jYAwgiwrhUcuidRDgWrGfSiSITf'
  };
  // ⚠️ 真实安全漏洞修复（互查时发现的"白嫖钻石会员"问题的正式解法，2026-10追加）：
  // 换成你自己部署的 functions/index.js 里 getMembershipStatus 这个函数的真实URL
  // （部署后终端会打印出来，形如 https://us-central1-你的项目id.cloudfunctions.net/getMembershipStatus，
  // 具体步骤见 REVENUECAT_SETUP.md）。
  // 这是干什么的：Membership.setPremium() 本身是公开、不受保护的函数，任何能在WebView里跑JS
  // 的人都能直接调用它伪造会员状态——这个问题没法只靠客户端代码彻底堵死（原理上客户端的代码
  // 和数据对使用者来说都是"透明"的）。真正的解法是让App去问一个使用者改不了的地方——你自己的
  // 服务器，这个常量就是那个服务器的地址。配好之后，verifyWithServer() 会在每次
  // reconcileOnLaunch() 时，拿这台设备自己的id去问服务器"这个id真的买过东西吗"，服务器只会
  // 诚实回答（它读的是只有 RevenueCat webhook 能写的那张表），查到"没有"就会清空本地的
  // 伪造状态——哪怕 RevenueCat SDK 本身因为API Key还没配好、或者故意断网而查询失败。
  // 留空/保持占位字符串也不会导致App崩溃或购买失败——这项检查是独立的"第二层保险"，
  // 不配置只是意味着少了这一层保险，不影响RevenueCat SDK本身的购买/恢复/查询功能。
  const MEMBERSHIP_VERIFY_URL = 'REPLACE_WITH_YOUR_GET_MEMBERSHIP_STATUS_FUNCTION_URL';
  const ENTITLEMENT_PREMIUM = 'premium';
  const ENTITLEMENT_DIAMOND = 'diamond';
  const PRODUCT_IDS = {
    monthly: 'nightwindow_monthly',
    yearly: 'nightwindow_yearly',
    lifetime: 'nightwindow_lifetime',
    diamond: 'nightwindow_diamond',
    // ⚠️ 2026-10-03 新增（"年付→终身补差价升级"折扣商品，见pricing.js顶部注释）：
    // 这是一个单独的商品ID，但本质上买的就是终身权益，所以下面sourceFromProductId()
    // 要把它也认成'lifetime'，不能让它掉进"return 'unknown'"那个分支——否则
    // Membership.getSource()会返回'unknown'，导致pricing.js的isDowngradePurchase()
    // 查TIER_RANK['unknown']查不到（当0级处理），买完这个折扣后再点一次月付/年付
    // 不会被正确拦成"降级"；index.html的openManageBadge()也会因为source!=='lifetime'
    // 走错分支，把一个已经是终身会员的人带进"取消订阅"的挽留弹窗——这两个都是会实际发生、
    // 会让用户困惑的真实bug，不是理论上的边界情况。
    lifetimeUpgradeFromYearly: 'nightwindow_lifetime_upgrade_from_yearly'
  };

  async function purchase(productId){
    if(isNative() && nativePlatform()==='ios'){
      return revenueCatAdapter.purchase(productId);
    }
    if(isNative() && nativePlatform()==='android' && CHINA_BUILD){
      return chinaAdapter.purchase(productId);
    }
    if(isNative() && nativePlatform()==='android'){
      return revenueCatAdapter.purchase(productId);
    }
    return webAdapter.purchase(productId);
  }

  async function restore(){
    if(isNative() && nativePlatform()==='ios') return revenueCatAdapter.restore();
    if(isNative() && nativePlatform()==='android' && CHINA_BUILD) return chinaAdapter.restore();
    if(isNative() && nativePlatform()==='android') return revenueCatAdapter.restore();
    return webAdapter.restore();
  }

  // ---------------- RevenueCat（统一封装 iOS StoreKit + Google Play Billing） ----------------
  //
  // 为什么 iOS 和 Android 共用一个 adapter：RevenueCat 的整个产品价值就是"一个 SDK、一套接口，
  // 底层自动按平台切换 StoreKit / Billing Library，并且自动做收据校验、自动处理 Google Play 那个
  // "3天内必须 acknowledge 否则自动退款"的坑"——这些都不需要我们自己再写一遍，这正是选它的原因，
  // 具体权衡见我们之前的讨论。如果以后有理由要拆开（比如某个平台要接 RevenueCat 之外的东西），
  // 再把这个 adapter 拆成 iosAdapter / googlePlayAdapter 两个也不迟，现在合并写，少一倍重复代码。
  let rcConfigured = false;
  let rcConfiguring = null; // 并发调用 purchase()/restore() 时，确保只真正 configure() 一次

  async function ensureRevenueCatConfigured(){
    if(rcConfigured) return;
    if(rcConfiguring){ await rcConfiguring; return; }
    rcConfiguring = (async ()=>{
      // 这里用动态 import 而不是文件顶部的 ES import，是因为这个项目目前用 <script> 标签
      // 直接在 index.html 里加载各个 js 文件（不是打包工具流程），顶层 import 在这种加载方式下
      // 不一定能用；npm install 完、接入打包流程后，可以按你项目实际的模块方案改写这一段。
      const { Purchases } = window.CapacitorPurchases || {};
      if(!Purchases){
        throw new Error(
          'RevenueCat SDK 还没接进来：需要先 npm install @revenuecat/purchases-capacitor，' +
          '并确认它在 Capacitor 原生工程里正确注册——具体步骤见仓库里的 REVENUECAT_SETUP.md'
        );
      }
      const platform = nativePlatform();
      const apiKey = platform==='ios' ? REVENUECAT_API_KEYS.ios : REVENUECAT_API_KEYS.android;
      if(!apiKey || apiKey.indexOf('REPLACE_WITH_')===0){
        throw new Error(
          'RevenueCat API Key 还没填：打开 www/js/payments.js，把 REVENUECAT_API_KEYS.' + platform +
          ' 换成你 RevenueCat 后台项目里的真实 Public SDK Key'
        );
      }
      await Purchases.configure({ apiKey });
      rcConfigured = true;
      // ⚠️ 真实安全漏洞修复（配合 MEMBERSHIP_VERIFY_URL 一起看）：把 RevenueCat 自己生成的
      // 匿名 app_user_id 绑定成这台设备自己的稳定id（Auth.deviceId()，auth.js 里已经有）。
      // 原因：functions/index.js 的 webhook 和新的 getMembershipStatus 都是按 app_user_id
      // 存/查 Firestore 的——如果客户端这边不主动 logIn()，RevenueCat 每次装App/清数据都会
      // 生成一个新的匿名id，服务器端查到的id和这里查询用的id就对不上，
      // verifyWithServer() 永远查不到正确的记录，这层保险就等于没配。
      // 这里故意不 await 失败就抛出整个 ensureRevenueCatConfigured()——logIn 失败不应该
      // 连累购买/查询功能本身用不了，所以单独 catch、只打印警告。
      if(typeof Auth!=='undefined' && typeof Auth.deviceId==='function'){
        try{
          await Purchases.logIn({ appUserID: Auth.deviceId() });
        }catch(e){
          console.warn('[Payments.ensureRevenueCatConfigured] 绑定 deviceId 到 RevenueCat 失败（不影响购买/查询本身）：', e && e.message);
        }
      }
    })();
    try{ await rcConfiguring; } finally { rcConfiguring = null; }
  }

  function getPurchasesSdk(){
    const { Purchases } = window.CapacitorPurchases || {};
    return Purchases;
  }

  // 商品 ID → 'monthly'/'yearly'/'lifetime'/'diamond'，供 Membership.setPremium() 的 source 参数用。
  // diamond.js 等地方用 Membership.getSource()==='diamond' 来判断是不是钻石档，这个映射必须和
  // pricing.js 里 PRICING 表的 productId 保持完全一致。
  //
  // ⚠️ 2026-10-15 修复（Google Play 订阅匹配缺陷）：Google Play 的订阅商品在 RevenueCat 里
  // 的标识格式是"订阅ID:基本方案ID"（如 nightwindow_monthly:monthly），一次性商品则没有后缀。
  // 代码里所有比较用的都是 pricing.js 定义的裸 ID（不带后缀），所以任何从 RevenueCat 拿到的
  // productIdentifier / storeProduct.identifier，都必须先经过 normalizeProductId() 归一化再比较，
  // 否则 Android 上月付/年付会命中不了：sourceFromProductId() 返回 'unknown'（会员档位判定、
  // 降级拦截、管理页分支全跟着错），findPackageForProduct() 找不到 Package（购买退路在 Android
  // 上大概率失败）。iOS 的 StoreKit 标识本来就是裸 ID，不受影响；归一化只在"冒号前缀确实是
  // 我们自己的某个商品 ID"时才生效，不会误伤其他格式。
  function normalizeProductId(productId){
    if(!productId || productId.indexOf(':')===-1) return productId;
    const base = productId.slice(0, productId.indexOf(':'));
    for(const key in PRODUCT_IDS){
      if(PRODUCT_IDS[key]===base) return base;
    }
    return productId;
  }
  function sourceFromProductId(productId){
    productId = normalizeProductId(productId);
    if(productId===PRODUCT_IDS.monthly) return 'monthly';
    if(productId===PRODUCT_IDS.yearly) return 'yearly';
    if(productId===PRODUCT_IDS.lifetime) return 'lifetime';
    // "年付→终身补差价升级"商品买到的也是终身权益，必须归一成'lifetime'，
    // 不能漏判掉进下面的'unknown'分支——否则TIER_RANK['unknown']查不到会被当0级，
    // pricing.js的isDowngradePurchase()就拦不住"买完这个之后又去点月付/年付"；
    // index.html的openManageBadge()也会因为source!=='lifetime'而走错分支，
    // 把一个已经是终身会员的人带进"取消订阅"挽留弹窗——这两个都是会真实发生的bug。
    if(productId===PRODUCT_IDS.lifetimeUpgradeFromYearly) return 'lifetime';
    if(productId===PRODUCT_IDS.diamond) return 'diamond';
    return 'unknown';
  }

  // 把 RevenueCat 返回的 CustomerInfo 翻译成本地 Membership 状态，并真正调用
  // Membership.setPremium()/clearPremium()——这是"真相来源是平台，不是本地缓存"这个原则
  // 的唯一落地点，purchase()/restore()/reconcileOnLaunch() 最终都走到这里。
  //
  // ⚠️ 只应该在"RevenueCat 明确返回了结果"（无论是有权益还是没权益）时调用这个函数；
  // 如果是网络失败/SDK 抛错，调用方必须自己 catch，不能把异常也传进来当成"没权益"处理——
  // 这正是文件最早版本里反复强调的"查询失败 ≠ 真的不是会员"，详见 reconcileOnLaunch() 的注释。
  function applyCustomerInfo(customerInfo){
    const active = (customerInfo && customerInfo.entitlements && customerInfo.entitlements.active) || {};
    const diamondEnt = active[ENTITLEMENT_DIAMOND];
    const premiumEnt = active[ENTITLEMENT_PREMIUM];
    const ent = diamondEnt || premiumEnt;
    if(!ent){
      if(typeof Membership!=='undefined') Membership.clearPremium();
      return null;
    }
    const source = diamondEnt ? 'diamond' : sourceFromProductId(ent.productIdentifier);
    // expirationDate 是 ISO 字符串；买断/钻石这类一次性商品 RevenueCat 会返回 null（永不过期）
    let expiresAt = ent.expirationDate ? new Date(ent.expirationDate).getTime() : null;
    // ⚠️ 真实bug修复（互查时发现）：如果 expirationDate 是个非空但没法解析的字符串，
    // new Date(...).getTime() 得到 NaN。NaN 在 JS 里是 falsy，下面 membership.js 的
    // isPremium() 用 `if(state.expiresAt && ...)` 判断过期，NaN 会让这个判断直接跳过，
    // 等同于"永不过期"——一个格式错误的日期字符串，结果变成了意外的永久会员。
    // 更隐蔽的是 JSON.stringify(NaN) 会变成 null，写进 localStorage 之后连痕迹都看不出来，
    // 会一直保持"永久会员"直到下次 RevenueCat 返回正常数据才会被覆盖。这里明确识别出
    // NaN，当成"这条权益数据异常，不可信"处理，不调用 setPremium（保留调用前的本地状态），
    // 并返回 null 让上层知道这次没能得到一个可信的结果，而不是悄悄发一个永久会员出去。
    if(expiresAt !== null && !Number.isFinite(expiresAt)){
      console.warn('[Payments.applyCustomerInfo] entitlement 的 expirationDate 解析失败，忽略本次结果：', ent.expirationDate);
      return null;
    }
    if(typeof Membership!=='undefined') Membership.setPremium(expiresAt, source);
    return { source, expiresAt, productIdentifier: ent.productIdentifier };
  }

  // 在已配置的 Offerings/Packages 里找到对应 productId 的 Package；找不到就返回 null，
  // 调用方会退回到"直接用 productId 购买"的路径（见 purchase() 里的注释）。
  function findPackageForProduct(offerings, productId){
    if(!offerings) return null;
    const pools = [];
    if(offerings.current) pools.push(offerings.current);
    if(offerings.all) pools.push(...Object.values(offerings.all));
    for(const offering of pools){
      const pkgs = (offering && offering.availablePackages) || [];
      const found = pkgs.find(p => p && p.storeProduct && normalizeProductId(p.storeProduct.identifier)===productId);
      if(found) return found;
    }
    return null;
  }

  const revenueCatAdapter = {
    async purchase(productId){
      await ensureRevenueCatConfigured();
      const Purchases = getPurchasesSdk();
      let customerInfo;
      try{
        const offerings = await Purchases.getOfferings();
        const pkg = findPackageForProduct(offerings, productId);
        let result;
        if(pkg){
          // 推荐路径：通过 Offering/Package 购买——RevenueCat 官方推荐这样做（方便后续做
          // A/B 定价实验而不用改代码），前提是你在后台把 Offerings 配置好、商品挂到 Package 上。
          result = await Purchases.purchasePackage({ aPackage: pkg });
        }else{
          // 退路：后台还没配置 Offerings/Packages 时，直接按 productId 购买，效果一样能解锁，
          // 只是以后想做"同一商品不同呈现方式做实验"会比较麻烦。等你在 RevenueCat 后台把
          // Offerings 配好之后，这条分支基本不会再走到。
          //
          // ⚠️ 2026-11-07 修复（安卓端购买必失败的真实 bug）：这里以前直接传
          // { identifier: productId }，Google Play 分支会报
          // "Missing productCategory parameter in {"identifier":"nightwindow_yearly"}" 并中断购买；
          // iOS 的 StoreKit 分支不校验这个字段，所以问题只在安卓暴露。
          // 正确做法是先用 getProducts 从商店拿到完整的 StoreProduct（含 productCategory、
          // 价格、标题等 SDK 内部需要的字段），再把整个对象传进 purchaseStoreProduct。
          const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
          const storeProduct = (products || []).find(
            p => p && normalizeProductId(p.identifier) === productId
          ) || (products || [])[0];
          if(!storeProduct){
            throw new Error('商店里找不到商品 ' + productId + '，请确认它已在后台创建并处于生效状态');
          }
          result = await Purchases.purchaseStoreProduct({ product: storeProduct });
        }
        customerInfo = result.customerInfo;
      }catch(err){
        // RevenueCat/各平台 SDK 对"用户自己点了取消"这件事的报法不完全统一（不同版本字段名
        // 可能是 err.userCancelled 或 err.code==='PURCHASE_CANCELLED_ERROR' 之类），
        // npm install 接入真实版本后，建议对照 node_modules 里的类型定义核实一下这里的判断条件。
        if(err && (err.userCancelled || err.code==='PURCHASE_CANCELLED_ERROR' || err.code==='1')){
          throw new Error('CANCELLED'); // pricing.js 的 catch 目前对所有错误都是 alert(err.message)，
          // 用户主动取消不应该弹一个"出错了"的提示——建议在 pricing.js 里专门判断这个
          // 'CANCELLED' 消息、直接静默忽略，不要吓用户。
        }
        throw err;
      }
      const applied = applyCustomerInfo(customerInfo);
      if(!applied){
        // 购买流程本身没抛错，但事后在 CustomerInfo 里却找不到对应权益——理论上不应该发生，
        // 真发生了大概率是 Entitlement Identifier 在 RevenueCat 后台配错了（没把这个商品
        // 挂到 'premium'/'diamond' 这两个 Entitlement 上），按"宁可报错也不要装作成功"处理。
        throw new Error('购买似乎已完成，但未能识别到对应的会员权益，请截图联系客服核实（productId: ' + productId + '）');
      }
      return applied;
    },
    async restore(){
      await ensureRevenueCatConfigured();
      const Purchases = getPurchasesSdk();
      const result = await Purchases.restorePurchases(); // 失败会直接抛错，调用方（reconcileOnLaunch）负责区分"查询失败"和"确认没有"
      return applyCustomerInfo(result.customerInfo); // 走到这里说明 RevenueCat 已经明确返回结果——没权益时 applyCustomerInfo 内部会调用 clearPremium()，这是"平台确认没有"而不是"查询失败"，按设计是允许清空本地缓存的
    },
    async getCustomerInfo(){
      await ensureRevenueCatConfigured();
      const Purchases = getPurchasesSdk();
      const result = await Purchases.getCustomerInfo();
      return applyCustomerInfo(result.customerInfo);
    },
    // 账号系统接入后（见 /backend-reference/accounts-design.md），用户登录时应该调用这个，
    // 把 RevenueCat 内部的匿名 App User ID 换成你自己后端的 user_id，这样同一个人换设备登录、
    // 甚至iOS换Android，RevenueCat 那边都能认出是同一个人、自动合并购买记录。
    // 目前账号系统还没实现，这个函数先留在这里，暂时没人调用它，不影响现有功能。
    async logIn(appUserId){
      await ensureRevenueCatConfigured();
      const Purchases = getPurchasesSdk();
      const result = await Purchases.logIn({ appUserID: appUserId });
      return applyCustomerInfo(result.customerInfo);
    }
  };

  // ---------------- 微信支付 / 支付宝（仅限大陆安卓渠道包） ----------------
  // 后端下单服务地址（你自己部署的后端，负责向微信/支付宝下单并返回支付参数）
  // 部署后把下面的占位换成真实地址，比如 https://api.yourdomain.com
  const CHINA_PAY_API_BASE = 'REPLACE_WITH_CHINA_PAY_BACKEND_URL';
  const chinaAdapter = {
    async purchase(productId){
      if(!CHINA_PAY_API_BASE || CHINA_PAY_API_BASE.indexOf('REPLACE_WITH_')===0){
        throw new Error('大陆支付后端地址未配置，请在 payments.js 里设置 CHINA_PAY_API_BASE');
      }
      // 1. 向后端下单，拿到支付参数
      const resp = await fetch(CHINA_PAY_API_BASE + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, channel: 'wechat' }) // channel: 'wechat' | 'alipay'
      });
      if(!resp.ok) throw new Error('下单失败：HTTP ' + resp.status);
      const order = await resp.json();
      // 2. 调起支付：微信用 WeixinJSBridge.invoke，支付宝用 AlipayJSBridge
      //    （原生壳里通常用对应的 Capacitor 插件调起微信/支付宝 App）
      if(order.payUrl){
        // H5 支付：直接跳转支付页面（最简单，适合快速上线）
        window.location.href = order.payUrl;
        return { pending: true, orderId: order.orderId };
      }
      // 3. 等待后端回调确认会员状态（轮询或等用户返回后查）
      await chinaAdapter._pollMembership(order.orderId);
      return { success: true, orderId: order.orderId };
    },
    async _pollMembership(orderId){
      // 简单轮询：每 2 秒查一次后端，最多等 60 秒
      for(let i=0; i<30; i++){
        await new Promise(r=>setTimeout(r, 2000));
        try{
          const resp = await fetch(CHINA_PAY_API_BASE + '/api/orders/' + orderId + '/status');
          if(resp.ok){
            const data = await resp.json();
            if(data.paid){ Membership.setPremium(data.source, data.expiresAt); return; }
          }
        }catch(e){ /* 忽略轮询错误，继续 */ }
      }
      throw new Error('支付确认超时，请稍后在"账号"里查看会员状态');
    },
    async restore(){
      // 大陆这条线：登录账号后由后端直接返回会员状态
      if(Auth && Auth.isLoggedIn && Auth.isLoggedIn()){
        // 如果已登录，让后端查这个用户的会员状态
        throw new Error('请联系后端接口返回当前账号的会员状态');
      }
      throw new Error('请先登录账号，由后端返回会员状态');
    }
  };

  // ---------------- 网页端 Stripe ----------------
  const STRIPE_CHECKOUT_API = 'REPLACE_WITH_STRIPE_BACKEND_URL'; // 你后端的 Stripe 下单接口
  const webAdapter = {
    async purchase(productId){
      if(!STRIPE_CHECKOUT_API || STRIPE_CHECKOUT_API.indexOf('REPLACE_WITH_')===0){
        // 没有后端时，用 Stripe Payment Link 快速上线（需要你在 Stripe 后台建好商品和 Payment Link）
        const links = {
          nightwindow_monthly: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_MONTHLY',
          nightwindow_yearly: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_YEARLY',
          nightwindow_lifetime: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_LIFETIME',
          nightwindow_diamond: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_DIAMOND'
        };
        const link = links[productId] || links.nightwindow_lifetime;
        if(!link || link.indexOf('REPLACE_WITH_')===0){
          throw new Error('Stripe Payment Link 未配置，请在 Stripe 后台创建后填入 payments.js');
        }
        window.location.href = link;
        return { pending: true };
      }
      // 有后端时：调用后端创建 Stripe Checkout Session，跳转过去
      const resp = await fetch(STRIPE_CHECKOUT_API + '/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });
      if(!resp.ok) throw new Error('创建支付会话失败：HTTP ' + resp.status);
      const { url } = await resp.json();
      window.location.href = url;
      return { pending: true };
    },
    async restore(){
      throw new Error('网页端建议：让用户登录账号，由后端直接返回会员状态');
    }
  };

  /* ===================== 订阅状态对齐（解决"会员状态错位/解锁延迟"类投诉） =====================
     这是 Calm 等同类产品被投诉最多的地方之一：本地缓存的会员状态和平台真实订单状态不同步——
     用户在平台那边已经取消/续费/退款了，但App本地缓存没刷新，导致"明明退订了还在扣费的感觉"
     或"明明续费了App却显示过期"。原则：本地 localStorage 永远只是"上次已知状态"的缓存，
     不是真相来源，真相来源是平台（现在由 RevenueCat 统一代为查询 iOS/Android 两边的真实状态）。
     reconcileOnLaunch() 在以下时机被调用：
       1. App 每次启动/恢复前台时（见 index.html 底部）——这里走的是被动查询
          getCustomerInfo()，不触发恢复购买流程，原因见下面函数内的注释
       2. 用户手动点"恢复购买"按钮时，走的是这个文件的 restore()，同一套"真相来源是平台"
          的原则，但调用的 SDK 方法不同（见下面注释）
       3. 本地显示"已过期"但用户坚持说"我明明付了钱"时（客服兜底路径，用 restore()）
     调用后 Membership.setPremium()/clearPremium() 以平台返回的真实结果为准，
     而不是本地缓存说了算——哪怕这意味着覆盖掉本地看起来"更新"的状态。 */
  // ⚠️ 真实bug修复（互查时发现）：这个函数会在"每次回到前台"时自动触发（见 index.html 的
  // visibilitychange 监听），用户快速切出切回App（切到通知栏、接个电话又回来）可能在短时间内
  // 触发好几次重叠的调用——如果其中较早一次的网络请求因为网络状况反而比后发出的请求更晚返回，
  // 它携带的（更旧的）结果会在后发请求之后才落地执行 setPremium/clearPremium，把更新的状态
  // 又覆盖回旧的，造成UI短暂闪烁甚至状态错乱。加一个模块级锁：已经有一次 reconcileOnLaunch
  // 在进行中时，新的调用直接复用同一个 in-flight 的 Promise，不重新发起请求。
  let reconcileInFlight = null;
  async function reconcileOnLaunch(){
    if(reconcileInFlight) return reconcileInFlight;
    reconcileInFlight = doReconcileOnLaunch();
    try{ return await reconcileInFlight; } finally { reconcileInFlight = null; }
  }

  // 判断 MEMBERSHIP_VERIFY_URL 是不是还是占位字符串（没部署/没填）——纯读常量，不发请求。
  function isMembershipVerifyUrlConfigured(){
    return !!MEMBERSHIP_VERIFY_URL && String(MEMBERSHIP_VERIFY_URL).indexOf('REPLACE_WITH_')!==0;
  }

  // ⚠️ 真实安全漏洞修复（互查时发现的"白嫖钻石会员"问题，正式解法的核心函数，2026-10追加）：
  // 向我们自己部署的 getMembershipStatus 云函数查询"这台设备真的是会员吗"。
  // 这张表（memberships / memberships_test）只有 RevenueCat webhook 能写（见
  // firestore.rules 和 functions/index.js），客户端没有任何办法往里面伪造数据——
  // 这正是它能堵住 Membership.setPremium() 可以被console直接调用这个漏洞的原因：
  // 哪怕有人在WebView里伪造了本地状态，这个函数查到的仍然是服务器上的真实记录。
  //
  // 返回值约定（调用方 doReconcileOnLaunch() 依赖这个约定）：
  //   - 没配置 MEMBERSHIP_VERIFY_URL（还是占位字符串）→ 返回 undefined（"不知道"，不是"没有"）
  //   - 网络请求失败/超时/HTTP非200 → 抛错（调用方必须 catch，当成"这次问不到"，不能当成"没有"）
  //   - 请求成功 → 返回服务器的 JSON 结果 { isPremium, source, expiresAt, autoRenewOff, found }，
  //     这是服务器"明确给出的答案"，可信度高于本地缓存。
  async function verifyWithServer(appUserId){
    if(!isMembershipVerifyUrlConfigured()) return undefined; // 没部署这道保险，视为"不知道"，不代表"没有"
    if(!appUserId) return undefined;
    const url = MEMBERSHIP_VERIFY_URL + '?app_user_id=' + encodeURIComponent(appUserId);
    const resp = await fetch(url, { method: 'GET' });
    if(!resp.ok){
      throw new Error('getMembershipStatus 返回了非200状态：' + resp.status);
    }
    return await resp.json();
  }

  async function doReconcileOnLaunch(){
    let rcResult = null;
    try{
      // ⚠️ 真实bug修复（互查时发现）：这里以前调用的是 restore()（对应 RevenueCat SDK 的
      // restorePurchases()）。restorePurchases 在语义上是"用户主动点恢复购买"这个操作，
      // 在某些平台实现下可能触发系统层面的账号重新验证/恢复提示——不应该在用户完全没有
      // 任何操作、只是切了个前后台的时候，每次都静默触发一次。被动的"查一下现在的会员状态"
      // 应该用 getCustomerInfo()（对应SDK的 getCustomerInfo()，纯查询，不触发任何恢复流程）。
      // "恢复购买"按钮本身走的还是 restore()，这里改的只是自动触发的这条路径。
      rcResult = await revenueCatAdapter.getCustomerInfo();
    }catch(e){
      // ⚠️ 这里必须继续保持"网络/平台查询失败 ≠ 真的不是会员"这个区分，
      // 不能图省事把"查询失败"和"平台明确返回‘没有有效订阅’"用同一套逻辑处理——
      // 这是订阅类App被投诉"会员资格突然消失"最常见的原因之一：用户当时断网/平台接口超时，
      // App 却把这次失败当成"查到了，你不是会员"，于是直接降级成免费用户。
      // 正确做法（已经这样实现）：
      //   - restore() 抛错/超时/网络异常/RevenueCat 还没配置好 → 走到这里，安静跳过，
      //     保留本地缓存，不调用 clearPremium()
      //   - restore() 正常返回、且平台明确告知"没有找到有效订阅/已过期" → 在 applyCustomerInfo()
      //     内部已经调用过 clearPremium() 了，不会走到这个 catch
      console.warn('[Payments.reconcileOnLaunch] 本次RevenueCat查询未成功（保留本地缓存状态，不代表真的不是会员）：', e && e.message);
    }

    // ⚠️⚠️ 真实bug修复（这次新加的"互查"本身审出来的问题，必须记录清楚）：
    // 最早的写法是"不管上面 RevenueCat 查询这次成功还是失败，都跑这段服务器核实，
    // 服务器说不是会员就清空本地状态"。这是错的——而且错得很危险，原因如下：
    //
    // 服务器（Firestore 的 memberships 表）不是实时同步的，它靠 RevenueCat webhook 异步
    // 推送过来更新，中间天然存在延迟窗口，具体会在下面几种情况下"服务器记录暂时还没跟上"：
    //   1. 用户刚买完（purchase()刚返回成功），webhook事件可能还在路上，没几秒钟延迟很正常
    //   2. 这次新加的 Purchases.logIn({appUserID: Auth.deviceId()}) 绑定——对"这个功能
    //      上线之前就已经真实付过钱"的老用户，logIn()会触发RevenueCat内部把他们原来的
    //      匿名身份下的购买记录"过户"到deviceId这个新身份下（这是RevenueCat自己的机制，
    //      会再触发一次webhook事件），但这个过户事件从RevenueCat发出、到我们的webhook
    //      处理完、写进Firestore，同样有延迟——老用户升级到这个新版本后第一次打开App，
    //      极有可能正好撞在这个延迟窗口里。
    //   3. webhook本身临时故障、Firebase偶尔抖动，都可能让Firestore暂时落后于真实状态。
    //
    // 而上面 revenueCatAdapter.getCustomerInfo() 查到的结果，是直接问 Apple/Google 的
    // 平台本身（经RevenueCat代理），不存在这个延迟问题，是这一刻"最新鲜、最可信"的真相。
    // 如果这次调用已经成功确认了"是会员"（rcResult 不是 null/undefined），就不应该再让
    // 服务器（可能落后几秒到几分钟的缓存）的否定结果去覆盖它——那样会把一个刚刚被平台亲口
    // 确认为真实会员的人，当场误判成"伪造会员"而清空，这正是用户最担心的"升级/续费/老用户
    // 迁移后，权益错位、无故被收回"这类不公平体验，而且后果比"少查一次"更严重。
    //
    // 修复后的正确边界：服务器核实只在"这次 RevenueCat SDK 本身没能给出确认结果"
    // （比如 SDK 还没配置好、网络失败、SDK抛错）时才生效，去补"SDK查不到"这个缺口；
    // 只要 SDK 这次自己就查到了"是会员"的确认结果，就完全不去问服务器、更不会用服务器的
    // 结果覆盖它——这才是"第二层保险"该有的样子：补位，而不是抢着否决第一层刚给出的肯定结果。
    if(!rcResult){
      try{
        if(typeof Auth==='undefined' || typeof Auth.deviceId!=='function') return rcResult;
        const serverResult = await verifyWithServer(Auth.deviceId());
        if(serverResult === undefined) return rcResult; // 没部署这道保险，什么都不做
        const localIsPremium = (typeof Membership!=='undefined') && Membership.isPremium();
        if(serverResult.isPremium === false && localIsPremium){
          // 服务器明确、肯定地说"这个设备不是会员"，本地缓存却显示"是会员"，且这次
          // RevenueCat SDK 自己没能给出确认（否则不会走到这个if块里）——这才是真正可疑的
          // "伪造的本地状态"或"早已过期但本地没刷新"的典型表现，按设计清空本地状态。
          console.warn('[Payments.reconcileOnLaunch] 服务器核实到本设备并非会员，且本次RevenueCat SDK未能给出确认，清空本地伪造/过期状态');
          if(typeof Membership!=='undefined') Membership.clearPremium();
        }
      }catch(e){
        // 同样的原则：服务器这次没查到结果（网络失败/云函数本身出错）≠ 真的不是会员，
        // 安静跳过，保留本地缓存——不能因为服务器这一层偶尔抽风就把人误判成非会员。
        console.warn('[Payments.reconcileOnLaunch] 本次服务器核实未成功（保留本地缓存状态，不代表真的不是会员）：', e && e.message);
      }
    }
    return rcResult;
  }

  // 给 index.html 的启动自检用：返回"哪些平台的 REVENUECAT_API_KEYS 还是占位字符串没换"，
  // 不触发任何真实SDK调用，纯读常量判断——对应 checkPlaceholdersNotShipped() 里的说明。
  function getUnconfiguredPlatformsForDebug(){
    return Object.keys(REVENUECAT_API_KEYS).filter(p => {
      const k = REVENUECAT_API_KEYS[p];
      return !k || String(k).indexOf('REPLACE_WITH_')===0;
    });
  }

  return {
    purchase, restore, isNative, nativePlatform, reconcileOnLaunch,
    getCustomerInfo: () => revenueCatAdapter.getCustomerInfo(),
    logIn: (appUserId) => revenueCatAdapter.logIn(appUserId),
    getUnconfiguredPlatformsForDebug,
    isMembershipVerifyUrlConfigured,
    PRODUCT_IDS
  };
})();
