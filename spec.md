# 声库扩编 v3 · Wave A 实施规格（56 款纯合成声音 + 场景化）

## 目标
把已定稿的 56 款新合成声音实现进引擎，配 6 个新分组、6 个新 canvas 夜景、62 个 i18n 键（×25 语言）。
原则：新声音 `default:0, fileName:null`、零素材成本；文案只写听感/物理参数，禁疗效词；播放零打断体系不动（新 id 不在 free_scene_ids 池内自动会员，无需改 gating）。

## 已确认锚点（2026-10-16 Grep 核实，无漂移）
文件：`/Users/nigelma/Documents/Trae-CN/temp_20261010_03/nightwindow-app/nightwindow-app/www/index.html`
- SOUND_DEFS L1096；createRainVoice L1159；createWindVoice L1212；createFireVoice L1246
- buildSynthVoice L1332；ROW_CONTAINERS L1417
- glimmerRows div L848，iso-toggle-box L851（新组插在其间）
- sceneCalm L4683；sceneWindyNight L4728；drawScene L4734
- 可复用 helper：skyGradient/drawStars/drawMoon/drawTreeline/drawCloudBands/drawGroundFog/drawLeaves/updateDrawRain/updateDrawSnow（L4581-4681），getState/rand 已存在
- createRainVoice 内部 pop 粒子模式（setTimeout 调度+短促滤波噪声爆发）= 所有新 creator 仿照的统一范式
- i18n.js：25 语言块，块头正则 `^(\s*)'([a-zA-Z-]+)':\s*\{\s*$`；sceneLabel 键 `scene_<id>`；组名键 `groupXxx`
- remote-scenes.js：validGroups L65；kind 分发 L117-125；头注释 L16-18

## 变更清单

### 1. index.html — 10 个新 voice creator（插在 createFireVoice 之后）
统一接口：out gain=0 起步、out.connect(master)、返回 {start,stop,setLevel}，setLevel 用 out.gain.setTargetAtTime。
- **createNoiseVoice(def)**：color 噪声→可选 hp/bp/lp 滤波（def.hpFreq/bpFreq(bpQ默认0.8)/lpFreq，为假跳过该级）→bed(baseGain)；strokeRate>0 时 LFO(正弦 strokeRate Hz)→gain(baseGain*strokeDepth||0.6)→bed.gain。
- **createFanVoice(def)**：brown→bandpass(bpFreq,bpQ)→bed；LFO(lfoRate)→gain(lfoDepth||60)→bp.frequency；humFreq>0 加 sine(humFreq)→gain(humGain||0.03)→out；intermittent 时 scheduleGust()：bed.gain 在 baseBed*(0.7+rand*0.4)（持续2.5-5s）与 baseBed*0.06（停1.5-4s）间交替，bed 初值 intermittent?0:baseGain。
- **createOceanVoice(def)**：pink/brown(def.color)→lowpass(lpBase)→bed；LFO1(lfoRate)→gain(lpDepth)→lp.frequency；LFO2(lfoRate*1.07)→gain(baseGain*gainDepth)→bed.gain。
- **createWaterVoice(def)**：white→bandpass(bpFreq,bpQ默认0.7)→highpass(hpFreq)→bed；可选 swellRate→gain(baseGain*swellDepth)→bed.gain；scheduleBubble 复刻 rain pop 模式：delay=(1/bubbleRate)*(0.4+rand*1.3)s；def.drops 真=水滴 sine（freq setValueAtTime(f*1.25)→exponentialRamp(f,t+0.05)，f=900+rand*1500，attack 8ms→bubbleiness*(0.4+rand*0.6)、exponential 衰减0.5-1.0s）；否则水泡噪声粒 bandpass(1600+rand*2600,Q2.6) attack 5ms 衰减60-140ms。
- **createInsectVoice(def)**：layers||2 层 sine(freq*(1+(i-(n-1)/2)*0.035))→trem gain(0.5+LFO(chirpRate*(1+i*0.06),depth0.5))→lowpass 6500→layerGain(0)→out；scheduleBurst：gap=burstGapMin(默认0.6)+rand*(burstGapMax(默认2.2)-min)，随机挑一层 layerGain→baseGain*(0.5+rand*0.5) τ0.15→dur 0.8-3s 后→0 τ0.4。
- **createBirdVoice(def)**：scheduleChirp gap=(minGap||4)+rand*((maxGap||11)-(minGap||4))；一只鸟 2-5 个 note，t 累进 dur+0.06+rand*0.16；每 note sine，f0=base*(0.9+rand*0.25)（base=freqMin+rand*(freqMax-freqMin)），滑音到 f1=f0*(0.72+rand*0.12 或 1.18+rand*0.3)，dur 0.07-0.2s，attack 15ms→baseGain*(0.35+rand*0.4)、exponential 衰减 dur+0.09s。
- **createToneVoice(def)**：cluster gain(0)，start 时 setTargetAtTime(baseGain,τ=attackSec/3)；tremRate&&tremDepth 加 LFO→gain(baseGain*tremDepth)→cluster.gain；binaural>0=两路 sine(freqs[0] 与 freqs[0]+binaural) 各经 StereoPanner(±1)→gain0.5→cluster；否则 freqs 每频 sine(*(1±0.0015 微失谐))→gain(1/sqrt(n))→cluster。
- **createChimeVoice(def)**：scheduleStrike gap=minGap+rand*(maxGap-minGap)；scale 随机取频 f，三泛音 [1,1],[2.76,0.28],[5.4,0.1] 各 sine(f*mult*(1±0.002))，attack 6ms→baseGain*amt*(0.5+rand*0.5)、exponential 衰减 decaySec*(0.75+rand*0.4)。
- **createRumbleVoice(def)**：brown→lowpass(lpFreq)→bed；humFreqs[] 每频 sine→gain(humGain||0.05)→out；(mode==='sway'||lfoRate) LFO(lfoRate)→gain(baseGain*lfoDepth)→bed.gain；mode==='rhythmic' 时 scheduleClack：interval=clackInterval*(0.85+rand*0.3)，两声 brown burst（lowpass 420，dt=0 与 0.14s，增益 baseGain*0.5 与 *0.35，attack 12ms 衰减 160ms）。
- **createClockVoice(def)**：scheduleTick 每 1000ms*(1±jitter)，tock 交替，white→bandpass(tick?tickFreq:tickAlt,Q9)→lowpass 3800→attack 4ms→baseGain*(tock?0.8:1)、exponential 衰减 45ms。
- **createRainVoice 加 echo 支路**：hp→bed 链后 `if(def.echoMs){dly=c.createDelay(0.2);dly.delayTime.value=echoMs/1000;fb=gain(echoFb??0.15);wet=gain(0.5);hp.connect(dly);dly.connect(fb);fb.connect(dly);dly.connect(wet);wet.connect(bed);}`

### 2. buildSynthVoice 追加 10 行分发
noise/fan/ocean/water/insect/bird/tone/chime/rumble/clock。

### 3. SOUND_DEFS 尾部追加 56 款（default:0, fileName:null）
- rainRows 8：drizzle 毛毛雨(rain 3600/1.2/1400 g0.07 pop2.0/0.18)；rainOnTent 帐篷听雨(1700/0.8/500 g0.16 pop11/0.22 echoMs32 echoFb0.18)；rainOnRoof 屋檐雨声(1400/0.9/400 g0.18 pop10/0.17 echo38/0.14)；summerShower 夏日阵雨(2000/0.8/500 g0.22 pop14/0.13)；nightStorm 午夜雷雨(900/0.6/140 g0.30 pop11/0.12 thunder:true)；hail 檐下雹雨(3200/1.4/1500 g0.13 pop16/0.26 echo28/0.10)；rainLeaves 雨打树叶(2600/1.0/900 g0.14 pop15/0.19)；greenhouseRain 花房夜雨(2400/1.1/800 g0.12 pop7/0.16 echo45/0.16)
- noiseRows 4：whiteNoise 白噪音(white g0.10)；pinkNoise 粉噪音(pink g0.12)；brownNoise 棕噪音(brown lpFreq500 g0.16)；brushOnPaper 纸笔沙沙(pink bp2500/0.5 strokeRate0.55 strokeDepth0.7 g0.12)
- oceanRows 10：gentleWaves 轻浪拍岸(pink 700/350/0.09/0.35 g0.15)；oceanNight 夜海呼吸(brown 450/250/0.075/0.45 g0.16)；distantSurf 远处浪声(brown 300/120/0.06/0.3 g0.10)；mountainStream 山涧溪流(water hp900 bp2800/0.7 bub18/0.10 g0.13)；gentleRiver 平缓河流(500/1600/0.7 bub10/0.09 g0.12)；waterDrops 水滴石潭(drops:true hp1200 bub0.8/0.5 g0.09)；fountain 夜泉涌水(700/2200/0.6 bub14/0.12 g0.13)；waterfallFar 远山瀑布(pink lp750 g0.14)；sparklingWater 粼粼水光(1400/3600/0.9 bub22/0.07 g0.08)；teaPour 茶室注水(600/2000/0.8 bub6/0.14 swell0.07/0.5 g0.11)
- natureRows 11：crickets 蟋蟀鸣夜(insect 4200 chirp14 layers2 gap0.8-2.4 g0.08)；nightInsects 夏夜虫鸣(3600/9/3/0.5/1.8 g0.09)；forestBirds 林间鸟鸣(bird 2000-4200 gap4-11 g0.09)；forestNight 森林夜息(wind 300/80/0.03/false g0.08)；meadowBreeze 草甸晚风(550/180/0.09/false g0.11)；autumnLeaves 秋叶沙沙(900/400/0.12/false g0.08)；bambooGrove 竹林风吟(700/300/0.07/true g0.10)；mountainWind 山间夜风(600/240/0.05/false g0.13)；howlingGale 呼啸劲风(900/420/0.04/true g0.20)；cloudSoft 云端柔风(420/120/0.035/false g0.07)；tundraWind 苔原寒风(750/320/0.025/true g0.15)
- healingRows 9：singingBowl 颂钵余韵(chime [138.6,164.8,196,220] gap6-14 decay6 g0.13)；warmDrone 暖雾低鸣(tone [55,82.5,110] atk4 trem0.06/0.3 g0.14)；crystalTone 水晶音束([523.25,659.25,783.99] atk3 trem0.1/0.25 g0.07)；windChimes 风铃轻响(chime [523.25,587.33,659.25,783.99,880] gap1.5-5 decay2.8 g0.08)；fairyForest 萤火林语(chime [1046.5,1174.7,1318.5,1568,1760] gap2-7 decay2.2 g0.06)；tone432 432Hz 柔音(tone [432,216] atk3 trem0.08/0.2 g0.09)；schumann783 7.83Hz 低频脉动(tone [111] atk4 trem7.83/0.6 g0.10)；deltaLow Delta 低鸣 · 需耳机(tone [100] binaural2 atk4 g0.11)；thetaDeep Theta 沉潜 · 需耳机(tone [120] binaural6 atk4 g0.11)
- travelRows 3：nightTrain 夜行列车(rumble rhythmic lp160 clack1.1 g0.18)；airplaneCabin 红眼机舱(steady lp240 hum[120]/0.04 g0.16)；ferryRock 夜航轮渡(sway lp140 lfo0.09/0.5 g0.16)
- spaceRows 3：spaceStation 空间站低鸣(steady lp180 hum[50,110]/0.05 lfo0.1/0.15 g0.14)；nebulaDrift 星云漂流(tone [73.4,110,146.8] atk6 trem0.05/0.4 g0.10)；eventHorizon 视界边缘(steady lp90 hum[36,54]/0.06 lfo0.05/0.25 g0.15)
- indoorRows 7：deskFan 桌面风扇(fan 800/0.8 hum120/0.03 lfo0.5/60 g0.13)；oldFan 老风扇(600/0.9 hum100/0.05 lfo0.35/90 g0.14)；airConditioner 空调夜风(1000/0.6 hum60/0.02 lfo0.1/30 g0.11)；nightHighway 深夜公路(brown lp350 g0.11)；distantCity 城市夜底噪(brown lp250 g0.08)；wallClock 挂钟嘀嗒(clock tick2100/alt1700 jitter0.03 g0.06)；bambooFan 竹扇晚风(fan 900/0.7 hum0 lfo0.3/80 intermittent g0.12)
- cabinRows 1：candleCrackle 烛芯噼啪(fire g0.05 pop1.2/0.35)

### 4. HTML + ROW_CONTAINERS
glimmer 组后、iso-toggle-box 前插 6 个 group div（仿现有结构）：oceanRows(groupOcean 水声 · WATER)→natureRows(groupNature 自然 · NATURE)→indoorRows(groupIndoor 室内 · INDOOR)→noiseRows(groupNoise 噪声 · NOISE)→spaceRows(groupSpace 太空 · SPACE)→healingRows(groupHealing 低频共鸣 · RESONANCE)；ROW_CONTAINERS 加 6 条映射。

### 5. 场景化 canvas（插在 sceneWindyNight 之后）
新 helper+场景：
- drawWaterShimmer(state,t,y0)：26 条横向微光条，alpha 0.05-0.15 随 t 呼吸
- sceneOceanNight：skyGradient('#101724','#04060a')+stars70,0.4+moon(0.68,0.2,20,0.9)+海平线(ch*0.62)+下半暗填+shimmer(ch*0.64)
- sceneWaterNight：skyGradient('#131a24','#05070b')+stars60+treeline(ch*0.7)+水面暗色+shimmer(ch*0.72)
- drawFireflies(state,t,8)：萤绿点 rgba(190,230,140) 慢漂+呼吸闪烁
- sceneForestNight：skyGradient('#0e141c','#04060a')+stars50+双层 treeline(ch*0.8/ch*0.95)+fireflies
- drawCityLights(state)：34 个暖/冷色窗灯（y ch*0.66-0.82，微闪）
- sceneCityNight：skyGradient('#161a22','#07080c')+stars35+楼影(ch*0.64)+cityLights+groundFog0.10
- drawNebula(state)：径向渐变紫/蓝大光斑 alpha 0.10
- sceneSpaceNight：skyGradient('#07080f','#020308')+nebula+stars160,0.7
- drawWindowFrame()：cw*0.12/ch*0.1 起 cw*0.76×ch*0.62 窗框（stroke 6px rgba(30,36,46,0.9)，十字分隔）
- sceneIndoorNight：skyGradient('#12161f','#05060a')+stars45+moon+treeline(ch*0.72)+windowFrame
- drawScene 改造：switch 前 `const resolved=CANVAS_SCENE_ALIAS[name]||name`，switch(resolved)，补 6 个新 case
- CANVAS_SCENE_ALIAS：drizzle/rainOnTent/rainOnRoof/rainLeaves/greenhouseRain→lightRain；summerShower/hail→heavyRain；nightStorm→thunderstorm；gentleWaves/oceanNight/distantSurf/ferryRock→oceanNight；mountainStream/gentleRiver/waterDrops/fountain/waterfallFar/sparklingWater/teaPour→waterNight；crickets/nightInsects/forestBirds/forestNight/meadowBreeze/bambooGrove/fairyForest→forestNight；autumnLeaves/mountainWind/howlingGale/cloudSoft/tundraWind→windyNight；nightHighway/distantCity/nightTrain→cityNight；spaceStation/nebulaDrift/eventHorizon/airplaneCabin→spaceNight；deskFan/oldFan/airConditioner/wallClock/bambooFan/brushOnPaper/candleCrackle/windChimes/whiteNoise/pinkNoise/brownNoise→indoorNight；其余 healing 7 款不映射（走 default sceneCalm）

### 6. remote-scenes.js
validGroups 加 6 新组；kind 分发补 noise/fan/ocean/water/insect/bird/tone/chime/rumble/clock（参数带默认值兜底，null 靠 creator 内 if(def.x) 跳过）；头注释 L16-18 同步更新。

### 7. i18n.js 注入 62 键×25 语言
6 组名 + 56 场景标签，组名格式「本地语 · ENGLISH」。Python 脚本按语言块头逐块插入；**全部文案避开单引号撇号**（fr/it 选无撇号措辞）；执行方式 `python3 -c "exec(compile(open(path,encoding='utf-8').read(),path,'exec'))"`。

## 验证
1. `node --check www/js/i18n.js`、`node --check www/js/remote-scenes.js` 通过
2. index.html 内联 script 提取后 `new Function` 全过
3. 62 个 i18n 键每键在 i18n.js 出现 25 次
4. SOUND_DEFS 计数 = 22+56 = 78 款；56 个新 id 均唯一
5. 每个新 kind 在 buildSynthVoice 与 remote-scenes.js 均有分发

## 不在本次范围
Firebase 填值（等后台代理通知后单独做）；Apple 对照表（单独交付）；Wave B 6 款采样（Wave A 交付后开工）；UI 三件套（后置）。
