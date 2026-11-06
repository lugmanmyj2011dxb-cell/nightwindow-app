/* ===================== 眠窗 · 账号与登录适配层（骨架，需要你接入真实后端+SDK才能真正登录） =====================

   这个文件解决的问题：会员资格现在绑定的是"这台设备/这个App Store账号"，换设备、换手机号登录
   的小号、从iOS换到Android，都会出现"明明买过会员却看起来像没买"的情况。账号系统的作用是在
   App Store/Google Play自己的购买记录之上，再加一层"你是谁"的身份，让后端能把会员资格记在
   "这个人"身上，而不是"这台设备"上，从而支持跨设备、跨平台地找回会员资格。

   ⚠️ 现状（和 payments.js 的状况完全一样）：下面每个 providerAdapter 里的登录函数目前都只是
   "占位"，会直接抛出提示错误——因为每一种登录方式都需要你先有真实的后端 + 对应平台的开发者
   凭证（Google Cloud / Meta for Developers / LINE Developers / 微信开放平台等），这些凭证需要
   你自己的公司主体去申请，我没办法在这个环境里代你申请、代你部署后端。每个函数里都写了具体要
   接哪个官方SDK、大致怎么接，你或者外包的后端/移动端开发按注释操作即可。

   ⚠️ 全球和大陆是两套基本独立的账号体系，不建议强行合并成一套：
     - 全球（海外安卓+苹果阶段）：推荐用 Firebase Authentication 或 Supabase Auth 这类现成的
       "账号即服务"，内置邮箱/短信验证码、Google、Facebook、Apple登录，接入工作量最小。
     - 大陆（最后阶段）：Firebase/Google服务在中国大陆访问不稳定，不能依赖；需要一套部署在
       国内云厂商（阿里云/腾讯云）上的独立后端，走国内短信网关做手机号验证 + 微信开放平台做
       微信登录。两套后端分别维护"自己的那批用户"即可，不需要打通——两边的用户本来就几乎不重叠
       （一个是国际身份体系，一个是手机号/微信这种大陆本地身份体系），没必要为了"理论上可能
       有同一个人两边都注册"这种极小概率场景，牺牲两边各自的简单和合规边界。

   关于WhatsApp：⚠️ 这是一个容易搞混的地方——WhatsApp不是一种"登录方式"（不存在"Sign in with
   WhatsApp"这种OAuth协议，Meta没有提供这个产品）。WhatsApp真正能做的，是在"手机号验证码"这个
   登录方式里，把验证码的发送渠道从短信换成WhatsApp消息（通过WhatsApp Business API/Twilio
   Verify等服务商），这在东南亚、印度、拉美这些短信到达率不稳定或者短信成本高的地区是常见做法。
   所以下面没有单独的"WhatsApp登录"，而是在 phoneAdapter 里支持"验证码走WhatsApp还是短信"这个
   选项。

   关于苹果的强制要求：⚠️ App Store审核指南4.8条——如果你的App在iOS上提供了任何第三方登录
   方式（Google/Facebook登录等），就必须同时提供"Sign in with Apple"作为对等选项，这不是建议，
   是审核会卡的硬性要求，苹果端做好之前这条必须记住。

   账号数据模型的详细设计（表结构、身份合并规则、各登录方式接入细节、大陆实名认证的法律依据）
   见 /backend-reference/accounts-design.md。

   ⚠️ Firebase Auth 接入说明（已实现邮箱+密码、Google 登录）：
     1. 在 index.html 里通过 CDN 加载 firebase-app 和 firebase-auth（见 index.html 的 script 标签）
     2. 把下面 FIREBASE_CONFIG 里的占位符换成你 Firebase 项目的真实配置
        （Firebase 控制台 → 项目设置 → 你的应用 → SDK 设置和配置 → 配置）
     3. 在 Firebase 控制台 → Authentication → Sign-in method 里启用"电子邮件/密码"和"Google"
     4. Google 登录需要在 Firebase 控制台配置支持电子邮件（support email）
   其他登录方式（Facebook/微信/手机号）仍需各自的开发者凭证，保留占位。

   ⚠️ Sign in with Apple 接入说明（iOS 原生路径已实现，需完成以下后台配置）：
     【Apple Developer 后台】（developer.apple.com → Certificates, Identifiers & Profiles）
     1. Identifiers → 选中 App ID（com.lugman.nightwindow）→ Capabilities 勾选
        "Sign In with Apple" → Save。（主 App 的 App ID 勾选即可，原生流程不需要单独建 Service ID；
        Service ID 只在"网页端也要跑 Apple 登录"时才需要，眠窗 iOS 端走原生插件，用不到）
     2. 重新生成 Provisioning Profile（Profiles → Edit 开发/发布两个描述文件 → 勾上带
        Sign In with Apple capability 的 App ID → 下载），否则打包时 entitlement 不生效。
     【Xcode / Capacitor 工程】（工程内文件已配好，见下方第 3 步说明）
     3. 依赖与工程配置已在仓库内就位：package.json 已加
        @capacitor-firebase/authentication@^8（对齐 Capacitor 8；旧的
        @capacitor-community/apple-sign-in 已停更、不兼容 Cap 8，弃用）；
        capacitor.config.json 已配 FirebaseAuthentication.skipNativeAuth=true（本项目
        Firebase 走 JS SDK，插件只拿凭证不做原生登录，无需 GoogleService-Info.plist）；
        ios/App/App.entitlements 已含 Sign In with Apple 声明并挂进 pbxproj。
        你只需执行：npm install → npx cap sync ios（装好 CocoaPods 后 pod install 才会真正跑）
     4. 打开 Xcode → Signing & Capabilities 核对 "Sign In with Apple" 已出现在列表
        （entitlements 文件已声明，正常会自动显示；若签名报错，手动 + Capability 补一次）
     【Firebase 控制台】（让 identityToken 能换成 Firebase 登录态）
     5. Authentication → Sign-in method → 添加新提供商 → Apple → 启用。
        "服务 ID"栏可留空（仅 Web 流程需要），iOS 原生登录不校验它。
     【原理】原生插件走 Apple 官方 AuthenticationServices 框架，拿到 identityToken（JWT）→
     Firebase 用 Apple 公钥验签后签发自己的登录态。全程不经过我们自己的服务器，
     身份标识用 Firebase uid（内部即 Apple 的 stable user identifier，不会因用户改邮箱而变）。
     ⚠️ Apple 只在"第一次授权"时返回姓名/邮箱，之后只回 identityToken——所以拿到 name 的那次
     要立刻存进 displayName。
================================================================= */
// Firebase 项目「Night Window」（ID: night-window）Web 应用配置，2026-10-16 从控制台取回并填写
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCmifuwHvoMcMACmlD3_N5DAaVEVvXqStc',
  authDomain: 'night-window.firebaseapp.com',
  projectId: 'night-window',
  appId: '1:804960832199:web:897679edb59d6a149acce2'
};

// 延迟初始化 Firebase Auth：等 firebase-auth SDK 加载完再初始化
let _fbAuth = null;
function getFbAuth(){
  if(_fbAuth) return _fbAuth;
  if(typeof firebase==='undefined' || !firebase.auth){
    throw new Error('Firebase Auth SDK 未加载，请检查 index.html 里的 firebase script 标签');
  }
  if(!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('REPLACE_WITH_')===0){
    throw new Error('Firebase 配置未填写，请在 auth.js 顶部填入 FIREBASE_CONFIG');
  }
  if(!firebase.apps.length){ firebase.initializeApp(FIREBASE_CONFIG); }
  _fbAuth = firebase.auth();
  return _fbAuth;
}
const Auth = (function(){
  const STORAGE_KEY = 'nightwindow_auth_v1';
  const LOCAL_DEVICE_ID_KEY = 'nightwindow_device_id_v1';

  // ---- 本机设备 id：登录前的"游客"状态也需要一个稳定标识，用来在用户第一次登录时，
  //      把登录前在本机攒下的数据（最近播放、自定义组合、连续天数等）迁移/关联到账号上，
  //      否则用户登录那一刻会感觉"东西全没了"。这不是账号系统，只是一个本机随机id。
  function deviceId(){
    try{
      let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
      if(!id){
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
        localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
      }
      return id;
    }catch(e){ return 'dev_unknown'; }
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return {loggedIn:false, userId:null, identities:[], displayName:null};
      return JSON.parse(raw);
    }catch(e){ return {loggedIn:false, userId:null, identities:[], displayName:null}; }
  }
  let state = load();

  function persist(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }
  function setLoggedIn(userId, identities, displayName){
    state = {loggedIn:true, userId, identities: identities||[], displayName: displayName||null};
    persist();
    document.dispatchEvent(new CustomEvent('auth-changed', {detail:state}));
    // 登录成功那一刻，把本机游客状态下攒的数据迁移到账号上——见下面 migrateLocalStateIfNeeded() 的注释
    migrateLocalStateIfNeeded();
  }
  function setLoggedOut(){
    state = {loggedIn:false, userId:null, identities:[], displayName:null};
    persist();
    document.dispatchEvent(new CustomEvent('auth-changed', {detail:state}));
  }
  function isLoggedIn(){ return !!state.loggedIn; }
  function getUserId(){ return state.userId; }
  function getIdentities(){ return state.identities; } // 当前账号已绑定的登录方式列表，比如 ['email','google']
  function getDisplayName(){ return state.displayName; }

  // ---- 把游客阶段攒的本机数据，一次性上报给后端关联到新登录的账号 ----
  // 只在"这个设备id还没上报过"时做一次，避免重复登录/重新打开App时反复上报
  const MIGRATED_FLAG_KEY = 'nightwindow_auth_migrated_v1';
  async function migrateLocalStateIfNeeded(){
    try{
      if(localStorage.getItem(MIGRATED_FLAG_KEY)==='1') return;
      const localSnapshot = {
        deviceId: deviceId(),
        streak: safeParse('nightwindow_streak_v1'),
        recentPlay: safeParse('nightwindow_recent_v1'),
        customMixes: safeParse('nightwindow_custom_mixes_v1'),
        grandfatheredFreeScenes: safeParse('nightwindow_grandfathered_free_scenes_v1'),
      };
      // 真实接入后端后，这里应该 POST 到类似 /api/account/migrate-local-state 的接口，
      // 后端把这些数据合并进这个 user_id 名下（冲突时以"数量较大/较新"为准，不覆盖账号上
      // 可能已经有的、来自其他设备的数据）。占位阶段只打个日志，不丢数据也不假装成功。
      console.log('[Auth] 待迁移的本机数据（接入后端后应上报）:', localSnapshot);
      // ⚠️ 真实bug修复（互查时发现）：这里以前不管上面那个 POST 有没有真的发生，都无条件
      // 把 MIGRATED_FLAG_KEY 设成'1'——但上面的注释自己说"占位阶段只打日志，不假装成功"，
      // 代码却正好做了"假装成功"这件事：只要这个函数在占位阶段被调用过一次（比如测试时走过
      // Auth._setLoggedInForTesting 这条路径），这个设备/浏览器档案的迁移标记就被永久标记成
      // "已完成"。等以后真的把上面那行注释改成真实的POST请求时，最小改动的做法往往是直接在
      // console.log那一行旁边加上POST调用，而不会想到去动后面这行"设置标记"的代码——
      // 结果就是真实的迁移请求哪怕失败/还没发生过，标记也早就被占位阶段"预先"设置成1了，
      // 这个函数开头的 `if(...==='1') return` 会直接拦住以后所有真正的迁移尝试，导致用户在
      // 游客阶段攒的连续天数/最近播放/自定义混音/免费场景祖父资格，真正登录账号后永远不会
      // 同步过去。占位阶段不设这个标记，只有未来接入真实请求、且确认请求成功之后才设置。
    }catch(e){ /* 迁移失败不应该阻塞正常登录流程，静默跳过，后端也可以靠 deviceId 事后补迁移 */ }
  }
  function safeParse(key){ try{ return JSON.parse(localStorage.getItem(key)); }catch(e){ return null; } }

  /* ===================== 邮箱登录（邮箱+密码，Firebase Authentication） =====================
     用 Firebase Auth 的邮箱密码方式，不用自己存密码、不用做密码强度校验，Firebase 全管。
     提供：注册、登录、重置密码邮件。登录成功后 onAuthStateChanged 会同步状态。 */
  const emailAdapter = {
    async signUp(email, password){
      const auth = getFbAuth();
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      setLoggedIn(cred.user.uid, ['email'], cred.user.email);
      return cred.user;
    },
    async signIn(email, password){
      const auth = getFbAuth();
      const cred = await auth.signInWithEmailAndPassword(email, password);
      setLoggedIn(cred.user.uid, ['email'], cred.user.email);
      return cred.user;
    },
    async sendPasswordResetEmail(email){
      const auth = getFbAuth();
      await auth.sendPasswordResetEmail(email);
    }
  };

  /* ===================== 手机号登录（验证码，短信或WhatsApp二选一发送） =====================
     channel: 'sms' | 'whatsapp' —— 后者需要通过 Twilio Verify（或同类服务商）配置WhatsApp
     Business API 发送验证码，在短信到达率低/贵的地区（东南亚、印度、拉美）体验更好，
     但WhatsApp本身不是登录协议，只是验证码的另一种送达渠道，核验逻辑和短信验证码完全一样。 */
  const phoneAdapter = {
    async requestCode(e164Phone, channel){ // e164Phone 比如 '+6591234567'
      throw new Error('手机验证码登录尚未接入，需要先接入 Firebase Phone Auth / Twilio Verify 等服务');
    },
    async verifyCode(e164Phone, code){
      throw new Error('手机验证码校验尚未接入');
    }
  };

  /* ===================== Sign in with Apple · iOS 原生路径（优先于 Web 弹窗） =====================
     为什么原生优先：Capacitor WebView 里 signInWithPopup 经常被系统拦截、signInWithRedirect
     会把整个 WebView 跳走再跳回来（状态容易丢）；而原生插件走 Apple 官方 AuthenticationServices
     框架，弹出的是系统级登录面板，体验和可靠性都好得多，也是苹果审核期望的做法。
     插件选型（2026-10-17 核对）：用 @capacitor-firebase/authentication（capacitor-community
     官方系列、活跃维护，8.x 版本对齐本项目的 Capacitor 8）。@capacitor-community/apple-sign-in
     已停更、只支持到旧版 Capacitor，不用。
     本项目 Firebase 走 JS SDK（CDN），所以插件在 capacitor.config.json 里配了
     FirebaseAuthentication.skipNativeAuth=true——插件只负责原生授权拿到凭证，不做原生登录，
     iOS 工程也因此不需要 GoogleService-Info.plist。
     后台配置步骤（Apple Developer / Xcode / Firebase 三处）见本文件顶部注释。 */
  function appleNativeAvailable(){
    try{
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
        && window.Capacitor.getPlatform && window.Capacitor.getPlatform()==='ios'
        && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication);
    }catch(e){ return false; }
  }
  async function signInWithAppleNative(){
    const auth = getFbAuth();
    let result;
    try{
      result = await window.Capacitor.Plugins.FirebaseAuthentication.signInWithApple({
        scopes: ['name', 'email']
      });
    }catch(e){
      // 用户在系统面板里点了取消（ASAuthorizationErrorCanceled），不算错误，静默结束
      const msg = String((e && e.message) || e || '');
      if(/cancel/i.test(msg)) return null;
      throw new Error('Apple 登录失败，请重试（' + msg + '）');
    }
    const cred0 = result && result.credential;
    const idToken = cred0 && cred0.idToken;
    if(!idToken) throw new Error('Apple 未返回身份凭证，请重试');
    const fbProvider = new firebase.auth.OAuthProvider('apple.com');
    // 插件已自动生成并配对防重放 nonce：哈希版发给 Apple 写进 identityToken，
    // raw 版随 credential.nonce 返回，Firebase 验签时自行比对——客户端不用自己算
    const credential = fbProvider.credential({ idToken: idToken, rawNonce: cred0.nonce });
    const cred = await auth.signInWithCredential(credential);
    if(cred && cred.user){
      // ⚠️ 姓名/邮箱只有第一次授权才返回（Apple 的隐私设计），之后登录只给 identityToken，
      // 所以拿到就要立刻用掉；拿不到就退回 Firebase 已存的 displayName（首次合并时 Firebase
      // 会把 Apple 给的 name 写进 user.displayName）
      const name = [cred0.givenName, cred0.familyName].filter(Boolean).join(' ').trim();
      setLoggedIn(cred.user.uid, ['apple'], name || cred.user.displayName || cred.user.email);
    }
    return cred ? cred.user : null;
  }

  /* ===================== Google / Facebook / Apple / LINE OAuth 登录 =====================
     Capacitor原生壳里推荐用对应的原生SDK插件（比如 @capacitor-community/google-login、
     @capacitor-community/facebook-login、@capacitor-community/apple-sign-in），网页端走各自的
     JS SDK。拿到的凭证（idToken/accessToken）都要发到你自己的后端，用对应平台的官方校验接口
     核实这个token真的有效、真的是这个人，再由后端发一个你自己的登录态（session/JWT）回来——
     不能只信任客户端本地拿到的"登录成功"，这一点和 payments.js 里"收据必须后端校验"是同一个
     安全原则。
     ⚠️ LINE Login 不是 Firebase/Supabase 内置支持的标准登录方式，需要单独接 LINE Developers
     后台的OAuth流程，或者在 Firebase 里配置成"通用OIDC供应商"（需要Blaze按量付费计划）。
     ⚠️ Apple Sign-In：iOS上一旦提供Google/Facebook登录，就必须同时提供这个，否则审核不通过
     （App Store审核指南4.8条），不是可选项。
     ⚠️ 身份标识一定要用平台给的"稳定用户ID"（Google的sub、Facebook的user id、Apple的
     stable user identifier），绝不能用邮箱作身份标识——这是这类系统最常见的隐蔽bug：
     用户在Google自己的账号设置里改了邮箱，sub不变但邮箱变了，如果你存的是邮箱，
     下次用同一个Google账号登录会被判定成"新用户"，之前的会员资格和数据全部对不上。
     本文件的 oauthAdapter.signIn() 预期后端返回的身份标识就是这个稳定id，不是邮箱。 */
  const oauthAdapter = {
    async signIn(provider){ // provider: 'google' | 'apple' | 'facebook' | 'line'
      // Sign in with Apple：iOS 原生壳里优先走系统级面板（原因见上方注释）；
      // 插件不可用（比如还没装依赖、或非 iOS 环境）时落回下面的 Web 流程。
      if(provider==='apple' && appleNativeAvailable()){
        return signInWithAppleNative();
      }
      const auth = getFbAuth();
      let fbProvider;
      switch(provider){
        case 'google':
          fbProvider = new firebase.auth.GoogleAuthProvider();
          break;
        case 'apple':
          fbProvider = new firebase.auth.OAuthProvider('apple.com');
          break;
        case 'facebook':
          fbProvider = new firebase.auth.FacebookAuthProvider();
          break;
        default:
          throw new Error(`${provider} 登录需要单独配置 OAuth 凭证（Firebase 控制台 → Authentication → Sign-in method）`);
      }
      const cred = await auth.signInWithPopup(fbProvider).catch(async (e)=>{
        // Capacitor WebView 里 popup 可能被拦，回退到 signInWithRedirect
        if(e.code === 'auth/popup-closed-by-user' || e.code === 'auth/popup-blocked'){
          await auth.signInWithRedirect(fbProvider);
          return null; // redirect 后会重新加载页面，由 onAuthStateChanged 接管
        }
        throw e;
      });
      if(cred && cred.user){
        setLoggedIn(cred.user.uid, [provider], cred.user.displayName || cred.user.email);
      }
      return cred ? cred.user : null;
    }
  };

  /* ===================== 微信/支付宝登录（仅大陆渠道包） =====================
     两条授权通道，App 里按运行环境自动选：
     A. App 原生（生产主路径）：由 Capacitor 原生插件调起微信/支付宝客户端授权，
        插件封装层把回调暴露成 window.__cnNativeWechatAuth() / __cnNativeAlipayAuth()，
        返回 Promise<{code}> / Promise<{authCode}>。集成插件时只需挂上这两个 hook，
        本文件不用改（为什么留 hook 不直接写死插件名：社区插件选型未定，先不绑定第三方包）。
     B. 浏览器/Web 兜底：跳后端 authorize-url → 平台授权 → 回跳本页 → 启动时
        Auth.handleCnOAuthRedirect() 接住 code/state 完成登录（state 由后端一次性校验）。
     拿到授权码之后 App 不做任何密钥交换：一律 POST 大陆后端换我们自己的 session token，
     AppSecret/RSA 私钥永不下发客户端。 */
  const WECHAT_APP_ID = 'REPLACE_WITH_WECHAT_APPID'; // 微信开放平台移动应用的 AppID（原生 SDK 初始化用）
  const ALIPAY_APP_ID = 'REPLACE_WITH_ALIPAY_APPID'; // 支付宝开放平台应用的 AppID（原生 SDK 初始化用）
  const CN_OAUTH_PENDING_KEY = 'nightwindow_cn_oauth_pending_v1';

  // 用后端返回体建立本地登录态（与手机/邮箱登录同一套 session、同一张 users 表）
  function applyCnSession(data, identities, fallbackName){
    if(!data || !data.userId || !data.sessionToken) throw new Error('登录响应异常，请重试');
    try{ localStorage.setItem(CN_SESSION_KEY, data.sessionToken); }catch(e){}
    setLoggedIn(data.userId, identities, data.displayName || fallbackName);
    try{ localStorage.removeItem(CN_OAUTH_PENDING_KEY); }catch(e){}
    return data;
  }

  async function cnGet(path){
    let res;
    try{ res = await fetch(cnApiBase() + path); }
    catch(e){ throw new Error('网络请求失败，请检查网络后重试'); }
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || ('请求失败（' + res.status + '），请稍后重试'));
    return data;
  }

  // 浏览器通道：去后端拿带 state 的授权地址并跳走（回跳由 handleCnOAuthRedirect 接）
  async function startWebOAuth(provider){
    const platform = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'h5' : 'pc';
    const meta = await cnGet('/api/auth/' + provider + '/authorize-url?platform=' + platform);
    if(!meta || !meta.url) throw new Error('授权地址获取失败，请重试');
    try{ localStorage.setItem(CN_OAUTH_PENDING_KEY, provider); }catch(e){}
    window.location.href = meta.url; // 页面跳走；回来时是全新加载
  }

  const wechatAdapter = {
    async signIn(){
      // A. 原生 hook（Capacitor 插件封装层提供）
      if(typeof window.__cnNativeWechatAuth === 'function'){
        const r = await window.__cnNativeWechatAuth(WECHAT_APP_ID);
        if(!r || !r.code) throw new Error('微信授权未完成');
        const data = await cnPost('/api/auth/wechat/login', {code: String(r.code), deviceId: deviceId()});
        return applyCnSession(data, ['wechat'], '微信用户');
      }
      // B. 浏览器通道
      await startWebOAuth('wechat');
      return null; // 页面即将跳走；resolve 只在跳转被拦时才会走到
    }
  };
  const alipayAdapter = {
    async signIn(){
      if(typeof window.__cnNativeAlipayAuth === 'function'){
        const r = await window.__cnNativeAlipayAuth(ALIPAY_APP_ID);
        const authCode = r && (r.authCode || r.code);
        if(!authCode) throw new Error('支付宝授权未完成');
        const data = await cnPost('/api/auth/alipay/login', {authCode: String(authCode), deviceId: deviceId()});
        return applyCnSession(data, ['alipay'], '支付宝用户');
      }
      await startWebOAuth('alipay');
      return null;
    }
  };
  function wechatConfigured(){ return WECHAT_APP_ID.indexOf('REPLACE_WITH_') !== 0; }
  function alipayConfigured(){ return ALIPAY_APP_ID.indexOf('REPLACE_WITH_') !== 0; }

  /* Web 回跳收尾：App 启动时调用一次。URL 上带着平台回调参数时，用 state + 授权码
     打后端 callback（state 在后端一次性校验，防 CSRF），成功即登录。
     返回 'wechat' | 'alipay' | null（null 表示这次启动不是 OAuth 回跳）。 */
  async function handleCnOAuthRedirect(){
    let params;
    try{ params = new URLSearchParams(window.location.search); }catch(e){ return null; }
    const state = params.get('state');
    if(!state) return null;
    const wCode = params.get('code');                 // 微信回跳字段
    const aCode = params.get('auth_code');            // 支付宝回跳字段
    try{
      if(wCode && (localStorage.getItem(CN_OAUTH_PENDING_KEY) === 'wechat')){
        const data = await cnGet('/api/auth/wechat/callback?code=' + encodeURIComponent(wCode) + '&state=' + encodeURIComponent(state));
        applyCnSession(data, ['wechat'], '微信用户');
        return 'wechat';
      }
      if(aCode && (localStorage.getItem(CN_OAUTH_PENDING_KEY) === 'alipay')){
        const data = await cnGet('/api/auth/alipay/callback?auth_code=' + encodeURIComponent(aCode) + '&state=' + encodeURIComponent(state));
        applyCnSession(data, ['alipay'], '支付宝用户');
        return 'alipay';
      }
    }catch(e){
      try{ localStorage.removeItem(CN_OAUTH_PENDING_KEY); }catch(_){}
      throw e; // 交给启动调用方提示（如"授权已过期，请重新登录"）
    }
    return null;
  }

  /* ===================== 大陆手机号验证码登录（实名认证） =====================
     ⚠️ 法律依据澄清（避免过度收集）：根据"最小必要原则"（个人信息保护法第6条），普通消费类
     App——不涉及直播打赏、金融、UGC内容发布审核——只需要手机号验证码即可满足"实名"要求，
     不需要上传身份证照片或做人脸识别。原因是：中国大陆的手机号在运营商层面已经强制实名制
     （办卡本身就要求身份证实名），所以App只要验证"这个手机号确实是你本人在用"（靠验证码），
     就间接满足了实名要求，不需要App自己再收集一次身份证信息。
     身份证+人脸识别只在"开通直播/打赏/大额支付"等敏感场景才需要，眠窗目前的功能（听白噪音、
     买会员）不触发这个门槛，除非以后加了UGC社区/打赏之类的功能，到时候要重新评估。
     大陆短信网关建议用阿里云/腾讯云的短信服务（不能用Twilio等海外服务商，大陆手机号收不到）。

     ⚠️ 接入说明：
       1. 大陆后端的参考实现在 /backend-reference/china-phone-auth/server.js（含阿里云/腾讯云
          短信适配、验证码限频、登录态签发），把它部署到境内云服务器后，把下面的
          CHINA_AUTH_API_BASE 换成实际域名即可。
       2. 这套体系和 Firebase 完全独立（Firebase/Google 在大陆访问不稳定，不能依赖）：
          验证码、user_id、登录态全部出自我们自己的大陆后端，user_id 前缀 'cn_' 以示区分。
       3. verifyCode 成功后后端会签发一个登录 token（存 CN_SESSION_KEY），以后调用大陆后端的
          账号接口（绑定/换绑/会员同步）时在 Authorization 头里带上它。 */
  // ⚠️ 换成你大陆后端的实际地址，例如 'https://api.nightwindow.cn'（部署见 china-phone-auth/server.js）
  const CHINA_AUTH_API_BASE = 'REPLACE_WITH_CHINA_AUTH_API_BASE';
  const CN_SESSION_KEY = 'nightwindow_cn_session_v1';
  const CN_PHONE_RE = /^1[3-9]\d{9}$/; // 大陆手机号通用段，不细分运营商

  function cnApiBase(){
    if(!CHINA_AUTH_API_BASE || CHINA_AUTH_API_BASE.indexOf('REPLACE_WITH_')===0){
      throw new Error('大陆登录后端地址未配置，请先部署 backend-reference/china-phone-auth/server.js 并把 CHINA_AUTH_API_BASE 填到 auth.js');
    }
    return CHINA_AUTH_API_BASE.replace(/\/+$/,'');
  }
  async function cnPost(path, body){
    let res;
    try{
      res = await fetch(cnApiBase() + path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
    }catch(e){
      throw new Error('网络请求失败，请检查网络后重试');
    }
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      // 429 = 触发限频（发送太频繁/当日已达上限），后端会带 retryAfterSeconds
      if(res.status===429){
        const wait = data.retryAfterSeconds;
        throw new Error(wait ? `发送太频繁，请 ${Math.ceil(wait/60)} 分钟后再试` : (data.error || '请求太频繁，请稍后再试'));
      }
      throw new Error(data.error || ('请求失败（' + res.status + '），请稍后重试'));
    }
    return data;
  }

  const chinaPhoneAdapter = {
    // 请求发送验证码。resolve 值：{cooldownSeconds} —— UI 用它做"60 秒后可重发"倒计时
    async requestCode(cnPhone){
      if(!CN_PHONE_RE.test(cnPhone)) throw new Error('请输入正确的 11 位大陆手机号');
      return cnPost('/api/auth/cn-phone/request-code', {phone: cnPhone, deviceId: deviceId()});
    },
    // 校验验证码。成功后建立本地登录态（user_id 由大陆后端签发，前缀 cn_）
    async verifyCode(cnPhone, code){
      if(!CN_PHONE_RE.test(cnPhone)) throw new Error('请输入正确的 11 位大陆手机号');
      if(!/^\d{6}$/.test(String(code))) throw new Error('请输入 6 位数字验证码');
      const data = await cnPost('/api/auth/cn-phone/verify', {phone: cnPhone, code: String(code), deviceId: deviceId()});
      if(!data.userId || !data.sessionToken) throw new Error('登录响应异常，请重试');
      try{ localStorage.setItem(CN_SESSION_KEY, data.sessionToken); }catch(e){}
      // displayName 用脱敏手机号（138****1234），不落明文
      const masked = cnPhone.slice(0,3) + '****' + cnPhone.slice(7);
      setLoggedIn(data.userId, ['cn-phone'], data.displayName || masked);
      return data;
    }
  };
  // 大陆登录态 token：以后调大陆后端的账号接口时带 Authorization: Bearer <token>
  function getCnSessionToken(){
    try{ return localStorage.getItem(CN_SESSION_KEY); }catch(e){ return null; }
  }

  /* ===================== 大陆邮箱密码登录（与手机号同一套大陆后端） =====================
     Firebase 在大陆访问不稳定，所以大陆区的邮箱登录也走自建后端（server.js 的
     /api/auth/cn-email/register|login，scrypt 哈希存密码）。与手机号登录共用
     CN_SESSION_KEY 登录态，user_id 同样 cn_ 前缀——同后端的 users 表，后续绑定/合并
     （accounts-design.md 第四节）在服务端做，App 端不猜。 */
  const cnEmailAdapter = {
    async signIn(email, password){
      const data = await cnPost('/api/auth/cn-email/login', {email: String(email||'').trim(), password: String(password||''), deviceId: deviceId()});
      if(!data.userId || !data.sessionToken) throw new Error('登录响应异常，请重试');
      try{ localStorage.setItem(CN_SESSION_KEY, data.sessionToken); }catch(e){}
      setLoggedIn(data.userId, ['cn-email'], data.displayName || String(email||'').trim());
      return data;
    },
    async signUp(email, password){
      const data = await cnPost('/api/auth/cn-email/register', {email: String(email||'').trim(), password: String(password||''), deviceId: deviceId()});
      if(!data.userId || !data.sessionToken) throw new Error('注册响应异常，请重试');
      try{ localStorage.setItem(CN_SESSION_KEY, data.sessionToken); }catch(e){}
      setLoggedIn(data.userId, ['cn-email'], data.displayName || String(email||'').trim());
      return data;
    }
  };
  // 大陆手机号登录是否已配置后端（不抛错，供 UI 判断要不要显示"手机号登录"区块）：
  // 全球版不配置 CHINA_AUTH_API_BASE，登录面板就只显示邮箱+第三方；大陆版配置后自动切换。
  function chinaAuthConfigured(){
    return !!(CHINA_AUTH_API_BASE && CHINA_AUTH_API_BASE.indexOf('REPLACE_WITH_')!==0);
  }

  /* ===================== 账号绑定/合并：解决"同一个人换登录方式"的问题 =====================
     核心原则：不做"猜测性自动合并"（比如看到同一个名字就自动合并两个账号），只在后端能
     100%确认"这是同一个人"的两种情况下处理：
       1. 用户当前已登录，主动在"账号设置"里点"绑定Google/绑定手机号"——这是最主要、最安全的
          路径，用户自己说了"这是我的另一个登录方式"，后端直接把新身份挂到当前 user_id 下
          （前提是这个身份没有被别的账号占用，否则要提示"该Google账号已被另一个账号绑定"）。
       2. 新登录方式验证后拿到的邮箱，和账号体系里已存在、且同样经过验证的邮箱完全一致
          （比如用Google登录，Google自己验证过这个邮箱确实属于登录者，而这个邮箱恰好也是
          之前邮箱验证码登录时验证过的那个）——这种情况可以安全自动合并，因为两边都是
          "平台验证过的邮箱"，不是用户自己随口填的。
     不做自动合并的情况：手机号和邮箱之间没有直接验证关系、不同OAuth供应商给的"姓名"字段
     相同但邮箱不同——这些只能引导用户去账号设置里手动绑定，不能替用户做决定，否则有把
     陌生人账号误合并到一起、造成会员资格/隐私泄露给错误的人的风险。
     详细的表结构和合并判定伪代码见 /backend-reference/accounts-design.md。 */
  async function linkIdentity(provider){
    if(!isLoggedIn()) throw new Error('请先登录后再绑定其他登录方式');
    throw new Error(`绑定 ${provider} 尚未接入，需要先完成对应登录方式的后端接入`);
  }

  /* ===================== 解绑登录方式：必须保留至少一种，不能把自己锁死 =====================
     ⚠️ 这是账号系统里最容易漏掉、后果却最严重的一个边界条件：如果允许解绑到0种登录方式，
     用户下次重装App/换设备时就再也登不进这个账号了（没有任何凭证可以证明"我是我"），
     会员资格和本机数据实质上永久丢失，客服也很难补救（没法验证申诉的人就是本人）。
     所以客户端和后端都要各自拦一次——客户端这里先拦掉大部分误操作，但真正的安全边界必须
     在后端重复校验（客户端的拦截可以被绕过），这一点和其他所有安全判断一样，前端只是
     体验层的提前拦截，不能替代后端。 */
  const MIN_IDENTITIES = 1;
  async function unlinkIdentity(provider){
    if(!isLoggedIn()) throw new Error('请先登录');
    if(state.identities.length <= MIN_IDENTITIES){
      throw new Error('至少要保留一种登录方式，请先绑定另一种登录方式，再解绑这一个');
    }
    throw new Error(`解绑 ${provider} 尚未接入，需要先完成后端接入`);
    // 真实接入后，后端这一步也要原样校验"不能减到0个"，而不是信任前端已经拦过了；
    // 解绑成功后，应该给这个人其它仍然有效的登录渠道发一条安全提醒
    // （"你的账号刚解绑了手机号 138****1234，如果不是你本人操作，请立即联系客服"），
    // 防止"账号被盗用后，攻击者解绑掉机主能用的那种登录方式"这种场景发生时机主毫不知情。
  }

  /* ===================== 换绑邮箱/手机号：一步到位，不要让用户先解绑再重新绑 =====================
     ⚠️ 这是这次专门要解决的体验问题：如果换个邮箱要先点"解绑旧邮箱"再点"绑定新邮箱"两步，
     中间万一新邮箱验证失败/用户中断，就会卡在"一个邮箱都没有"的中间状态——不仅危险（撞到
     上面"至少保留一种"的边界），对用户来说也是无意义的额外操作，换手机号这种本来就带点
     小麻烦的事，不该再因为App自己的设计让用户多跑一趟。
     做法：验证新凭证成功之后，由后端在同一个事务里"新增新身份 + 删除同一 provider 类型的
     旧身份"，一步完成，用户只感觉是"改了一下邮箱"，不需要知道背后是两次操作。
     同时：旧邮箱/手机号不会立刻被别人注册走——后端应该给这个凭证留一个"冷却期"（建议30天，
     见 /backend-reference/accounts-design.md），避免手机号运营商回收复用号码后，新机主
     立刻能用这个号码登录进你的旧账号；旧邮箱/手机号也会收到一条"你的登录方式已变更"的
     安全提醒（如果这个渠道本身还能收到信，比如旧邮箱没停用）。 */
  async function changeEmail(newEmail){
    if(!isLoggedIn()) throw new Error('请先登录');
    throw new Error('更换邮箱尚未接入，需要先完成邮箱验证码 + 后端"原子换绑"接口的接入');
  }
  async function changePhone(newE164Phone){
    if(!isLoggedIn()) throw new Error('请先登录');
    throw new Error('更换手机号尚未接入，需要先完成手机验证码 + 后端"原子换绑"接口的接入');
  }

  async function signOut(){
    try{ const auth = getFbAuth(); await auth.signOut(); }catch(e){ /* SDK 没配置时只清本地 */ }
    try{ localStorage.removeItem(CN_SESSION_KEY); }catch(e){ /* 大陆登录态一并清掉 */ }
    setLoggedOut();
  }

  // 监听 Firebase Auth 状态变化，和本地 Auth 状态保持同步
  // （比如 redirect 登录回来、token 过期、其他地方登出等）
  try{
    const auth = getFbAuth();
    auth.onAuthStateChanged((user)=>{
      if(user && !isLoggedIn()){
        const identities = user.providerData.map(p=>p.providerId.replace('.com','').replace('google','google'));
        setLoggedIn(user.uid, identities, user.displayName || user.email);
      }else if(!user && isLoggedIn()){
        setLoggedOut();
      }
    });
  }catch(e){ /* Firebase 未配置时忽略，纯本地状态仍可用 */ }

  /* ===================== 数据导出 / 账号注销 =====================
     不是可做可不做的加分项：
       - Apple审核指南5.1.1(v)强制要求"支持App内创建账号的App，必须支持App内直接注销账号"；
       - GDPR第17/20条、《个人信息保护法》第47条要求用户能删除/导出自己的个人信息。
     具体接口设计、法定保留期、为什么不需要身份证实名认证，见
     /backend-reference/accounts-design.md 的"八、九、十"三节。这里先留出前端入口，
     后端接口接入之前会原样抛出下面的提示错误，不会误导成"已经注销/已经导出成功"。 */
  async function exportMyData(){
    if(!isLoggedIn()) throw new Error('请先登录');
    throw new Error('数据导出尚未接入，需要先完成后端 /api/account/export 接口');
  }

  /* ===================== 账号注销（2026-10-15 已实现真实删除流程） =====================
     流程分两步，一步都不能少：
       1. 前端先走 Firebase Auth 的 user.delete()——这一步会触发 Firebase 自己的安全验证
          （比如要求用户近期登录过，或要求重新输入密码/重新 OAuth 验证），确保是本人操作。
       2. 前端拿到 Firebase Auth 的 ID Token，调用后端 deleteAccount 云函数，删除 Firestore
          里这个用户的所有数据（memberships + memberships_test 两张表）。

     ⚠️ 已知限制（诚实说明，不是 bug）：
       - 如果用户是用 Google/Apple 等 OAuth 登录的，Firebase 的 user.delete() 在 Capacitor
         WebView 里可能会因为"需要近期登录"而失败，这时候会抛出 auth/requires-recent-login
         错误。前端需要捕获这个错误，引导用户"先退出登录，再重新登录一次，然后再来注销"。
         这是 Firebase 的安全机制，不是我们能绕过的。
       - 注销后，RevenueCat 那边的购买记录还在（这是 Apple/Google 的购买历史，我们删不了），
         但我们的服务器上不再有任何"这个用户是不是会员"的记录。如果用户以后重新注册，
         需要重新走购买/恢复流程。
       - 本机 localStorage 里的游客数据（连续天数、最近播放、自定义混音等）不会自动清除，
         因为那些数据绑定的是 deviceId，不是账号。如果用户想完全清空，需要手动卸载重装。 */
  async function deleteAccount(){
    if(!isLoggedIn()) throw new Error('请先登录');

    const auth = getFbAuth();
    const user = auth.currentUser;
    if(!user) throw new Error('当前登录状态异常，请重新登录后再试');

    // 第一步：拿到 Firebase Auth ID Token（后端校验用）
    let idToken;
    try{
      idToken = await user.getIdToken();
    }catch(e){
      throw new Error('获取登录凭证失败，请重新登录后再试');
    }

    // 第二步：调用后端删除 Firestore 数据
    const ACCOUNT_DELETE_URL = 'REPLACE_WITH_YOUR_DELETE_ACCOUNT_FUNCTION_URL';
    if(!ACCOUNT_DELETE_URL || ACCOUNT_DELETE_URL.indexOf('REPLACE_WITH_')===0){
      throw new Error('账号注销后端接口尚未配置，请先在 functions/index.js 部署 deleteAccount 函数并把 URL 填到这里');
    }

    let deleteRes;
    try{
      deleteRes = await fetch(ACCOUNT_DELETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken
        },
        body: JSON.stringify({ app_user_id: Auth.deviceId() })
      });
    }catch(e){
      throw new Error('网络请求失败，请检查网络后重试');
    }

    if(!deleteRes.ok){
      const errData = await deleteRes.json().catch(()=>({}));
      if(deleteRes.status === 403 && errData.error === 'uid_mismatch'){
        throw new Error('身份验证失败，请重新登录后再试');
      }
      throw new Error('删除服务器数据失败（' + deleteRes.status + '），请稍后重试或联系客服');
    }

    // 第三步：删除 Firebase Auth 账号（这一步会触发 Firebase 自己的安全验证）
    try{
      await user.delete();
    }catch(e){
      // 如果 Firebase 要求近期登录，捕获并给出明确指引
      if(e.code === 'auth/requires-recent-login'){
        throw new Error('为了安全，请先退出登录，再重新登录一次，然后立即回来注销账号');
      }
      throw new Error('删除登录账号失败：' + (e.message || e.code || '未知错误'));
    }

    // 第四步：清除本地登录状态
    setLoggedOut();

    return { ok: true };
  }

  // ⚠️ 和 membership.js 的 __setPremiumForTesting 同一个风险：这段代码会原样打包进正式App，
  // 任何人打开控制台都能调用 Auth._setLoggedInForTesting(...) 把自己伪造成"已登录"状态。
  // 同样加运行环境判断，只在非原生环境（网页开发调试）下生效，正式原生App里拒绝执行。
  function setLoggedInForTesting(userId, identities, displayName){
    if(typeof isNativeApp==='function' && isNativeApp()){
      console.warn('[Auth] _setLoggedInForTesting 在正式 App 环境下已禁用，仅限网页开发调试使用');
      return;
    }
    setLoggedIn(userId, identities, displayName);
  }

  return {
    deviceId, isLoggedIn, getUserId, getIdentities, getDisplayName, signOut,
    linkIdentity, unlinkIdentity, changeEmail, changePhone, exportMyData, deleteAccount,
    emailAdapter, phoneAdapter, oauthAdapter, wechatAdapter, alipayAdapter, wechatConfigured, alipayConfigured, handleCnOAuthRedirect, chinaPhoneAdapter, cnEmailAdapter, chinaAuthConfigured,
    getCnSessionToken,
    _setLoggedInForTesting: setLoggedInForTesting
  };
})();
