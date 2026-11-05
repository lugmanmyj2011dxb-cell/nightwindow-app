/* ===================== 眠窗 · 远程配置（Firebase Remote Config） =====================

   这个文件解决什么问题：把"免费线"（哪些单轨音免费、会员内容清醒预览多少秒、免费用户
   手动混音最多几轨、混音组合的保存/使用是否只给会员、前几晚是否放开、紧急总开关）做成**远程参数**。以后要调整这条线，
   改 Firebase 控制台里的参数即可，不用重新打包、不用重新送审、不用等审核。

   为什么睡眠 App 在这里必须格外保守（三条铁律）：

     1. 绝不阻塞启动、绝不影响播放。睡眠场景大量发生在深夜、弱网甚至飞行模式，
        配置拉取失败是常态而不是异常。所以：拉不到就用本地默认值，超时直接放弃，
        任何一步出错都静默回落，绝不能让一个远程配置文件的问题影响到"能不能睡着"。
     2. 本地默认值必须是**最保守的那一档**（宁可少限制、不可把用户挡在门外）。
        当前默认 = 免费线未启用 = 所有声音免费、不限时长，与 1.0.3 线上行为完全一致。
        等 v5 的 gating 真的做好了、验证过了，再把这里的默认值改成真实免费线。
     3. 只读不写。这个文件只负责"读出规则是什么"，不碰任何播放状态、不碰 master.gain、
        不碰任何计时变量——规则的执行由消费方（membership.js / index.html）负责。

   ---- 免费线的启用语义（刻意做得显式，避免"部分参数生效"这类难查的状态） ----
     kill_switch = true           → 免费线完全关闭，所有内容免费、无预览拦截（最高优先级，救火用）
     free_scene_ids 为空串        → 同上：没有配置免费清单，就当免费线没启用
     以上两条都不成立时            → 免费线启用：free_scene_ids 里的单轨音免费、整晚可用，
                                    其余内容与远程场景为会员专属；非会员过了 first_nights_free 晚
                                    宽限后，激活会员内容时获得 preview_seconds 秒清醒预览
                                    （2026-10-16 定稿：播放开始后绝不中途打断，拦截只发生在选择时刻）

   ---- 需要在 Firebase 控制台建的参数（Remote Config → 参数，键名必须与下面 DEFAULTS 一致） ----
     free_scene_ids      字符串，逗号分隔的免费单轨音 id，例：lightRain,blizzard,fire,wind
     preview_seconds     数字，宽限期后非会员激活会员内容时的清醒预览时长（秒）；0 = 不做预览拦截
     max_free_tracks     数字，免费用户手动混音最大轨道数；0 = 不限制
     mix_member_only     布尔，混音组合的保存/使用是否只给会员
     first_nights_free   数字，前 N 晚完整使用宽限（0 = 不放开）
     kill_switch         布尔，紧急总开关

   ⚠️ 前提：Firebase 项目的 FIREBASE_CONFIG 必须已在 auth.js 里填好（见 auth.js 顶部）。
      没填的话下面会直接跳过远程拉取、全程使用本地默认值，App 照常可用。
      同时要在 Firebase 控制台 → Authentication 之外，确认 Remote Config 已启用（首次进入该页面即自动启用）。
================================================================= */
const RemoteConfig = (function(){
  const CACHE_KEY = 'nightwindow_rc_cache_v1'; // 上次成功拉到的值，离线时接着用
  const FETCH_TIMEOUT_MS = 8000;               // 睡眠App：8 秒拉不到就放弃，绝不能拖着影响播放
  const MIN_FETCH_INTERVAL_MS = 12*3600*1000;  // 12 小时内不重复联网拉取，省流量、省电量

  // 本地默认值 —— 远程拉不到时用这一份。必须是最保守的一档，见文件顶部铁律 2。
  const DEFAULTS = {
    free_scene_ids: '',
    preview_seconds: 90,
    max_free_tracks: 2,
    mix_member_only: true,
    first_nights_free: 3,
    kill_switch: false
  };

  // 当前生效值：先给默认值，拿到缓存/远程后再覆盖。任何读函数在任何时刻调用都必须能返回结果。
  let values = Object.assign({}, DEFAULTS);
  let source = 'default'; // 'default' | 'cache' | 'remote'，只用于调试和排查
  let _readyResolve;
  const ready = new Promise(function(resolve){ _readyResolve = resolve; });
  let _settled = false;
  function settle(){
    if(_settled) return;
    _settled = true;
    try{ window.dispatchEvent(new CustomEvent('remote-config-ready', {detail:{source:source}})); }catch(e){}
    _readyResolve(values);
  }

  // ---- 第①步：同步读 localStorage 缓存。这一步必须是同步的、放在最前面，
  //      这样"深夜离线直接打开 App"时，付费墙和播放逻辑在第一时间就有正确的规则可用，
  //      不用等网络（也就是不用等一个可能永远不会来的响应）。
  function loadCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return false;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed!=='object') return false;
      // 只接受我们认识的键，缓存被人手改坏/格式错乱时也不会把奇怪的字段带进运行时
      Object.keys(DEFAULTS).forEach(function(k){
        if(Object.prototype.hasOwnProperty.call(parsed, k)){
          values[k] = coerce(k, parsed[k]);
        }
      });
      source = 'cache';
      return true;
    }catch(e){ return false; }
  }

  // ---- 类型归一：远程参数是字符串，但如果以后改了参数类型（或缓存的旧版本格式不同），
  //      这里统一收敛，读出来的一定是期望的类型，避免消费方到处写零散的判断。
  function coerce(key, v){
    const d = DEFAULTS[key];
    if(typeof d === 'number'){
      const n = Number(v);
      if(!isFinite(n) || n < 0) return d; // 负数/NaN/乱七八糟的值一律回落到默认，不做部分信任
      return n;
    }
    if(typeof d === 'boolean'){
      if(typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      if(s === 'true' || s === '1' || s === 'yes') return true;
      if(s === 'false' || s === '0' || s === 'no') return false;
      return d;
    }
    return v == null ? d : String(v);
  }

  // ---- 第②步：后台静默联网拉取。不 await、不阻塞、不抛错。
  function startFetch(){
    try{
      if(typeof firebase === 'undefined' || !firebase.remoteConfig) return settle(); // SDK 没加载（网页预览等）→ 用默认值
      if(typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey
         || String(FIREBASE_CONFIG.apiKey).indexOf('REPLACE_WITH_') === 0){
        return settle(); // Firebase 还没配置 → 用默认值，App 照常可用
      }
      if(!firebase.apps.length){
        // auth.js 的 getFbAuth() 会负责初始化；这里只在它还没被调用过（用户没进过账号页）时兜底初始化，
        // 避免出现两个不同的默认 app 实例。
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      const rc = firebase.remoteConfig();
      rc.settings = { minimumFetchIntervalMillis: MIN_FETCH_INTERVAL_MS };

      let done = false;
      const timer = setTimeout(function(){
        if(done) return; done = true;
        console.log('[远程配置] 拉取超时，先按' + (source === 'cache' ? '缓存' : '默认值') + '运行');
        settle();
      }, FETCH_TIMEOUT_MS);

      rc.fetchAndActivate().then(function(activated){
        if(done) return; done = true;
        clearTimeout(timer);
        if(activated){
          Object.keys(DEFAULTS).forEach(function(k){
            const d = DEFAULTS[k];
            if(typeof d === 'number')      values[k] = coerce(k, rc.getNumber(k));
            else if(typeof d === 'boolean') values[k] = coerce(k, rc.getBoolean(k));
            else                            values[k] = coerce(k, rc.getString(k));
          });
          source = 'remote';
          try{ localStorage.setItem(CACHE_KEY, JSON.stringify(values)); }catch(e){ /* 存储满等，不影响主流程 */ }
        }
        console.log('[远程配置] 已生效，来源=' + source, values);
        settle();
      }).catch(function(err){
        if(done) return; done = true;
        clearTimeout(timer);
        console.warn('[远程配置] 拉取失败，继续使用' + (source === 'cache' ? '缓存' : '默认值') + ':', err && (err.code || err.message));
        settle();
      });
    }catch(e){
      console.warn('[远程配置] 初始化异常，继续使用默认值:', e && e.message);
      settle();
    }
  }

  // ---- 读取接口（消费方只用这些，不直接碰上面的 values，便于以后换实现） ----
  function get(key){ return values[key]; }
  function getAll(){ return Object.assign({}, values); }
  function getSource(){ return source; }

  // 免费线是否真的启用（见文件顶部"启用语义"）
  function isFreeLineEnabled(){
    if(values.kill_switch) return false;
    return getFreeSceneIds().length > 0;
  }
  function getFreeSceneIds(){
    return String(values.free_scene_ids || '')
      .split(',')
      .map(function(s){ return s.trim(); })
      .filter(function(s){ return /^[a-zA-Z0-9_]{1,64}$/.test(s); }); // 和 remote-scenes.js 的 id 校验保持同一标准
  }
  function getPreviewSeconds(){
    if(!isFreeLineEnabled()) return 0; // 免费线没启用 = 不做预览拦截
    return values.preview_seconds;
  }
  function getMaxFreeTracks(){ return values.max_free_tracks; }
  function isMixMemberOnly(){ return !!values.mix_member_only; }
  function getFirstNightsFree(){ return values.first_nights_free; }

  // ---- 启动：同步读缓存 → 立即有可用值 → 后台联网更新（不阻塞任何调用方） ----
  loadCache();
  startFetch();

  return {
    ready: ready,
    get: get,
    getAll: getAll,
    getSource: getSource,
    isFreeLineEnabled: isFreeLineEnabled,
    getFreeSceneIds: getFreeSceneIds,
    getPreviewSeconds: getPreviewSeconds,
    getMaxFreeTracks: getMaxFreeTracks,
    isMixMemberOnly: isMixMemberOnly,
    getFirstNightsFree: getFirstNightsFree,
    DEFAULTS: DEFAULTS // 调试用：控制台里 __rc() 之类的排查入口可以对照
  };
})();
