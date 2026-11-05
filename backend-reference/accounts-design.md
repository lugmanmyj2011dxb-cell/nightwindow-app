# 眠窗 · 账号体系参考设计

> 这份文档是**设计参考**，不是可以直接跑起来的后端代码——这个沙盒环境里没有真实数据库、
> 没有各平台的开发者凭证，没法替你部署一个真正能收发验证码、校验OAuth token的服务。
> 这里把表结构、接口列表、身份合并的判定规则都写清楚，方便你或者外包的后端开发直接照着搭。

## 为什么需要一套自己的账号系统

App Store / Google Play 本身的"恢复购买"已经能做到"同一个 Apple ID / Google 账号下换设备
找回会员"，但做不到：
- 从 iOS 换到 Android（两个商店的购买记录互相看不到对方）
- 大陆渠道（微信支付/支付宝）的购买记录，天然就不在苹果/Google的体系里
- 用户想用"眠窗自己的账号"登录多台设备同步自定义组合、连续天数等本机数据（不只是会员资格）

所以需要后端自己记一份"user_id → 会员资格 + 使用数据"的账，各平台的购买凭证校验通过后，
都写入同一个 user_id 名下，这样才能做到真正的跨平台会员资格同步。

## 两套独立体系：全球 vs 大陆

**不建议强行合并成一套统一账号系统**，原因：
1. Firebase/Google 相关服务在中国大陆访问不稳定，大陆后端不能依赖它们
2. 两边的登录方式完全不同（国际用邮箱/手机/Google/Facebook/Apple/LINE，大陆用手机号/微信）
3. 两边用户群体理论上可能有极少数重叠（比如常出国的大陆用户），但为了这种极小概率场景
   打通两套本来互相独立、且分别要满足不同合规要求的系统，成本远大于收益

实际做法：两套后端分别维护各自的 `users`/`identities` 表，字段结构保持一致（方便以后万一
真的要做数据迁移/合并），但**不**互相查询、不要求实时同步。

---

## 一、数据模型

```sql
-- 一个"人"，不直接存任何登录凭证
CREATE TABLE users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT,              -- 可选，用户自己设置的昵称
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  region        TEXT NOT NULL      -- 'global' | 'china' —— 决定走哪套后端/哪些登录方式可见
);

-- 一个人可以有多个登录方式，这张表才是真正存凭证标识的地方
CREATE TABLE identities (
  identity_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(user_id),
  provider       TEXT NOT NULL,     -- 'email' | 'phone' | 'google' | 'facebook' | 'apple' | 'line' | 'wechat'
  -- ⚠️ OAuth类（google/facebook/apple/line）这里必须存平台给的"稳定用户id"（sub/openid/
  -- stable identifier），不能存邮箱——用户在Google自己账号里改邮箱不会改sub，但如果你存的
  -- 是邮箱，下次登录会被判定成"新用户"，之前的会员资格和数据全部对不上，这是最容易踩的坑
  provider_uid   TEXT NOT NULL,     -- 邮箱地址 / E.164手机号 / 各OAuth的稳定用户id(sub/openid/unionid)
  verified_at    TIMESTAMPTZ,       -- 验证码/OAuth校验通过的时间，未验证不应该允许登录
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at    TIMESTAMPTZ        -- 解绑/换绑时置为当前时间，不直接物理删除——见下面"冷却期"
);
-- 唯一约束只管"仍然生效"的身份（released_at为空的）：解绑之后的旧邮箱/手机号留在表里当历史记录，
-- 不会一解绑就立刻可以被别的账号抢注，但也不会挡住"同一个人用同一个邮箱重新绑回来"这种操作
-- （WHERE released_at IS NULL 这个条件下，旧的已释放记录不参与唯一性判断）
CREATE UNIQUE INDEX identities_active_uniq ON identities (provider, provider_uid) WHERE released_at IS NULL;

-- 会员资格记在 user_id 上，不再记在设备上——这是整套系统存在的意义
CREATE TABLE memberships (
  user_id       UUID PRIMARY KEY REFERENCES users(user_id),
  is_premium    BOOLEAN NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ,
  source        TEXT,              -- 'ios' | 'android' | 'wechat' | 'alipay' | 'stripe' | 'lifetime'
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 每台设备购买时上报的原始凭证，用于审计/申诉，不作为会员资格的直接判断依据
CREATE TABLE purchase_receipts (
  receipt_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id),
  platform      TEXT NOT NULL,     -- 'app_store' | 'google_play' | 'wechat' | 'alipay' | 'stripe'
  raw_receipt   TEXT NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 二、各登录方式接入要点

| 方式 | 适用范围 | 接入方式 | 备注 |
| --- | --- | --- | --- |
| 邮箱验证码 | 全球 | Firebase Auth Email Link 或 Supabase `signInWithOtp` | 不用密码，省掉忘记密码流程 |
| 手机验证码（短信） | 全球（除大陆） | Firebase Phone Auth / Twilio Verify | |
| 手机验证码（WhatsApp渠道） | 东南亚/印度/拉美 | Twilio Verify 的 WhatsApp channel | **不是独立登录方式**，只是验证码送达渠道换成了WhatsApp消息，核验逻辑和短信验证码完全一样 |
| Google 登录 | 全球 | Google Identity Services / `@capacitor-community/google-login` | |
| Facebook 登录 | 全球 | Facebook Login SDK | |
| Apple 登录 | 全球（iOS必须） | Sign in with Apple | **iOS上一旦有其他第三方登录就必须提供这个**（App审核指南4.8条），不是可选项 |
| LINE 登录 | 日本/台湾/泰国等LINE活跃地区 | LINE Developers 的 OAuth流程，或 Firebase 的"通用OIDC供应商"配置 | 不是Firebase/Supabase的内置标准供应商，需要单独接 |
| 手机验证码 | 大陆 | 阿里云/腾讯云短信服务 | 不能用Twilio等海外服务商，大陆手机号收不到 |
| 微信登录 | 大陆 | 微信开放平台"移动应用"OAuth流程 | 建议存 `unionid` 而不是 `openid`，以后做小程序/公众号时身份能对上 |

## 三、大陆"实名认证"的法律边界（避免过度收集）

依据：《个人信息保护法》第6条"最小必要原则"。

- **普通消费类App（听白噪音、买会员，没有直播打赏/UGC内容发布/金融功能）**：手机验证码
  即可满足实名要求，**不需要**收集身份证号或做人脸识别。
- 原因：大陆手机号在运营商层面本身就是实名制（办卡需要身份证），App只要验证"这个手机号
  确实由本人在操作"（靠收验证码），就间接达到了实名效果。
- 身份证/人脸识别只在"直播打赏""大额支付""内容发布审核"等敏感场景才是强制要求，眠窗现在
  的功能形态不触发这个门槛。如果以后加了评论区/UGC/社区功能，需要重新评估。
- 参考：[App"实名认证"如何遵循"最小必要原则"](https://www.thepaper.cn/newsDetail_forward_16165104)

## 四、身份绑定与合并规则（解决"同一个人换登录方式"）

**不做猜测性自动合并**（比如"两个账号姓名一样就合并"），只在能确认是同一个人的情况下处理：

1. **用户已登录，主动在账号设置里"绑定"另一种登录方式**——最主要、最安全的路径。
   - 校验新身份未被别的 user_id 占用（`identities` 表的唯一约束会在数据库层面保证这点）
   - 已被占用 → 提示"该Google账号已绑定到另一个账号"，不能强行绑
2. **新登录方式返回的、经平台验证过的邮箱，与账号上已有的、同样验证过的邮箱完全一致**
   （比如用Google登录，Google验证过这个邮箱属于登录者，这个邮箱恰好也是之前邮箱验证码
   登录验证过的那个）——这种可以安全自动合并。
3. 其余情况（手机号和邮箱之间没有验证关系、不同OAuth供应商"姓名"相同但邮箱不同）
   **只能引导用户手动绑定，绝不自动合并**——防止把陌生人的账号误并到一起，造成会员资格/
   隐私泄露给错误的人。

未登录状态下，提供"找回账号"入口：输入任意一个曾经验证过的邮箱/手机号，发验证码，验证通过
后登录到对应 user_id——这是用户忘了自己上次用哪种方式登录时的兜底路径。

## 四点五、更换邮箱/手机号/解绑账号——这几个最容易出bug、也最容易让用户烦的地方

这轮review专门检查了这块，原设计只有"绑定新方式"，没覆盖"换"和"解绑"，补上以下规则：

### 1. 换邮箱/换手机号要做成"一步到位"，不要让用户先解绑再重新绑

用户点"更换邮箱"，只需要验证一次新邮箱，后端在**同一个事务**里完成"插入新身份行 + 把旧的
同类型身份行标记为已释放"，前端只感觉是"改了一下"，不暴露"解绑"这个概念给普通换绑场景。
分两步操作（先解绑、再绑定）只在用户主动要"去掉一种登录方式但不换新的"时才出现，是解绑的
入口，不是换绑的默认路径——换绑和解绑是两个不同的用户意图，不该共用同一套交互。

### 2. 解绑不能减到0种登录方式

`identities` 表里一个 user_id 对应的"仍然生效"（`released_at IS NULL`）身份数量，解绑前后端
都要校验 ≥1，不能靠前端一个判断就放心——前端的拦截可以被绕过（比如直接调API），真正的边界
必须在后端重复校验一次。如果已经只剩1种，解绑请求直接拒绝，提示"请先绑定另一种登录方式"。

### 3. 旧凭证的"冷却期"——防止号码/邮箱被回收后被别人登进旧账号

大陆手机号运营商会回收停用的号码重新分配给新用户，邮箱服务商也有类似的"长期不用自动释放"
政策。如果解绑/换绑之后立刻允许任何人拿这个邮箱/手机号注册新账号，理论上存在一种边缘场景：
号码被回收给新机主后，新机主直接拿这个号码"登录"进了老用户换绑前留下的历史痛点（虽然已经
解绑、本身登不进旧账号，但如果系统其它地方还残留对旧凭证的引用，比如客服工单、待处理的
邮件通知，可能造成混淆）。做法：解绑/换绑时不物理删除这一行，只打 `released_at` 时间戳
（见上面表结构），建议至少保留30天记录用于审计和客服申诉核对，30天后这个凭证值才可以被
任何账号（包括别人）重新占用。

### 4. 安全提醒：变更登录方式时，通知"旧的那个"

解绑、换绑发生时，如果旧的那个身份渠道本身还能收到通知（旧邮箱没有停用），应该给它发一条
"你的账号刚解绑/更换了手机号xxx，如果不是你本人操作，请立即联系客服"。这是账号被盗用场景下
唯一能让真正机主在第一时间发现异常的机会——没有这条，攻击者拿到一次登录会话后解绑掉机主的
联系方式，机主在事后申诉时会更难证明自己是本人。

### 5. 合并/换绑时的"占用冲突"要给清楚的提示，不能卡死

无论是绑定新方式还是换绑，新凭证如果已经是别的 user_id 名下**仍然生效**的身份，都要在提交
验证码之前（或验证通过后、写入数据库前）明确拒绝并提示"这个邮箱/手机号已经绑定在另一个
账号上"，而不是静默失败或者报一个看不懂的错误——用户看到这条提示，大概率能自己想起来
"对，这是我的另一个小号"，然后去登录那个账号查看，不需要联系客服。

## 五、本机数据迁移（游客 → 账号）

App 目前允许完全不登录使用（本机 localStorage 记录最近播放、自定义组合、连续天数等）。
用户第一次登录成功那一刻，前端（`www/js/auth.js` 的 `migrateLocalStateIfNeeded()`）应该把
这些本机数据上报给后端，由后端合并进新登录的 user_id 名下，而不是让用户感觉"登录了反而
东西都没了"。合并策略建议："数量较大/时间较新"的数据优先，不要用新设备的空数据覆盖账号上
可能已经从别的设备同步过来的数据。

## 六、接口列表（草案）

```
POST /api/auth/email/request-code     {email}
POST /api/auth/email/verify           {email, code}              → 登录态
POST /api/auth/phone/request-code     {phone, channel}           channel: 'sms'|'whatsapp'
POST /api/auth/phone/verify           {phone, code}              → 登录态
POST /api/auth/oauth/:provider        {idToken}                  provider: google|facebook|apple|line
POST /api/auth/wechat                 {code}
POST /api/auth/cn-phone/request-code  {phone}                    大陆渠道专用
POST /api/auth/cn-phone/verify        {phone, code}              → 登录态
POST /api/account/link-identity       {provider, credential}     需已登录，新增一种登录方式
POST /api/account/change-identity     {provider, newCredential}  需已登录，一步换绑同类型（见"四点五"第1点）
POST /api/account/unlink-identity     {provider}                 需已登录，剩1种时后端拒绝（见"四点五"第2点）
POST /api/account/migrate-local-state {deviceId, snapshot}       需已登录，见"五、本机数据迁移"
GET  /api/account/me                  → user_id, identities[], membership
POST /api/account/export              需已登录，见"八、账号注销与数据导出"
POST /api/account/delete              需已登录，见"八、账号注销与数据导出"
```

## 八、账号注销与数据导出（不是加分项，是强制要求）

这条不是"做了更合规"，是两边都**明确要求**、不做会直接导致上架被拒或监管处罚：

- **Apple App Review Guideline 5.1.1(v)**：凡是支持"在App内创建账号"的App，**必须**同时支持
  "在App内直接注销账号"，不能只给一个客服邮箱或者让用户去网页端操作——审核会实际测试这个
  入口，没有会直接被拒。这条是2022年新增的强制要求，眠窗现在的账号设计里只有"登录/换绑/
  解绑登录方式"，没有"整个账号一起删掉"的入口，**必须补上**。
- **GDPR 第17条"被遗忘权"/ 第20条"数据可携权"、中国《个人信息保护法》第47条**：用户有权要求
  删除个人信息、要求导出一份自己的数据副本。覆盖到海外和大陆两套用户都适用，不是只做一边。

### 接口设计

```
POST /api/account/export   {}   需已登录
  → 异步生成一份JSON（identities脱敏后的provider类型+绑定时间、membership记录、
     purchase_receipts的订单号/时间/金额、本机同步过的使用数据），完成后发到用户已验证的
     邮箱/手机号一个下载链接（链接本身要有有效期+一次性token，不要做成谁都能直接访问的固定URL）

POST /api/account/delete   {}   需已登录，建议要求重新验证一次（刚发的验证码或重新登录），
                                 防止"别人借用了你解锁状态的手机，顺手把你账号删了"这种误操作
  → 立即：identities 全部标记 released_at，之后不能再用这些邮箱/手机号登录这个账号
  → 立即：display_name、本机同步数据清空
  → 保留：purchase_receipts 原始凭证按下面"法定保留期"保留，但要和 user_id 解耦展示
     （只在客服处理退款申诉时内部查询，不在"我的数据"里继续展示给已注销的人）
  → 到期后台任务物理删除保留期已过的记录
```

### 法定保留期怎么定（不是"立刻删干净"更安全，反而两头不讨好）

- 税务/财务记录（订单金额、时间）：多数税务辖区要求保留 **5-7年**（具体天数请让当地会计师/
  律师核实一次，不同国家不同），这期间不能物理删除 `purchase_receipts`，否则一旦被税务稽查
  或用户发起信用卡拒付(chargeback)申诉，App Store/Google Play/收款机构会先问你要交易记录，
  你自己手里没有就只能等平台兜底，处理时间会拉得很长。
  - 处理办法：`delete` 接口只解绑 `user_id` 与真实登录凭证的关联，`purchase_receipts` 本身
    按保留期继续存着，不算"违反被遗忘权"——GDPR第17条本身允许"为了履行法律义务"保留必要的
    交易记录，被遗忘权不是绝对权利。
- 账号身份信息（邮箱、手机号、OAuth标识）：用户确认注销后应尽快（建议30天内）删除，不需要
  比交易记录留得更久。

## 九、为什么不做身份证/人脸实名认证——这是刻意的设计决定，不是漏项

这是本轮法律风险排查里专门确认过的问题：**涉及到钱的App是不是必须要身份证实名才安全？
不是**。做出这个判断的依据：

1. **行业现状**：Calm / Headspace / Spotify / Netflix 这类订阅类App全球范围内都只用
   邮箱/手机号/第三方OAuth登录，没有一家在普通订阅场景下要求上传身份证或人脸识别——这是
   消费类订阅App的行业常态，不是眠窗一家偷懒。
2. **钱本身的风控不是App该管的事，是收款方该管的事**：
   - iOS/Android内购：App Store / Google Play 是法律上的"商户"(merchant of record)，
     持卡人信息、盗卡风险、拒付(chargeback)都由苹果/Google自己的风控体系处理，App拿到的
     只是一个"这笔钱真的付成功了"的回执（receipt/purchaseToken），App本身既看不到卡号，
     也不需要自己再做一层身份核验——苹果/Google已经替你做完了这一层。
   - 微信支付/支付宝：这两个支付机构本身在开户时已经对商户和用户完成实名认证（微信/
     支付宝账户绑定银行卡时就要求身份证），这层实名义务落在持牌支付机构身上，不需要App
     重复收集一遍身份证号——重复收集反而在《个人信息保护法》下属于"超出必要范围"，
     自己给自己增加一个新的敏感个人信息泄露责任源。
   - Stripe：同理，Stripe作为持牌支付机构自己承担KYC(了解你的客户)义务。
3. **身份证号/人脸在国内是"敏感个人信息"，《个人信息保护法》第28-30条要求"单独同意"+
   "充分必要性"才能收集**，白噪音订阅这种场景很难论证"充分必要"，收了反而是额外的
   合规负担和数据泄露后的责任敞口（身份证号泄露的处罚力度远高于邮箱泄露）。
4. **"假账号/冒领账号被起诉"这个担心，身份证实名并不能真正解决**，能解决这个问题的是：
   - 真正的支付凭证留痕（`purchase_receipts` 表 + 苹果/Google/微信支付宝后台自己保存的
     付款人记录）——法律纠纷时拿这些做证据，不需要你自己再存一份身份证；
   - 清晰的《用户协议》里写明"账号由注册的邮箱/手机号本人负责保管，App不对第三方冒用
     登录凭证造成的损失承担赔偿责任（除非是App自身的安全漏洞导致）"——这是用条款分配
     责任，不是用身份证锁定身份；
   - 账号异常变更时的"旧凭证通知"机制（见"四点五"第4点）——账号被盗用时让真正机主能
     第一时间发现，比事后翻身份证更有用。

**结论/已执行的决定**：登录方式维持现状（邮箱/手机号验证码 + Google/Apple/Facebook/LINE/
微信OAuth），**不加身份证/人脸实名认证**。唯一需要补的是上面"八、账号注销与数据导出"，
这是Apple强制要求+法定数据权利，和"是否要身份证实名"是两件不同的事，不要混在一起判断。

## 十、App Store审核视角：强制注册 vs 可选登录

Apple Guideline 5.1.1(v) 还有一条容易被忽略：**如果App的核心功能不需要账号就能用，
却强制要求注册才能进入，审核会直接拒**（"账号创建被要求，但功能本身不需要账号"）。
眠窗现在的设计（游客免登录可用全部免费内容，登录只是为了跨设备同步会员资格/自定义数据）
正好符合Apple的期望形态，**不要在后续迭代里改成"必须注册才能用"**，否则会从"合规"
变成"违规"。

## 七、与 payments.js / membership.js 的关系

购买校验（苹果/Google/微信/支付宝收据校验）发生在后端拿到 `user_id` 之后，写入
`memberships` 表；前端 `Membership.setPremium()` 对接的仍然是本地缓存展示，真正的依据
是后端这张表——这一点和 `payments.js` 里"本地缓存只是离线兜底，真相来源是平台+后端"的
原则完全一致，账号系统只是在"平台"和"后端"之间，多加了一层"这是哪个人"的身份映射。

## 十一、大陆上架的额外合规事项（和账号体系本身无关，但容易漏，查资料时顺带确认的）

这两条不是账号体系的一部分，但都是"大陆渠道上架前必须做、不做会直接下架/无法联网"的硬性
要求，记在这里防止漏掉：

1. **App备案（工信部移动互联网应用程序备案）**：2024年4月1日起正式强制执行，大陆应用商店
   （华为/小米/OPPO/vivo等）要求上架的App必须先完成备案，未备案的App会被要求下架或限制
   联网。这个备案和"网站ICP备案"是两件事，App本身也要单独备案一次，需要先有已完成ICP备案
   的主体资质。建议在大陆渠道正式提交上架前，预留时间去做这个备案，别等审核被打回才发现。
2. **隐私政策/服务条款页面的网站备案**：如果 `privacy-policy.html` / `terms-of-service.html`
   部署在大陆境内的服务器上，域名需要完成工信部网站 ICP 备案才能正常访问；部署在境外的静态
   托管（GitHub Pages / Cloudflare Pages 等）通常不需要大陆 ICP 备案，但大陆用户访问境外
   托管的页面有时会偶发访问不稳定的情况——如果大陆用户是主要人群，可以考虑额外在一个已完成
   备案的大陆域名/服务器上放一份镜像，两边内容保持一致。

这两条都是运营/资质层面的事，不是代码能解决的，列在这里是为了不要在做完所有代码和文案工作后，
临到上架才发现卡在这两个环节。
