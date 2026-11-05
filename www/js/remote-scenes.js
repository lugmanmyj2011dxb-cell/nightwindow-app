/* ===================== 眠窗 · 远程场景清单（以后加场景不用重新提审的关键机制） =====================

   背景：SOUND_DEFS / SCENE_VIDEO 这些定义现在写死在 index.html 里，属于 App 安装包本身的
   一部分。改它们、加新场景，必须重新打包、重新提审 App Store / Google Play，等审核通过
   用户才能用上——这个周期短则几小时，长则好几天，而且每次都要走一遍流程。

   这个文件提供的是"内容层面的场景"可以脱离这个周期：只要新场景是——
     ① 挂在现有的分组下（雨/雪/木屋/更多质感/雪夜市井/旅途/星空/微光/水声/自然/室内/噪声/太空/低频共鸣）
     ② 用的是现有的声音合成"类型"（rain/wind/fire/noise/fan/ocean/water/insect/bird/tone/chime/rumble/clock，
        也就是现有滑块已经在用的那几种）
   ——那么加一个新场景，只需要：
     1. 处理好视频（裁剪/调色/压缩，跟之前的流程一样）
     2. 传到你自己的远程素材托管（跟 remote-assets/ 里其它文件放一起）
     3. 在托管目录里放一份 / 更新 scenes-manifest.json（下面有格式说明和示例）
     4. 完事——用户不需要更新 App，下次打开 App 时会自动检测到新场景，多一条新滑块可以玩

   如果以后想加的是全新的分组（比如"海洋"分组）或全新的声音合成方式（比如鸟鸣类的音色引擎），
   这些涉及界面结构或音频引擎本身的改动，还是得走"改代码 → 重新提审"这条老路，
   这个机制解决不了那种情况——这个边界要清楚，不是所有扩展都能免提审。

   ---- scenes-manifest.json 格式示例 ----
   {
     "scenes": [
       {
         "id": "moonlitField",
         "group": "moreSnowRows",
         "kind": "wind",
         "cutoffBase": 420, "cutoffDepth": 110, "lfoRate": 0.03, "whistle": false, "baseGain": 0.09,
         "video": "moonlit-field.mp4",
         "labels": { "zh-CN":"月光雪原", "en":"Moonlit Snowfield", "ja":"月明かりの雪原" },
         "addedAt": "2026-10-03"
       }
     ]
   }
   - id：全局唯一，不能跟现有场景重名（见 SOUND_DEFS 里已经用掉的那些 id）
   - group：目标分组，必须是这十四个之一：rainRows / snowRows / cabinRows / moreRows / moreSnowRows /
     travelRows / starryRows / glimmerRows / oceanRows / natureRows / indoorRows / noiseRows / spaceRows / healingRows
   - kind：决定合成音效怎么生成，参数字段跟着 kind 走：
       rain → bpFreq, bpQ, hpFreq, baseGain, popRate, popiness, thunder, echoMs, echoFb
       wind → cutoffBase, cutoffDepth, lfoRate, whistle, baseGain
       fire → baseGain, popRate, popiness
       noise → color, hpFreq, bpFreq, bpQ, lpFreq, strokeRate, strokeDepth, baseGain
       fan → bpFreq, bpQ, humFreq, humGain, lfoRate, lfoDepth, intermittent, baseGain
       ocean → color, lpBase, lpDepth, lfoRate, gainDepth, baseGain
       water → hpFreq, bpFreq, bpQ, bubbleRate, bubbleiness, drops, swellRate, swellDepth, baseGain
       insect → freq, chirpRate, layers, burstGapMin, burstGapMax, baseGain
       bird → freqMin, freqMax, minGap, maxGap, baseGain
       tone → freqs, attackSec, tremRate, tremDepth, binaural, baseGain
       chime → scale, minGap, maxGap, decaySec, baseGain
       rumble → mode, lpFreq, humFreqs, humGain, lfoRate, lfoDepth, clackInterval, baseGain
       clock → tickFreq, tickAlt, jitter, baseGain
   - video：文件名，相对于 REMOTE_BASE_URL（就是之前配置远程素材用的同一个地址）
   - labels：能写几个语言写几个语言，没写的语言会自动回退显示英文，再没有就显示 id 本身——
     不会报错，但体验上肯定是标准语言都配全比较好
   - addedAt（可选）：'YYYY-MM-DD'，这个场景真正上线的日期。填了之后，滑块名字旁边会在
     21天内显示一个小小的"NEW"标——对应"内容更新感知"这条自查项，让真实加的新内容能被
     付费用户感知到，不填也完全没问题（场景照常能用，只是没有这个小标）。别为了显得更新
     频繁而倒填一个更晚的假日期，那样做等于在欺骗付费用户，比不加这个标更糟。

   新场景默认自动是"会员专属"（因为凡是走 remote 下载的场景，都会被现有的会员逻辑锁住），
   这个不需要额外配置，是复用已有的 isPremiumScene() 判断规则。
================================================================= */

const MANIFEST_CACHE_KEY = 'nightwindow_manifest_cache_v1';

async function loadRemoteScenesManifest(){
  /* 第三份检查清单第6节"开机即离线"：manifest 拉取失败不能阻塞启动或让已下载场景读不到。
     策略分两步——
     ① 启动时先用 localStorage 里的上次成功缓存渲染（有的话），离线也能看到完整场景列表；
     ② 后台静默拉最新 manifest，拉到就覆盖缓存并补渲染新场景（重复 id 会被自动跳过，
        所以重复应用同一份 manifest 是安全的）。
     另外第三份检查清单第1节"manifest越来越大"：90+ 条场景一次性同步处理会阻塞启动首屏，
     这里把应用过程切成小片（每片 6 条，用 setTimeout 让出主线程），首屏先出来，列表随后跟上。 */
  function applyManifest(manifest, onProgressDone){
    if(!manifest || !Array.isArray(manifest.scenes)) { if(onProgressDone) onProgressDone(0); return; }

    const validGroups = ['rainRows','snowRows','cabinRows','moreRows','moreSnowRows','travelRows','starryRows','glimmerRows','oceanRows','natureRows','indoorRows','noiseRows','spaceRows','healingRows'];
    // ⚠️ 真实安全漏洞修复（互查时发现，属于严重级别）：这个 manifest 来自远程地址
    // （REMOTE_BASE_URL + 'scenes-manifest.json'），内容不受App包本身控制——一旦托管这个
    // 文件的地方（云存储桶/CDN账号）被盗、配置错误导致被公开写入，或者 REMOTE_BASE_URL
    // 被误配成 http:// 而遭遇中间人篡改，这里拿到的 scene.id / scene.labels 就是"外部可控的
    // 字符串"。下游 addSoundRow() 把这些值直接拼进 innerHTML（见 index.html），如果不在这里
    // 就卡住格式，攻击者可以在 id 或 labels 里塞 `"><img onerror="...">` 这样的payload，
    // 在所有装了这个App的用户手机上执行任意JS——而这个App的JS上下文里，正好有
    // Membership.setPremium(...) 这种一旦被执行就能直接把攻击者自己设成永久钻石会员、
    // 不花一分钱的函数（该问题的根本修复是服务端收据校验，这里是另一道独立防线：
    // 不让不受信任的远程数据有机会变成可执行代码）。严格校验 id 的字符集，不符合直接跳过
    // 这个场景（宁可少一个场景，不能让一个格式错误/被篡改的manifest造成XSS）。
    const SAFE_ID_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;
    // video 文件名同理：会被拼进下载 URL，也会被当作 Capacitor Filesystem 的缓存文件名——
    // 不校验的话，"../../../某处"这样的值理论上能让缓存写出预期目录之外，必须禁止路径分隔符
    // 和".."，只允许"看起来像一个普通文件名"的字符串。
    const SAFE_VIDEO_PATTERN = /^[a-zA-Z0-9_.-]{1,128}$/;
    // labels 里的文案理论上也应该做长度/字符限制，防止一个异常超长字符串拖慢渲染或撑爆布局——
    // 具体的"不能含HTML"由 index.html 的 addSoundRow() 改成安全的 DOM 构建方式兜底（双重防护），
    // 这里只做一个合理的长度上限，明显超长的直接当成格式错误跳过。
    const MAX_LABEL_LEN = 60;
    // "最近新增"小标用的日期字段，格式严格限定成 YYYY-MM-DD（见 index.html 的 SceneFreshness 注释）——
    // 这个值最终会被拼进 `new Date(dateStr+'T00:00:00Z')`，不是拼进HTML/innerHTML，本身没有XSS风险，
    // 但still按这个文件一贯的"不信任远程输入"原则做格式校验，格式不对就当没有这个字段处理，
        // 不会因为一个脏日期字符串让 isRecentlyAddedScene() 算出奇怪的结果。
    const SAFE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    let addedCount = 0;

    // 分片处理：每片最多 6 条，片与片之间让出主线程（setTimeout 0），
    // 让启动首屏/动画帧有机会插进来，manifest 再大也不会卡住启动。
    const CHUNK_SIZE = 6;
    const queue = manifest.scenes.slice();
    function processChunk(){
      const slice = queue.splice(0, CHUNK_SIZE);
      slice.forEach(scene=>{
      if(!scene || !scene.id || !scene.kind) return;
      if(typeof scene.id!=='string' || !SAFE_ID_PATTERN.test(scene.id)) return; // id 格式不合法，直接跳过，见上面注释
      if(SOUND_DEFS.some(d=>d.id===scene.id)) return; // id 已存在（无论是内置还是之前加过的远程场景）就跳过，避免重复
      if(!validGroups.includes(scene.group)) return;
      if(scene.video!=null && (typeof scene.video!=='string' || !SAFE_VIDEO_PATTERN.test(scene.video))) return; // 文件名格式不合法，跳过
      if(scene.labels && typeof scene.labels==='object'){
        for(const lang of Object.keys(scene.labels)){
          const v = scene.labels[lang];
          if(typeof v!=='string' || v.length>MAX_LABEL_LEN) return; // 任意一个语言的文案格式不对/超长，整个场景跳过，不做部分接受
        }
      }

      const def = {
        id:scene.id, group:scene.group, kind:scene.kind,
        baseGain: typeof scene.baseGain==='number' ? scene.baseGain : 0.12,
        default:0, fileName:null,
      };
      if(scene.kind==='rain'){
        Object.assign(def, {bpFreq:scene.bpFreq||1800, bpQ:scene.bpQ||0.8, hpFreq:scene.hpFreq||500, popRate:scene.popRate||8, popiness:scene.popiness||0.15, thunder:!!scene.thunder});
        if(typeof scene.echoMs==='number'){ def.echoMs=scene.echoMs; def.echoFb=(typeof scene.echoFb==='number'?scene.echoFb:0.15); }
      } else if(scene.kind==='wind'){
        Object.assign(def, {cutoffBase:scene.cutoffBase||500, cutoffDepth:scene.cutoffDepth||150, lfoRate:scene.lfoRate||0.05, whistle:!!scene.whistle});
      } else if(scene.kind==='fire'){
        Object.assign(def, {popRate:scene.popRate||4, popiness:scene.popiness||0.5});
      } else if(scene.kind==='noise'){
        Object.assign(def, {color:scene.color||'white'});
        if(typeof scene.hpFreq==='number') def.hpFreq=scene.hpFreq;
        if(typeof scene.bpFreq==='number'){ def.bpFreq=scene.bpFreq; def.bpQ=scene.bpQ||0.8; }
        if(typeof scene.lpFreq==='number') def.lpFreq=scene.lpFreq;
        if(typeof scene.strokeRate==='number'){ def.strokeRate=scene.strokeRate; def.strokeDepth=scene.strokeDepth||0.6; }
      } else if(scene.kind==='fan'){
        Object.assign(def, {bpFreq:scene.bpFreq||800, bpQ:scene.bpQ||0.8});
        if(typeof scene.humFreq==='number'){ def.humFreq=scene.humFreq; def.humGain=scene.humGain||0.03; }
        if(typeof scene.lfoRate==='number'){ def.lfoRate=scene.lfoRate; def.lfoDepth=scene.lfoDepth||60; }
        if(scene.intermittent) def.intermittent=true;
      } else if(scene.kind==='ocean'){
        Object.assign(def, {color:scene.color||'pink', lpBase:scene.lpBase||600, lpDepth:scene.lpDepth||250, lfoRate:scene.lfoRate||0.08, gainDepth:scene.gainDepth||0.35});
      } else if(scene.kind==='water'){
        Object.assign(def, {hpFreq:scene.hpFreq||700, bpFreq:scene.bpFreq||2200, bpQ:scene.bpQ||0.7, bubbleRate:scene.bubbleRate||10, bubbleiness:scene.bubbleiness||0.1});
        if(scene.drops) def.drops=true;
        if(typeof scene.swellRate==='number'){ def.swellRate=scene.swellRate; def.swellDepth=scene.swellDepth||0.5; }
      } else if(scene.kind==='insect'){
        Object.assign(def, {freq:scene.freq||4000, chirpRate:scene.chirpRate||12, layers:scene.layers||2, burstGapMin:scene.burstGapMin||0.6, burstGapMax:scene.burstGapMax||2.2});
      } else if(scene.kind==='bird'){
        Object.assign(def, {freqMin:scene.freqMin||2000, freqMax:scene.freqMax||4200, minGap:scene.minGap||4, maxGap:scene.maxGap||11});
      } else if(scene.kind==='tone'){
        if(!Array.isArray(scene.freqs)||scene.freqs.length===0) return; // tone 没有频率数组就没有意义，跳过
        Object.assign(def, {freqs:scene.freqs, attackSec:scene.attackSec||3});
        if(typeof scene.tremRate==='number'){ def.tremRate=scene.tremRate; def.tremDepth=scene.tremDepth||0.3; }
        if(typeof scene.binaural==='number'&&scene.binaural>0) def.binaural=scene.binaural;
      } else if(scene.kind==='chime'){
        if(!Array.isArray(scene.scale)||scene.scale.length===0) return; // chime 没有音阶就没有意义，跳过
        Object.assign(def, {scale:scene.scale, minGap:scene.minGap||3, maxGap:scene.maxGap||8, decaySec:scene.decaySec||3});
      } else if(scene.kind==='rumble'){
        Object.assign(def, {mode:scene.mode||'steady', lpFreq:scene.lpFreq||200});
        if(Array.isArray(scene.humFreqs)&&scene.humFreqs.length>0){ def.humFreqs=scene.humFreqs; def.humGain=scene.humGain||0.05; }
        if(typeof scene.lfoRate==='number'){ def.lfoRate=scene.lfoRate; def.lfoDepth=scene.lfoDepth||0.3; }
        if(typeof scene.clackInterval==='number') def.clackInterval=scene.clackInterval;
      } else if(scene.kind==='clock'){
        Object.assign(def, {tickFreq:scene.tickFreq||2100, tickAlt:scene.tickAlt||1700, jitter:scene.jitter||0.03});
      } else {
        return; // 未知kind，跳过，不让App因为不认识的类型而出错
      }

      SOUND_DEFS.push(def);
      SCENE_VIDEO[scene.id] = scene.video ? {remote:scene.video} : null;
      // ⚠️ 真实bug修复（互查时发现，严重程度经过核实后确认是"文档/UI一致性"问题，不是真的
      // монetization漏洞——这个App的设计是"声音对所有人免费，只有视频画面锁会员"，见
      // membership.js 顶部注释，所以一个还没传视频的远程场景，本来就没有任何"付费内容"
      // 可言，updateVideoLayer() 也不会为它弹付费墙，这点不算漏洞）：
      // 但文件头部注释明确写了"新场景默认自动是会员专属"，这是对运营/未来维护者的一个承诺——
      // 如果只凭 SCENE_VIDEO 条目判断"是不是会员专属"，一个视频还没传完就先上线的远程场景，
      // 会让锁图标显示成"未锁"，这和文档说的不一致，容易让人误以为"这个机制默认就是免费的"。
      // 用一个独立的 REMOTE_SCENE_IDS 集合记录"这是从远程manifest来的场景"，不管video字段
      // 填了没有，isPremiumScene() 都能查到它、显示锁图标，兑现文档里的承诺，同时不影响
      // updateVideoLayer() 原有的"没有video就不弹付费墙"的正确行为（没有视频可看，弹付费墙
      // 反而是无意义地挡住声音——声音从来不需要会员）。
      REMOTE_SCENE_IDS.add(scene.id);
      if(scene.addedAt!=null && typeof scene.addedAt==='string' && SAFE_DATE_PATTERN.test(scene.addedAt)
         && typeof window.SceneFreshness!=='undefined'){
        window.SceneFreshness.register(scene.id, scene.addedAt); // 格式校验见上面 SAFE_DATE_PATTERN 的注释
      }
      if(scene.labels) I18N.registerSceneLabels(scene.id, scene.labels);

      addSoundRow(def);
      addedCount++;
      });

      if(queue.length > 0){
        setTimeout(processChunk, 0); // 让出主线程后继续下一片
      } else {
        if(addedCount>0){
          if(typeof refreshLockIcons==='function') refreshLockIcons();
          // 远程场景加载完成后重新渲染一次"最近播放"：避免用户上次听的远程场景因为manifest还没拉到而被误过滤掉
          if(typeof RecentPlay!=='undefined' && RecentPlay.renderRecent) RecentPlay.renderRecent();
          if(typeof FeaturedUpsell!=='undefined' && FeaturedUpsell.render) FeaturedUpsell.render();
          console.log(`[远程场景清单] 新增了 ${addedCount} 个场景`);
        }
        if(onProgressDone) onProgressDone(addedCount);
      }
    }
    processChunk();
  }

  // 第①步：先用本地缓存渲染（离线/弱网也能看到完整列表）
  try{
    const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
    if(cached){ applyManifest(JSON.parse(cached), null); }
  }catch(e){ /* 缓存损坏就当没有，继续走网络流程 */ }

  // 第②步：后台静默拉最新 manifest，成功后覆盖缓存并补渲染
  try{
    const url = REMOTE_BASE_URL + 'scenes-manifest.json';
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) return; // 还没配置manifest、或者地址不对时，静默跳过，不影响App正常使用
    const manifest = await res.json();
    if(!manifest || !Array.isArray(manifest.scenes)) return;
    try{ localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(manifest)); }catch(e){ /* 缓存写不进去（存储满了等）不影响主流程 */ }
    applyManifest(manifest, null); // 重复 id 会被自动跳过，只有真正的新场景会被补进来
  }catch(e){
    // 离线 / manifest 格式错误 / 还没配置 REMOTE_BASE_URL 时都走到这里，静默失败即可，
    // 不能让一个远程配置文件的问题影响到 App 的正常使用——上面第①步的缓存已经兜底了
  }
}
