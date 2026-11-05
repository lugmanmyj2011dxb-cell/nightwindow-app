# Google Play"数据安全表单"填写参考

> 这份文档帮你照着填 Google Play Console 后台的 Data safety（数据安全）表单。我没有你的
> Play Console 账号登录权限，没法直接帮你点提交，但下面按表单实际的分类顺序列出了该选什么、
> 为什么选这个——你照着勾就行，预计10-15分钟能填完。
>
> 填完之后一定要让这张表和 `privacy-policy.html` 的内容保持一致——这两个地方说的不是同一句话
> 会被认为是误导用户，是 Google 审核重点检查的点。这份参考是基于**现在代码里实际收集的数据**
> 写的，如果以后加了统计分析工具（比如 Google Analytics）、广告SDK，或者真的接入了后端账号
> 系统，必须回来重新过一遍这份表单再提交更新。

## 第一步：Does your app collect or share any of the required user data types?

选 **Yes**（只要登录功能一旦上线，就会收集邮箱/手机号；即使你现在还没接后端，这个表单填的是
"App 设计上会收集"，不是"今天后端有没有真的存下来"）。

## 第二步：具体数据类型

逐项对照：

| Google 表单里的分类 | 要不要勾 | 说明 |
| --- | --- | --- |
| **Personal info → Email address** | ✅ 勾 | 用户选择邮箱验证码登录时收集，用于识别账号、跨设备同步会员资格 |
| **Personal info → Phone number** | ✅ 勾 | 用户选择手机验证码登录时收集，用途同上 |
| **Personal info → Name** | ❌ 不勾 | 不收集真实姓名（OAuth登录只拿不可读的身份标识，不读姓名） |
| **Personal info → User IDs** | ✅ 勾 | 账号系统的 user_id、以及Google/Apple/Facebook/LINE/微信登录返回的平台身份标识 |
| **Financial info → Purchase history** | ✅ 勾 | 记录订单号、金额、时间（`purchase_receipts`），用于会员资格校验和客服申诉；**现在真的会经手第三方了（见下方2026-10更新）**，不再是"以后接了再改"的假设情况 |
| **Financial info → Other financial info** | ❌ 不勾 | 不触碰银行卡号/支付账户密码，这些由Google Play Billing/苹果/微信支付宝自己处理 |
| **App activity → App interactions** | ✅ 勾 | 自定义混音组合、连续使用天数、最近播放记录等使用数据 |
| **App activity → In-app search history** | ❌ 不勾 | 没有搜索功能 |
| **Device or other IDs** | ✅ 勾（2026-10起） | RevenueCat SDK 会收集设备型号/系统版本/App版本等技术信息用于订单校验，见下方更新说明 |
| **Location / Contacts / Photos / Camera / Microphone / SMS / Health** | ❌ 全部不勾 | 隐私政策里写明的"不请求这些敏感权限"，表单要和这句话对得上 |

## 第三步：每个勾选的数据类型，要分别回答这三个小问题

对上面每个✅勾选的类型，Google 都会再问三件事，统一按下面这套答：

1. **Is this data collected, shared, or both?**
   - 邮箱/手机号/User IDs/App interactions → **Collected**（不是 Shared，这些数据不会给第三方，
     除非你以后接了统计/广告SDK，那部分要单独标成 Shared 并说明给了谁）
   - Purchase history → **Collected**，如果走微信支付/支付宝/Stripe 直接渠道（不是走 Apple/
     Google 内购），订单信息需要经过这些支付机构处理，可以额外标注 **Shared**（用途选
     "Payment processing"，对象选对应的支付机构）
2. **Is this data processed ephemerally?** → 统一选 **No**（这些数据会持续存储用于账号系统运作，
   不是用完即丢）
3. **Is this data collection required or optional?** → 统一选 **Optional**（这是眠窗一个很大的
   合规优势：全部免费功能不需要登录，登录本身是可选功能，所以这些数据的收集对用户来说是可选的，
   不是必须同意才能用App——如实填 Optional，不要图方便填 Required）

## 第四步：Data usage and handling（用途）

每个数据类型的用途统一选：
- **Account management**（账号管理）
- **App functionality**（App功能，比如同步自定义组合）
- Purchase history 额外加选 **Fraud prevention, security, and compliance**（用于防刷/客服申诉核验）

## 第五步：安全相关的几个总的问题

- **Is all of the user data collected by your app encrypted in transit?** → 选 **Yes**
  （前提是你真的把后端API部署成HTTPS，不是HTTP——上线前务必确认这一点，选Yes但实际走HTTP
  是比不填这张表更严重的问题，等于对Google撒了谎）。
- **Do you provide a way for users to request that their data be deleted?** → 选 **Yes**，
  并填上账号注销的入口说明（对应 `backend-reference/accounts-design.md` 第八节的
  `/api/account/delete` 设计，和隐私政策里"账号注销"一节的说明保持一致）。

## 第六步：隐私政策链接

这张表最后会要求你填一个 Privacy policy URL——必须填 `privacy-policy.html` 部署后的真实公开
地址（和App内付费墙/设置页链接的是同一个地址），不能留空，也不能链接到首页（必须直接指向隐私
政策页面本身）。

## 以后要记得回来改的情况

- 接了 Google Analytics / Firebase Analytics 等统计分析工具 → 补"Device or other IDs"，
  并把相关数据类型标成"Shared"给 Google，用途加"Analytics"
- 接了广告SDK → 补"Device or other IDs"、可能还有"Approximate location"，标成"Shared"，
  用途加"Advertising or marketing"
- 真的做了身份证/人脸实名认证（目前设计决定是不做，见 `accounts-design.md` 第九节）→ 需要
  新增"Personal info → Other personal info"或更严格的敏感信息类别，并重新评估整张表

## 2026-10 更新：接入 RevenueCat + Firebase 之后，这张表要怎么改

这两个服务已经真的接进代码里了（见 `www/js/payments.js`、`functions/index.js`），不再是
"以后可能会接"的假设，提交 Data safety 表单时必须把下面这些加上，否则表单内容和实际代码行为
不一致，属于对 Google 隐报，审核/事后抽查都可能因此被下架：

| 数据类型 | 改动 | 说明 |
| --- | --- | --- |
| **Financial info → Purchase history** | 在"Is this data shared?"那一步，额外勾 **Shared**，用途选 **App functionality**，第三方选/填 **RevenueCat, Inc.** | 订单号、商品ID、金额、到期时间会被发送给 RevenueCat 用于校验订单真实性 |
| **Device or other IDs** | 改成 ✅ 勾，Collected **and** Shared，用途选 **App functionality** | RevenueCat SDK 运行时会读取设备型号/操作系统版本/App版本这类技术信息，用于订单校验和反欺诈；这不是"额外收集的广告标识符"，是 RevenueCat SDK 本身工作所必需的，但 Google 的表单口径下仍然算"Device or other IDs"这一类 |

Firebase（云函数 + Firestore）这部分**不需要**单独在表单里新增一行"Shared with Firebase"——
因为 Firebase 项目是开发者自己名下的后端基础设施（跟你自己写一个服务器、只是托管在 Google Cloud
上是一个性质），Google 的表单口径里，"自己的后端服务商"不算"与第三方共享"，这和 RevenueCat
（一个有自己独立产品、会把数据用于它自己业务的第三方公司）性质不同，所以 Purchase history 和
Device or other IDs 这两行"Shared"对象只需要写 RevenueCat，不用写 Firebase。

同时记得回去同步修改 `privacy-policy.html` 的"第三方服务"一节（已经写好了，这是提醒你——
如果以后又加了新的第三方服务，要连这两个地方一起改，不要只改一边）。

## 2026-10 互查补充：Firebase 那部分实际存的东西比"一份会员状态记录"更多

`functions/index.js` 收到 RevenueCat 的 webhook 之后，除了写一条会员状态记录，还会把**整条原始
事件**（`raw: event`）原样存进 `events` 子集合，这条原始事件里可能包含订单号、金额、币种、
购买所在的应用商店、**国家/地区**（`country_code`，RevenueCat webhook payload 通常会带这个字段）
等信息——这些字段里的"国家/地区"算一种粗粒度的地理位置信号，目前 `privacy-policy.html` 和这张
表都还没单独提到它。另外，云函数本身作为一个 HTTPS 接口，Google Cloud 默认会在运行日志
（Cloud Logging）里记录调用方的 IP 地址，这是平台默认行为，不是我们主动采集的，但严格来说
也是一种"收集"。

这两点目前判断是**低风险**（粗粒度国家/地区信息、以及调用方IP只会出现在运行日志/审计子集合里，
不会被拿来做广告或用户画像，`privacy-policy.html` 的"第三方服务"一节已经补充说明了这两点），
但如果以后 Google 审核或你自己过一遍更严格的检查，可以考虑：
1. 去 Google Cloud Console 确认 Cloud Functions 的日志保留策略，评估是否需要缩短IP日志保留期限；
2. 如果想做得更严格，也可以在 `functions/index.js` 写入 `events` 子集合之前，把 `raw` 里和
   当前实际用途（校验订单、客服对账）无关的字段先过滤掉，只留真正需要的那几个字段，而不是整条
   原样存——这个事review时发现的，还没有改代码，只是先把这个事实记录下来，留给你决定要不要改。
