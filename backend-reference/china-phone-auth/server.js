/* ===================== 眠窗 · 大陆手机号验证码登录后端（参考实现，可直接改部署） =====================

   这是什么：App 端 www/js/auth.js 里 chinaPhoneAdapter / cnEmailAdapter / wechatAdapter /
   alipayAdapter 对接的大陆登录后端。
   接口（全部以本服务域名开头）：
     POST /api/auth/cn-phone/request-code   {phone, deviceId?}        → {cooldownSeconds}
     POST /api/auth/cn-phone/verify         {phone, code, deviceId?}  → {userId, sessionToken, displayName, isNewUser}
     POST /api/auth/cn-email/register       {email, password}         → 同上
     POST /api/auth/cn-email/login          {email, password}         → 同上
     POST /api/auth/wechat/login            {code}                    → 同上   （微信 App 原生授权码换 session）
     GET  /api/auth/wechat/authorize-url    ?platform=pc|h5           → {url, state}（Web 发起）
     GET  /api/auth/wechat/callback         ?code&state               → 同上   （Web 回调，验 state）
     POST /api/auth/alipay/login            {authCode}                → 同上   （支付宝 App 授权码换 session）
     GET  /api/auth/alipay/authorize-url                              → {url, state}
     GET  /api/auth/alipay/callback        ?auth_code&state          → 同上
     GET  /api/account/me（Bearer token）→ {userId, phone, email, identities:{phone,email,wechat,alipay}}

   为什么独立存在：Firebase/Google 服务在中国大陆访问不稳定，大陆登录体系必须完全自建、
   部署在境内。这套代码不依赖任何境外服务。

   ── 合规要点（个人信息保护法 / 最小必要原则，与 accounts-design.md 第三节一致）──
   · 只收集手机号 + 验证码，不收集身份证号、不做人脸识别——普通消费类 App 不需要
     （手机号在运营商层面已实名，验证码验证了"本人在操作"，即满足实名要求）。
   · 数据必须存储在境内服务器（本服务请部署在阿里云/腾讯云境内地域）。
   · 手机号是个人敏感信息：日志里一律脱敏（138****1234），不落明文；数据库里
     建议加密存储（参考实现为可读性保留明文，生产请上加密或哈希+盐）。
   · 隐私政策里必须披露"收集手机号用于账号登录"这一用途（法务站 privacy 页已含）。

   ── 短信服务商的前提条件（你需要先在控制台完成，缺一发不出短信）──
   · 阿里云：开通短信服务 → 企业实名认证 → 申请签名（如"眠窗"）→ 申请模板
     （如"验证码${code}，5分钟内有效。你正在登录眠窗，如非本人操作请忽略。"）→ 等审核通过
   · 腾讯云：流程相同（短信 SMS → 企业认证 → 签名 + 正文模板，均须审核）
   · 个人开发者注意：两家目前都要求企业/个体工商户资质才能过签名审核，
     个人主体无法申请——这是最大的前置门槛，先解决主体问题再谈代码。

   ── 运行方式 ──
     npm install express
     # 联调模式（不发真实短信，验证码打在控制台）：
     node server.js
     # 生产（阿里云）：
     SMS_PROVIDER=aliyun ALIYUN_ACCESS_KEY_ID=xxx ALIYUN_ACCESS_KEY_SECRET=xxx \
       ALIYUN_SMS_SIGN=眠窗 ALIYUN_SMS_TEMPLATE=SMS_123456789 SESSION_SECRET=随机长字符串 node server.js
     # 生产（腾讯云）：
     SMS_PROVIDER=tencent TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx \
       TENCENT_SMS_SDK_APP_ID=1400xxxxxx TENCENT_SMS_SIGN=眠窗 TENCENT_SMS_TEMPLATE_ID=1234567 \
       SESSION_SECRET=随机长字符串 node server.js
     # 微信登录（换码走 HTTPS 直连，无额外 npm 依赖）：
     WECHAT_APPID=wx1234 WECHAT_SECRET=xxx WECHAT_REDIRECT_URI=https://api.nightwindow.cn/api/auth/wechat/callback \
       SESSION_SECRET=随机长字符串 node server.js
     # 支付宝登录（需 npm install alipay-sdk；私钥/公钥用 PEM 内容，换行可用 \n 转义后传入）：
     ALIPAY_APPID=2021xxx ALIPAY_PRIVATE_KEY="$(cat app_private.pem)" ALIPAY_PUBLIC_KEY="$(cat alipay_public.pem)" \
       ALIPAY_REDIRECT_URI=https://api.nightwindow.cn/api/auth/alipay/callback \
       SESSION_SECRET=随机长字符串 node server.js

   ── 上线前必须替换的"参考实现简化点"（诚实清单，别带着这些上生产）──
   1. 验证码与用户数据存内存 Map → 换 Redis（验证码，多实例部署必须共享）+ PostgreSQL
      （用户表，表结构直接照 accounts-design.md 第一节的 users/identities 建）。
   2. 限频计数存内存 → 同上换 Redis，否则负载均衡后限频失效。
   3. 短信发送未做队列/重试 → 生产建议接 MQ 或直接读 SDK 的发送回执。
   4. 未接风控（设备指纹、行为验证码）→ 被恶意刷短信接口时先上图形验证码（极验/阿里云验证码）。
================================================================================ */

'use strict';
const crypto = require('crypto');
const express = require('express');

const app = express();
app.use(express.json({limit: '16kb'})); // 请求体很小，限制体积防恶意大包

/* ---------------- 配置 ---------------- */
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'DEV_ONLY_CHANGE_ME_' + crypto.randomBytes(16).toString('hex');
if(SESSION_SECRET.startsWith('DEV_ONLY_')){
  console.warn('[警告] SESSION_SECRET 未配置，正在使用临时随机密钥——重启后所有登录态失效。生产环境必须通过环境变量配置固定密钥。');
}
const CODE_TTL_MS        = 5 * 60 * 1000;  // 验证码 5 分钟有效
const CODE_LENGTH        = 6;              // 6 位数字验证码（短信行业标准）
const RESEND_INTERVAL_MS = 60 * 1000;      // 同一手机号 60 秒才可重发
const DAILY_MAX_PER_PHONE= 10;             // 同一手机号每日最多 10 条
const DAILY_MAX_PER_IP   = 30;             // 同一 IP 每日最多 30 条（防批量轰炸）
const MAX_ATTEMPTS       = 5;              // 每个验证码最多错 5 次，之后作废（防暴力穷举）
const SESSION_TTL_SEC    = 90 * 24 * 3600; // 登录态 90 天有效
const CN_PHONE_RE = /^1[3-9]\d{9}$/;

/* ---------------- 微信 / 支付宝 OAuth 配置（全部走环境变量，不允许硬编码） ----------------
   申请路径：
   · 微信：open.weixin.qq.com 注册开发者 → 创建「移动应用」→ 企业资质认证（300/年）→
     审核通过后拿到 AppID + AppSecret，并在应用里填好「授权回调域」（Web 流程用）。
   · 支付宝：open.alipay.com 创建「网页/移动应用」→ 企业/个体户资质 → 开通「App 支付宝登录」
     （auth_user / 支付宝会员授权）→ 拿到 AppID，上传应用 RSA2 公钥、保存支付宝公钥。
   未配置时对应接口返回 503 明确报错，绝不静默 mock 假登录（假身份会污染用户表）。 */
const WECHAT_APPID        = process.env.WECHAT_APPID || '';
const WECHAT_SECRET       = process.env.WECHAT_SECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || ''; // 必须与开放平台后台填写的回调完全一致
const ALIPAY_APPID        = process.env.ALIPAY_APPID || '';
const ALIPAY_PRIVATE_KEY  = process.env.ALIPAY_PRIVATE_KEY || '';  // 应用 RSA2 私钥（PEM 单行或带换行均可）
const ALIPAY_PUBLIC_KEY   = process.env.ALIPAY_PUBLIC_KEY || '';   // 支付宝公钥（验签用）
const ALIPAY_GATEWAY      = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';
const ALIPAY_REDIRECT_URI = process.env.ALIPAY_REDIRECT_URI || '';
const OAUTH_STATE_TTL_MS  = 10 * 60 * 1000; // Web 流程 state 10 分钟有效
// oauthStates: state → expiresAt（防 CSRF：Web 授权发起时生成、回调时必验）
const oauthStates = new Map();

/* ---------------- 存储（参考实现：内存。生产换 Redis / PostgreSQL，见文件头清单） ---------------- */
// codes: phone → {codeHash, expiresAt, attempts, lastSentAt}
const codes = new Map();
// 每日限频计数：key = `${dateStr}:${phone}` / `${dateStr}:ip:${ip}` → count
const dailyCounts = new Map();
// users: userId → {userId, phone?, email?, passwordHash?, wechatUnionid?, wechatOpenid?, alipayUserId?, createdAt}
// 各身份方式各有独立索引；第三方身份用户 phone/email 允许为空（最小必要：不强制收集手机号）
const users = new Map();
const phoneIndex = new Map();
const emailIndex = new Map();
const wechatUnionIndex = new Map(); // unionid（同一微信开放平台账号下 App/公众号/小程序一致）→ userId，优先用
const wechatOpenIndex = new Map();  // openid（仅本移动应用维度，拿不到 unionid 时兜底）→ userId
const alipayIndex = new Map();      // alipay_user_id（2088 开头）→ userId

function todayStr(){ return new Date().toISOString().slice(0,10); } // UTC 日期，够限频用
function maskPhone(p){ return p.slice(0,3) + '****' + p.slice(7); }
function hashCode(code){ return crypto.createHash('sha256').update(code + SESSION_SECRET).digest('hex'); }
function incrDaily(key){
  const k = todayStr() + ':' + key;
  const n = (dailyCounts.get(k) || 0) + 1;
  dailyCounts.set(k, n);
  return n;
}
function getDaily(key){ return dailyCounts.get(todayStr() + ':' + key) || 0; }

/* ---------------- 登录态：HMAC 签名 token（零依赖。payload.userId.iat.exp + 签名） ----------------
   生产可换标准 JWT（jsonwebtoken 库），格式约定好前端不用改。 */
function signSession(userId){
  const header = Buffer.from(JSON.stringify({alg:'HS256', typ:'NWT'})).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({uid: userId, iat: now, exp: now + SESSION_TTL_SEC})).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}
function verifySession(token){
  try{
    const [h, p, s] = String(token).split('.');
    if(!h || !p || !s) return null;
    const expect = crypto.createHmac('sha256', SESSION_SECRET).update(h + '.' + p).digest('base64url');
    // 时序安全比较，防时序侧信道
    if(!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if(!payload.uid || payload.exp < Date.now()/1000) return null;
    return payload.uid;
  }catch(e){ return null; }
}
// Express 中间件：保护后续的账号接口（绑定/换绑/会员同步都用它）
function requireAuth(req, res, next){
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  const uid = m && verifySession(m[1]);
  if(!uid) return res.status(401).json({error: '登录态无效或已过期，请重新登录'});
  req.userId = uid;
  next();
}

/* ---------------- 短信发送适配器：mock / 阿里云 / 腾讯云 三选一（环境变量 SMS_PROVIDER） ---------------- */
async function sendSms(phone, code){
  const provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  if(provider === 'aliyun') return sendSmsAliyun(phone, code);
  if(provider === 'tencent') return sendSmsTencent(phone, code);
  // mock：联调模式，不发真实短信，验证码打在服务端控制台（日志里手机号脱敏）
  console.log(`[SMS:mock] 验证码 ${code} → ${maskPhone(phone)}（联调模式，未真实发送）`);
}

// 阿里云：npm install @alicloud/dysmsapi20170525 @alicloud/openapi-client @alicloud/tea-util
async function sendSmsAliyun(phone, code){
  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi = require('@alicloud/openapi-client');
  const Util = require('@alicloud/tea-util');
  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  });
  config.endpoint = 'dysmsapi.aliyuncs.com';
  const client = new Dysmsapi.default(config);
  const req = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: process.env.ALIYUN_SMS_SIGN,         // 已审核通过的短信签名，如「眠窗」
    templateCode: process.env.ALIYUN_SMS_TEMPLATE, // 已审核通过的模板 CODE，如 SMS_123456789
    templateParam: JSON.stringify({code}),
  });
  const resp = await client.sendSmsWithOptions(req, new Util.RuntimeOptions({}));
  if(resp.body.code !== 'OK'){
    // isv.BUSINESS_LIMIT_CONTROL 等限流错误会走到这里——直接抛给上层转 503，别静默吞掉
    throw new Error('阿里云短信发送失败：' + resp.body.code + ' ' + resp.body.message);
  }
}

// 腾讯云：npm install tencentcloud-sdk-nodejs
async function sendSmsTencent(phone, code){
  const tencentcloud = require('tencentcloud-sdk-nodejs');
  const SmsClient = tencentcloud.sms.v20210111.Client;
  const client = new SmsClient({
    credential: {secretId: process.env.TENCENT_SECRET_ID, secretKey: process.env.TENCENT_SECRET_KEY},
    region: 'ap-guangzhou',
    profile: {httpProfile: {endpoint: 'sms.tencentcloudapi.com'}},
  });
  const resp = await client.SendSms({
    SmsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID, // 短信控制台的应用 SDK AppID
    SignName: process.env.TENCENT_SMS_SIGN,          // 已审核通过的签名
    TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID, // 已审核通过的模板 ID
    TemplateParamSet: [code],                        // 模板第一个变量 = 验证码
    PhoneNumberSet: ['+86' + phone],                 // 腾讯云要求 E.164 格式
  });
  const st = resp.SendStatusSet && resp.SendStatusSet[0];
  if(!st || st.Code !== 'Ok'){
    throw new Error('腾讯云短信发送失败：' + (st ? st.Code + ' ' + st.Message : '无返回状态'));
  }
}

/* ---------------- 接口 1：请求验证码 ---------------- */
app.post('/api/auth/cn-phone/request-code', async (req, res) => {
  const phone = String((req.body && req.body.phone) || '');
  if(!CN_PHONE_RE.test(phone)){
    return res.status(400).json({error: '手机号格式不正确'});
  }
  const ip = req.ip || 'unknown';

  // 限频 1：同一手机号 60 秒重发间隔
  const existing = codes.get(phone);
  if(existing && Date.now() - existing.lastSentAt < RESEND_INTERVAL_MS){
    const wait = Math.ceil((RESEND_INTERVAL_MS - (Date.now() - existing.lastSentAt)) / 1000);
    return res.status(429).json({error: '发送太频繁，请稍后再试', retryAfterSeconds: wait});
  }
  // 限频 2：同手机号 / 同 IP 每日上限（防短信轰炸——这条既是安全也是省钱，短信每条都是钱）
  if(getDaily(phone) >= DAILY_MAX_PER_PHONE){
    return res.status(429).json({error: '该手机号今日验证码发送次数已达上限，请明天再试', retryAfterSeconds: 3600});
  }
  if(getDaily('ip:' + ip) >= DAILY_MAX_PER_IP){
    return res.status(429).json({error: '请求过于频繁，请稍后再试', retryAfterSeconds: 3600});
  }

  // 生成验证码：crypto.randomInt 是密码学安全随机数，不要用 Math.random（可被预测）
  const code = String(crypto.randomInt(0, 1000000)).padStart(CODE_LENGTH, '0');
  codes.set(phone, {
    codeHash: hashCode(code), // 存哈希不存明文：就算内存/日志泄露，也还原不出验证码
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
  incrDaily(phone);
  incrDaily('ip:' + ip);

  try{
    await sendSms(phone, code);
  }catch(e){
    // 发送失败要回滚限频计数和已存的验证码，否则用户白白损失一次配额
    codes.delete(phone);
    dailyCounts.set(todayStr() + ':' + phone, Math.max(0, getDaily(phone) - 1));
    dailyCounts.set(todayStr() + ':ip:' + ip, Math.max(0, getDaily('ip:' + ip) - 1));
    console.error('[SMS] 发送失败 ' + maskPhone(phone) + '：', e.message);
    return res.status(503).json({error: '短信发送失败，请稍后重试'});
  }

  console.log('[SMS] 已发送 → ' + maskPhone(phone));
  res.json({cooldownSeconds: RESEND_INTERVAL_MS / 1000});
});

/* ---------------- 接口 2：校验验证码、建立登录态 ---------------- */
app.post('/api/auth/cn-phone/verify', (req, res) => {
  const phone = String((req.body && req.body.phone) || '');
  const code = String((req.body && req.body.code) || '');
  if(!CN_PHONE_RE.test(phone) || !/^\d{6}$/.test(code)){
    return res.status(400).json({error: '手机号或验证码格式不正确'});
  }
  const record = codes.get(phone);
  // 统一错误文案「验证码错误或已过期」：不区分"没发过"和"已过期"和"错误"，
  // 避免给攻击者提供"哪些手机号注册过"的探测线索
  const fail = () => res.status(400).json({error: '验证码错误或已过期，请重新获取'});
  if(!record || record.expiresAt < Date.now()) return fail();

  record.attempts += 1;
  if(record.attempts > MAX_ATTEMPTS){
    codes.delete(phone); // 错满 5 次直接作废，必须重新获取——防暴力穷举 6 位数字（共 100 万种）
    return res.status(429).json({error: '验证码尝试次数过多，请重新获取', retryAfterSeconds: 60});
  }
  if(record.codeHash !== hashCode(code)) return fail();

  // 校验通过：验证码一次性使用，立刻作废（防同一个码被重放登录两次）
  codes.delete(phone);

  // 找/建用户：验证码登录即"注册+登录"一体，手机号第一次验证通过就建账号
  let userId = phoneIndex.get(phone);
  let isNewUser = false;
  if(!userId){
    userId = 'cn_' + crypto.randomUUID();
    users.set(userId, {userId, phone, createdAt: new Date().toISOString()});
    phoneIndex.set(phone, userId);
    isNewUser = true;
    // ⚠️ 生产环境这里对应 accounts-design.md 的事务：INSERT users + INSERT identities
    //    (provider='phone', provider_uid='+86'+phone, verified_at=now())，两步必须原子完成
  }

  res.json({
    userId,
    sessionToken: signSession(userId),
    displayName: maskPhone(phone),
    isNewUser,
  });
});

/* ---------------- 密码哈希：scrypt（Node 内置，零依赖；比 bcrypt 少一个原生编译依赖） ----------------
   格式：salt:derivedKey（均 hex）。校验用 timingSafeEqual 防时序侧信道。 */
function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return salt + ':' + key;
}
function verifyPassword(password, stored){
  try{
    const [salt, key] = String(stored).split(':');
    const derived = crypto.scryptSync(String(password), salt, 32);
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derived);
  }catch(e){ return false; }
}
function maskEmail(email){
  const [name, domain] = String(email).split('@');
  if(!name || !domain) return email;
  const head = name.slice(0, Math.min(2, name.length));
  return head + '***@' + domain;
}

/* ---------------- 接口 3：邮箱注册（大陆区邮箱登录——Firebase 在大陆不稳定，邮箱体系同样自建） ---------------- */
app.post('/api/auth/cn-email/register', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return res.status(400).json({error: '邮箱格式不正确'});
  }
  if(password.length < 6){
    return res.status(400).json({error: '密码至少 6 位'});
  }
  if(emailIndex.has(email)){
    return res.status(409).json({error: '该邮箱已注册，请直接登录'});
  }
  const userId = 'cn_' + crypto.randomUUID();
  users.set(userId, {userId, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString()});
  emailIndex.set(email, userId);
  console.log('[邮箱注册] ' + maskEmail(email));
  res.json({userId, sessionToken: signSession(userId), displayName: maskEmail(email), isNewUser: true});
});

/* ---------------- 接口 4：邮箱密码登录 ----------------
   登录失败统一文案「邮箱或密码不正确」：不区分"邮箱不存在"和"密码错误"，
   避免给攻击者提供"哪些邮箱注册过"的探测线索。同 IP 每日 30 次上限防暴力撞库。 */
app.post('/api/auth/cn-email/login', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const ip = req.ip || 'unknown';
  if(getDaily('ip:' + ip) >= DAILY_MAX_PER_IP){
    return res.status(429).json({error: '尝试次数过多，请稍后再试', retryAfterSeconds: 3600});
  }
  incrDaily('ip:' + ip);
  const fail = () => res.status(401).json({error: '邮箱或密码不正确'});
  const userId = emailIndex.get(email);
  if(!userId) return fail();
  const user = users.get(userId);
  if(!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) return fail();
  res.json({userId, sessionToken: signSession(userId), displayName: maskEmail(email), isNewUser: false});
});

/* ===================== 微信 / 支付宝 OAuth 登录（完整闭环，2026-10-17） =====================
   闭环（App 原生）：App 调起微信/支付宝客户端授权拿到 code → POST 本服务 → 本服务用
   AppID+密钥向平台换唯一标识 → 在我们 users 表找/建账号 → 签发我们自己的 session token。
   Web 兜底（H5/PC 扫码）：authorize-url 发起（带 state）→ 平台回调 callback（验 state）。
   最小必要：只取平台唯一标识（unionid/openid、alipay_user_id），不取昵称头像——
   登录不需要它们，少拿一份敏感数据少一份合规负担。 */

// 统一签发登录响应
function sessionPayload(userId, displayName, isNewUser){
  return {userId, sessionToken: signSession(userId), displayName, isNewUser: !!isNewUser};
}
function makeUserId(){ return 'cn_' + crypto.randomUUID(); }

/* ---------------- state（仅 Web 流程用）：随机生成 + 一次性校验，防 CSRF ---------------- */
function createOAuthState(provider){
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, {provider, expiresAt: Date.now() + OAUTH_STATE_TTL_MS});
  for(const [k,v] of oauthStates){ if(v.expiresAt < Date.now()) oauthStates.delete(k); }
  return state;
}
function consumeOAuthState(state, provider){
  const rec = oauthStates.get(state);
  if(!rec) return false;
  oauthStates.delete(state); // 一次性
  return rec.provider === provider && rec.expiresAt >= Date.now();
}

/* ---------------- 微信 ---------------- */
// code → {openid, unionid?}；文档 https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Authorized_API_call_UnionID.html
async function exchangeWechatCode(code){
  const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  url.searchParams.set('appid', WECHAT_APPID);
  url.searchParams.set('secret', WECHAT_SECRET);
  url.searchParams.set('code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const r = await fetch(url, {method: 'GET'});
  const d = await r.json().catch(()=>({}));
  if(!d || d.errcode || !d.openid){
    throw new Error('微信换码失败：' + (d.errcode || 'UNKNOWN') + ' ' + (d.errmsg || ''));
  }
  return {openid: d.openid, unionid: d.unionid || ''};
}
// 找/建账号：优先 unionid（跨 App/公众号/小程序同一人），拿不到才退回 openid
function loginWechatIdentity({openid, unionid}){
  let userId = unionid ? wechatUnionIndex.get(unionid) : (wechatOpenIndex.get(openid) || null);
  let user = userId ? users.get(userId) : null;
  if(!user && openid){ userId = wechatOpenIndex.get(openid); user = userId ? users.get(userId) : null; }
  if(!user){
    userId = makeUserId();
    user = {userId, createdAt: new Date().toISOString(), wechatOpenid: openid};
    if(unionid) user.wechatUnionid = unionid;
    users.set(userId, user);
    wechatOpenIndex.set(openid, userId);
    if(unionid) wechatUnionIndex.set(unionid, userId);
    let isNew = true;
    console.log('[微信登录] 新用户 ' + (unionid ? 'unionid' : 'openid') + ' 已建档');
    return sessionPayload(userId, '微信用户', isNew);
  }
  // 老用户这次带回了之前缺失的标识（比如后来绑定开放平台账号出现 unionid），补上
  if(unionid && !user.wechatUnionid){ user.wechatUnionid = unionid; wechatUnionIndex.set(unionid, userId); }
  if(openid && !user.wechatOpenid){ user.wechatOpenid = openid; wechatOpenIndex.set(openid, userId); }
  return sessionPayload(userId, '微信用户', false);
}

// App 原生：POST {code}
app.post('/api/auth/wechat/login', async (req, res) => {
  if(!WECHAT_APPID || !WECHAT_SECRET){
    return res.status(503).json({error: '微信登录未配置：请在后端设置 WECHAT_APPID / WECHAT_SECRET 环境变量'});
  }
  const code = String((req.body && req.body.code) || '');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(code)){
    return res.status(400).json({error: '微信授权码格式不正确'});
  }
  try{
    const ids = await exchangeWechatCode(code);
    res.json(loginWechatIdentity(ids));
  }catch(e){
    console.error('[微信登录]', e.message);
    res.status(502).json({error: '微信登录失败，请重试'});
  }
});

// Web 发起：GET ?platform=pc|h5 → {url, state}，前端拿 url 自行跳转
app.get('/api/auth/wechat/authorize-url', (req, res) => {
  if(!WECHAT_APPID || !WECHAT_REDIRECT_URI){
    return res.status(503).json({error: '微信 Web 登录未配置：缺少 WECHAT_APPID / WECHAT_REDIRECT_URI'});
  }
  const platform = String(req.query.platform || 'pc') === 'h5' ? 'h5' : 'pc';
  const state = createOAuthState('wechat');
  const redirect = encodeURIComponent(WECHAT_REDIRECT_URI);
  const url = platform === 'pc'
    ? `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APPID}&scope=snsapi_login&redirect_uri=${redirect}&state=${state}#wechat_redirect`
    : `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}&redirect_uri=${redirect}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  res.json({url, state});
});

// Web 回调：GET /callback?code=&state= → JSON 登录结果（验 state 防 CSRF）
app.get('/api/auth/wechat/callback', async (req, res) => {
  if(!WECHAT_APPID || !WECHAT_SECRET){
    return res.status(503).json({error: '微信登录未配置'});
  }
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if(!consumeOAuthState(state, 'wechat')){
    return res.status(400).json({error: '授权状态无效或已过期，请重新发起登录'});
  }
  try{
    const ids = await exchangeWechatCode(code);
    res.json(loginWechatIdentity(ids));
  }catch(e){
    console.error('[微信回调]', e.message);
    res.status(502).json({error: '微信登录失败，请重试'});
  }
});

/* ---------------- 支付宝 ----------------
   RSA2 签名/验签全部交给官方 alipay-sdk（npm install alipay-sdk），不自己造密码学轮子。
   与短信 SDK 同样按需 require：未配置/未安装时接口返回 503 而不是启动即崩。 */
let _alipaySdk = null;
function getAlipaySdk(){
  if(!ALIPAY_APPID || !ALIPAY_PRIVATE_KEY || !ALIPAY_PUBLIC_KEY){
    const e = new Error('支付宝登录未配置：请设置 ALIPAY_APPID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY 环境变量');
    e.statusCode = 503; throw e;
  }
  if(_alipaySdk) return _alipaySdk;
  let AlipaySdk;
  try{
    const mod = require('alipay-sdk');
    // v4 为命名导出 AlipaySdk；兼容旧版/ESM 互操作的 default
    AlipaySdk = mod.AlipaySdk || mod.default || mod;
  }
  catch(e){ const err = new Error('缺少 alipay-sdk 依赖，请在后端目录执行 npm install alipay-sdk'); err.statusCode = 503; throw err; }
  if(typeof AlipaySdk !== 'function'){
    const err = new Error('alipay-sdk 版本不兼容，请检查安装结果'); err.statusCode = 503; throw err;
  }
  _alipaySdk = new AlipaySdk({appId: ALIPAY_APPID, privateKey: ALIPAY_PRIVATE_KEY, alipayPublicKey: ALIPAY_PUBLIC_KEY, gateway: ALIPAY_GATEWAY});
  return _alipaySdk;
}
// authCode → alipay_user_id（2088 开头）。alipay.system.oauth2.token 返回里 userId 即用户唯一标识
async function exchangeAlipayCode(authCode){
  const sdk = getAlipaySdk();
  const r = await sdk.exec('alipay.system.oauth2.token', {grantType: 'authorization_code', code: authCode});
  const userId = r.userId || r.user_id; // SDK 已做验签；不同版本字段命名兼容
  if(!userId) throw new Error('支付宝换码返回缺少 userId');
  return String(userId);
}
function loginAlipayIdentity(alipayUserId){
  let uid = alipayIndex.get(alipayUserId);
  let user = uid ? users.get(uid) : null;
  let isNew = false;
  if(!user){
    uid = makeUserId();
    user = {userId: uid, alipayUserId, createdAt: new Date().toISOString()};
    users.set(uid, user);
    alipayIndex.set(alipayUserId, uid);
    isNew = true;
    console.log('[支付宝登录] 新用户已建档');
  }
  return sessionPayload(uid, '支付宝用户', isNew);
}

// App 原生：POST {authCode}（兼容字段名 code）
app.post('/api/auth/alipay/login', async (req, res) => {
  const authCode = String((req.body && req.body.authCode) || (req.body && req.body.code) || '');
  if(!/^[a-zA-Z0-9_-]{8,256}$/.test(authCode)){
    return res.status(400).json({error: '支付宝授权码格式不正确'});
  }
  try{
    const alipayUserId = await exchangeAlipayCode(authCode);
    res.json(loginAlipayIdentity(alipayUserId));
  }catch(e){
    if(e.statusCode) return res.status(e.statusCode).json({error: e.message});
    console.error('[支付宝登录]', e.message);
    res.status(502).json({error: '支付宝登录失败，请重试'});
  }
});

// Web 发起：支付宝授权页（scope=auth_user 取用户唯一标识；回调域必须与开放平台配置一致）
app.get('/api/auth/alipay/authorize-url', (req, res) => {
  if(!ALIPAY_APPID || !ALIPAY_REDIRECT_URI){
    return res.status(503).json({error: '支付宝 Web 登录未配置：缺少 ALIPAY_APPID / ALIPAY_REDIRECT_URI'});
  }
  const state = createOAuthState('alipay');
  const u = new URL('https://openauth.alipay.com/oauth2/publicAppAuthorize.htm');
  u.searchParams.set('app_id', ALIPAY_APPID);
  u.searchParams.set('scope', 'auth_user');
  u.searchParams.set('redirect_uri', ALIPAY_REDIRECT_URI);
  u.searchParams.set('state', state);
  res.json({url: u.toString(), state});
});

// Web 回调：支付宝回跳参数名是 auth_code（App 原生 SDK 回调也同名）
app.get('/api/auth/alipay/callback', async (req, res) => {
  const authCode = String(req.query.auth_code || req.query.authCode || '');
  const state = String(req.query.state || '');
  if(!consumeOAuthState(state, 'alipay')){
    return res.status(400).json({error: '授权状态无效或已过期，请重新发起登录'});
  }
  try{
    const alipayUserId = await exchangeAlipayCode(authCode);
    res.json(loginAlipayIdentity(alipayUserId));
  }catch(e){
    if(e.statusCode) return res.status(e.statusCode).json({error: e.message});
    console.error('[支付宝回调]', e.message);
    res.status(502).json({error: '支付宝登录失败，请重试'});
  }
});

/* ---------------- 示例：受保护接口（验证登录态中间件怎么用） ---------------- */
app.get('/api/account/me', requireAuth, (req, res) => {
  const user = users.get(req.userId);
  if(!user) return res.status(404).json({error: '用户不存在'});
  res.json({
    userId: user.userId,
    phone: user.phone ? maskPhone(user.phone) : null,
    email: user.email ? maskEmail(user.email) : null,
    identities: {
      phone: !!user.phone,
      email: !!user.email,
      wechat: !!(user.wechatUnionid || user.wechatOpenid),
      alipay: !!user.alipayUserId
    },
    createdAt: user.createdAt
  });
});

app.get('/health', (req, res) => res.json({ok: true}));

app.listen(PORT, () => {
  console.log(`眠窗大陆登录后端已启动 :${PORT}（短信渠道：${process.env.SMS_PROVIDER || 'mock'}）`);
  console.log('  登录方式：手机号(短信) ✓ | 邮箱 ✓ | 微信 ' + (WECHAT_APPID ? '✓' : '✗(未配置 WECHAT_*)') + ' | 支付宝 ' + (ALIPAY_APPID ? '✓' : '✗(未配置 ALIPAY_*)'));
});
