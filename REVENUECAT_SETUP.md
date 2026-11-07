# 眠窗 · Google Play Billing（经 RevenueCat）接入步骤

这份文档是给你（或者你以后找的外包移动端开发）在**你自己能上网的电脑**上照着做的。
我这边云端环境的网络策略不允许访问 npm 官方仓库，所以涉及 `npm install`、`npx cap add android`、
编译 Android 工程这些步骤，没法替你在这边跑，只能把代码和每一步的操作写清楚。

代码已经写好的部分（这些你不用再写）：
- `www/js/payments.js` —— 真实接入 RevenueCat SDK 的购买/恢复购买逻辑
- `www/js/pricing.js` —— 付费墙点击购买后的真实流程（已经去掉了之前的"演示用假数据"）
- `www/js/vendor/capacitor-purchases-entry.js` —— 打包 RevenueCat SDK 用的入口文件
- `functions/index.js` —— 接收 RevenueCat webhook、把会员状态记进 Firestore 的云函数
- `package.json` —— 已经加好了需要的依赖和一条打包命令

---

## 第一部分：Google Play Console 后台（建商品）

1. 打开 [Google Play Console](https://play.google.com/console)，选你的眠窗 App（如果还没建 App 条目，先建一个，选"应用"→"创建应用"，App 内容相关的问卷先如实填，不影响这一步）
2. 左侧菜单找到 **商品（Monetize）→ 订阅（Subscriptions）**，创建两个订阅商品：
   - 商品 ID：`nightwindow_monthly`，计费周期：1 个月
   - 商品 ID：`nightwindow_yearly`，计费周期：1 年（可以在这里设置"7 天免费试用"，之前方案文档里提到的年付试用就是在这里配）
   - **商品 ID 必须和这里写的一模一样，大小写也要完全一致**，这是跟代码里 `pricing.js` 对应的字符串，填错了订阅能买成功但 App 认不出来
   - ⚠️ **重要（互查时发现，直接关系到钱）：`nightwindow_monthly` 和 `nightwindow_yearly` 强烈建议
     建成"同一个订阅（Subscription）"下的两个不同"基本方案（Base Plan）"，不要建成两个完全独立的
     订阅条目。** 原因：如果是同一个订阅下的两个基本方案，Google Play 在用户"从月付换到年付"时
     能走它自己的"换购/替换(upgrade/downgrade)"机制，平台会自动帮用户结清/按比例退旧订阅的钱，
     不会让月付和年付同时扣费；如果建成两个完全独立的订阅，用户点"升级到年付"时实际上是另开了
     一笔全新订单，旧的月付订阅不会被自动取消，用户很可能同时背着两笔在扣费的订阅，直到自己发现
     账单异常才察觉——这正是"升级后反而被多收钱"这类投诉最常见的成因。另外，这个 App 目前
     `payments.js` 里调用 `purchasePackage()`/`purchaseStoreProduct()` 购买时，**没有传递 Android
     Billing Library 的"换购(product change)"参数**（RevenueCat 的 Capacitor SDK 支持通过
     `googleProductChangeInfo: { oldProductIdentifier, prorationMode }` 这个选项传递，见 RevenueCat
     官方文档的 Android Subscription Upgrades/Downgrades 一节），哪怕后台配置对了，代码这边目前也
     还没利用上这个机制——这是一个已知、还没修的技术欠账，现在只先用 App 内的提示文案
     （`subscriptionUpgradeCancelOldReminder`）作为"先提醒用户自己手动去取消旧订阅"的权宜之计，
     不是真正的根治方案。真正根治需要：① 后台按上面说的建成同一订阅下的两个基本方案，
     ② `payments.js` 的 `purchase()` 在检测到"用户当前有一个不同的活跃订阅"时，把这个参数传给
     `purchasePackage()`。iOS 这边 StoreKit 的订阅分组（Subscription Group）也有类似机制，
     把 monthly/yearly 放进同一个 Subscription Group 即可，App Store 会自动处理换购，这点
     不需要额外传参数，只是后台要配对。
3. 左侧菜单找到 **商品 → 应用内商品（In-app products）**，创建两个一次性商品：
   - 商品 ID：`nightwindow_lifetime`
   - 商品 ID：`nightwindow_diamond`
4. 四个商品的价格，按 `www/js/pricing.js` 里 `PRICING` 常量定的价位填（这是唯一真实生效的价格来源，
   不要照抄 `商业化与全球上架方案.md`——那份文档记录的是历史调价过程，其中引用的早期价格已经过时，
   互查时发现两份文档数字不一致，已经在那份文档里加了说明）：
   月付 $8.99 / 年付 $49.99 / 买断 $199.99 / 钻石 $600（2026-10-14 由 $999 下调），多地区价格 Google Play 后台可以用它自己的
   "自动转换汇率"功能，不用你一个个地区手填
5. 把这四个商品都发布/激活（Google Play 后台商品草稿状态不会生效）

---

## 第二部分：RevenueCat 后台（建项目、建权益、拿 Key）

1. 去 [RevenueCat](https://www.revenuecat.com/) 注册账号（免费注册，不需要信用卡）
2. 创建一个新 Project，名字随便取（比如"眠窗"）
3. 左侧 **Apps** → 新建一个 App，平台选 **Google Play**：
   - 需要上传一个 Google 服务账号的 JSON 密钥文件，RevenueCat 用它来代你向 Google 查询订单状态做收据校验。生成方法：
     1. 去 [Google Cloud Console](https://console.cloud.google.com/)，选和你 Google Play Console 关联的项目（没有的话 Play Console 后台"用户和权限"里能看到关联的云项目）
     2. IAM 和管理 → 服务账号 → 创建服务账号，角色随便给个名字即可（权限等下一步在 Play Console 里单独授予，不在这里给）
     3. 给这个服务账号生成一个 JSON 密钥并下载
     4. 回到 Google Play Console → 用户和权限 → 邀请新用户，把这个服务账号的邮箱加进来，授予"查看财务数据"相关权限（RevenueCat 文档里会列出具体需要哪几项，照着勾）
     5. 把下载的 JSON 文件上传到 RevenueCat 这一步
4. 左侧 **Entitlements**，创建两个（**Identifier 必须和下面完全一致，这是代码里写死要对照的字符串**）：
   - `premium`
   - `diamond`
5. 左侧 **Products**，RevenueCat 会自动从 Google Play 拉取你刚才建的四个商品，把它们关联到对应 Entitlement：
   - `nightwindow_monthly` → 关联到 `premium`
   - `nightwindow_yearly` → 关联到 `premium`
   - `nightwindow_lifetime` → 关联到 `premium`
   - `nightwindow_diamond` → 关联到 `diamond`
6. 左侧 **Offerings**，建一个默认 Offering（比如叫 `default`），把上面四个商品都加成这个 Offering 下的 Package（这一步是为了以后方便做价格实验，不是强制的——代码里也写了"找不到 Offering 配置就直接按商品 ID 购买"的退路，但建议还是配一下）
7. 左侧 **Project Settings → API Keys**，复制 **Google Play 的 Public SDK Key**（不是 Secret Key，Public 的那个专门设计成可以放进客户端代码）

---

## 第三部分：在代码里填上你的 Key

1. 打开 `www/js/payments.js`，找到这几行：
   ```js
   const REVENUECAT_API_KEYS = {
     ios: 'REPLACE_WITH_REVENUECAT_IOS_PUBLIC_SDK_KEY',
     android: 'REPLACE_WITH_REVENUECAT_ANDROID_PUBLIC_SDK_KEY'
   };
   ```
   把 `android` 那一行换成你刚才复制的 Key（iOS 那把等以后做 iOS 版时再填，现在留着占位字符串没关系，不影响安卓）

---

## 第四部分：本地安装依赖、打包、生成 Android 工程

### 第 0 步（互查时发现，之前这份文档漏写、必须先做、而且做晚了代价很大）

1. **先装好 Android Studio**（里面会带上需要的 Android SDK），下载地址
   [developer.android.com/studio](https://developer.android.com/studio)——下面 `npx cap add android`
   之后要用它打开、编译、运行 Android 工程，没装的话这几步会卡住。
2. **打开 `capacitor.config.json`，把第一行的 `"appId": "com.yourcompany.nightwindow"` 换成你自己
   定的、最终要用的包名**（反向域名格式，比如 `com.你的公司或你的名字.nightwindow`）。
   ⚠️ 这一步必须在 `npx cap add android` 之前做，而且**一旦这个 App 第一次上传到 Google Play
   Console 之后，包名就永久不能再改**——如果漏了这一步，拿着占位包名生成了 Android 工程、
   甚至已经上传过一次，Google Play 商品后台配的四个商品会对应不上实际安装的 App（表现为
   "商品都配好了、代码也接了，但点购买说没有这个商品，或者买了也不解锁"），到时候只能
   重新注册一个新的 App 条目，没法在原来那个上面改。

在你自己电脑的终端里，进到项目目录（这个项目代码会在 GitHub 仓库接上之后推过去，到时候你 `git clone` 下来）：

```bash
npm install
npm run build:purchases
npx cap add android
npx cap sync android
```

- `npm install` 会把 `@revenuecat/purchases-capacitor`、`esbuild` 这些都装好。⚠️ 互查时发现：
  `package.json` 里这个依赖以前写的是 `"latest"`，意味着你（或以后任何人）每次重新 `npm install`
  都可能装到一个不同的新版本，万一 RevenueCat 哪天发布了不兼容的大版本更新，`payments.js`
  里直接调用的几个 SDK 方法（`configure`/`getOfferings`/`purchasePackage`/读取
  `entitlements.active` 的字段结构）就可能悄悄对不上，表现成"买了却不解锁"这种不容易查的问题。
  现在已经改成锁定一个具体版本号（写这份文档时 RevenueCat 官方 GitHub 上看到的最新版本号，
  但我这边网络策略没法直接连 npm 官方源验证，**你 `npm install` 之后建议顺手跑一下
  `npm view @revenuecat/purchases-capacitor version` 确认现在最新是多少，和 `package.json`
  里锁的版本号对一下，决定要不要手动升级**）。以后除非你确认过新版本说明、测试通过，否则
  不要再把这一行改回 `"latest"`。
- `npm run build:purchases` 会生成 `www/js/vendor/capacitor-purchases.bundle.js`（这个文件不提交进 Git，每次 `npm install` 后本地跑一次就行，`index.html` 已经接好了引用这个文件的 `<script>` 标签）
- `npx cap add android` 第一次执行会生成 `android/` 原生工程目录（这一步会读取你上面已经改好的 `appId`）
- `npx cap sync android` 把 web 代码和插件同步进 Android 工程

然后用 Android Studio 打开 `android/` 目录（`npx cap open android` 也能直接帮你打开），编译运行到真机/模拟器上。这一步（内部测试、给自己和测试账号用）可以先用 Android Studio 自动生成的 debug 签名，不需要正式签名证书；但**真正要发布到 Google Play 正式/内部测试轨道，还需要一个发布用的签名密钥（上传密钥）**——这部分 Google Play Console 自己的"应用签名"文档里有详细步骤（后台上传 App 时会提示你），这里不展开，但务必留意不要跳过，也不要弄丢生成的密钥文件（丢了会导致以后没法更新这个 App）。

---

## 第五部分：Firebase 后端（可选，但建议现在一起做）

这部分负责把会员状态也记一份在你自己的服务器上（用途见 `functions/index.js` 文件顶部注释）。

`firebase.json`、`firestore.rules`、`functions/index.js` 这几个文件我已经写好放进仓库了，
**不要跑 `firebase init`**——它会提示你"要不要覆盖这些已有文件"，一旦手滑选了覆盖，
这些已经写好的内容就没了。只需要做"把本地项目和你的 Firebase 项目关联起来"这一步：

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # 在项目根目录执行；会列出你账号下的 Firebase 项目，选一个（没有的话先去
                      # console.firebase.google.com 新建一个），这一步会自动生成 .firebaserc
```

1. 去 [Firebase 控制台](https://console.firebase.google.com/) 确认 Firestore 数据库已创建（选"原生模式"，地区随便选一个离你的用户近的）
2. 打开 `functions/index.js`，把 `WEBHOOK_SHARED_SECRET` 换成一串随机字符串（终端执行 `openssl rand -hex 32` 可以生成一个）
3. 部署：
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules
   ```
4. 部署成功后终端会打印出一个形如 `https://us-central1-你的项目id.cloudfunctions.net/revenueCatWebhook` 的网址
5. 回到 RevenueCat 后台 → Project Settings → Integrations → Webhooks，把这个网址填进去，**Authorization header** 那一栏填第 2 步生成的同一串密钥

---

## 第五部分·续：防"白嫖会员"的第二层保险（getMembershipStatus）

**这一步不是可选的装饰——它是堵住"有人在App里直接用浏览器调试工具调用
`Membership.setPremium()` 伪造永久会员"这个漏洞的关键一环，建议和第五部分一起做完。**

背景：`Membership.setPremium()` 是本地代码里一个公开、没有权限保护的函数，任何能在
WebView 里跑 JS 的人（比如用手机上的调试工具）都能直接调用它，让本地缓存认为"我是会员"。
这个问题没法只靠客户端代码彻底堵死——客户端的代码和数据，对使用App的人来说天然是"透明"的。
真正能堵住它的办法，是让App去问一个使用者改不了的地方：你自己的服务器。
`functions/index.js` 里新增的 `getMembershipStatus` 这个云函数就是干这个的——它只读
`memberships`/`memberships_test` 这两张表（这两张表的写权限只给了 RevenueCat webhook，
`firestore.rules` 里已经锁死，任何客户端都没法直接写），所以它的回答是可信的，不受
本地伪造状态影响。

1. 这个函数已经写在 `functions/index.js` 里了（`exports.getMembershipStatus`），不需要你
   额外写代码，和第五部分的 `revenueCatWebhook` 一起部署（上面
   `firebase deploy --only functions,firestore:rules` 这条命令已经会把它一起部署上去，
   不需要额外执行）。
2. 部署成功后终端会打印出这个函数自己的网址，形如
   `https://us-central1-你的项目id.cloudfunctions.net/getMembershipStatus`
   （和 `revenueCatWebhook` 的网址长得很像，但函数名不一样，注意别抄错）。
3. 打开 `www/js/payments.js`，找到这一行：
   ```js
   const MEMBERSHIP_VERIFY_URL = 'REPLACE_WITH_YOUR_GET_MEMBERSHIP_STATUS_FUNCTION_URL';
   ```
   把它换成上一步拿到的真实网址。
4. 不需要再做别的接线——`payments.js` 里 `ensureRevenueCatConfigured()` 已经会在配置好
   RevenueCat SDK 之后，自动把这台设备的本机id（`Auth.deviceId()`）登记到 RevenueCat
   （这样 webhook 存进 Firestore 的记录，和这里查询用的id才能对上号）；`reconcileOnLaunch()`
   （每次App启动/回到前台都会调用）也已经会自动调这个新函数核实一遍，发现"服务器说没有，
   本地却显示是会员"就会自动清空本地的伪造/过期状态。
5. 如果暂时不填这个网址（继续留着占位字符串），App 不会报错、不会崩溃、购买和查询本身都
   不受影响——只是少了这一层保险，`index.html` 启动时的占位符自检会用
   `console.error` 提醒你这件事没做完，别忘了在正式上线前补上。

---

## 第五部分·再续：扣费失败宽限期（Grace Period）——后台配置项，代码帮不上这一步

对应"扣费失败后用户体验会不会突然变差"这类投诉：用户的银行卡临时扣款失败（卡过期、余额不足、
银行风控拦截等），不代表这个人不想续费了，如果一扣费失败就立刻收权益，会制造很多"我明明在用、
突然就没了"的投诉。**Apple 和 Google 都有"账单宽限期（Billing Grace Period）"机制，让用户在
扣费失败后还能继续用一段时间（通常可配置 6~16 天），这段时间里系统会在后台自动重试扣款**——
但这是两边商店后台各自的一个开关，**不是代码能打开的**，务必去配置一下，否则宽限期默认可能是
关闭或很短的：
- **App Store Connect**：你的订阅 → 选中一个订阅 → 应用内购买设置里找"账单宽限期"
  （Billing Grace Period），打开它。
- **Google Play Console**：商品（Monetize）→ 订阅 → 对应订阅的"价格和升级"或"账号详情"里能找到
  类似的宽限期设置（后台界面措辞时有调整，找不到就在后台搜索框搜"grace period"/"宽限期"）。

配置好之后不需要改代码——宽限期生效的那几天，Apple/Google 自己仍然认为这笔订阅"有效"，
RevenueCat 查到的权益、`functions/index.js` 里新增的 `BILLING_ISSUE` 事件处理（只记一个
`billingIssueDetectedAt` 时间戳供以后客服/提醒功能用，不会碰 `isPremium`）都已经按这个假设写好了。
**还没做、且不在这轮代码修复范围内的部分**：主动提醒用户"你的支付方式可能有问题，再不更新
还有几天就会失去会员"这件事，目前App里没有对应的弹窗/推送——这是一个需要单独设计文案和界面的
新功能，想做的话可以单独提出来，我再帮你设计。

---

## 第六部分：测试

1. 在 Google Play Console → 设置 → 许可测试（License testing），把你自己的 Google 账号加进测试名单
   ⚠️ **务必把这个名单控制在只有你自己和真正需要测试的人**——`getMembershipStatus` 这个查询接口
   （第五部分·续）为了方便你自己验证测试购买，把"测试/沙盒购买"也当成和真实付费等价的会员
   状态返回。如果这个测试名单、或者下面第2步的内部测试轨道，被设置成"任何有链接的人都能加入"，
   就等于任何人都能让自己变成"测试者"、走一遍几乎零成本的沙盒购买，拿到和真实付费用户完全一样
   的会员状态——这不是代码漏洞，但如果测试范围开得太松，效果上和漏洞没区别。
2. 把 App 上传到 Google Play 的**内部测试（Internal testing）**轨道（哪怕还没准备好正式发布，内部测试轨道可以先用来跑通整条购买链路）
   ⚠️ 内部测试轨道的"测试者"设置同样要检查一遍，别设置成任何人凭链接就能加入
3. 用加过测试名单的账号在真机上安装内部测试版 App，走一遍购买流程——测试账号的购买不会真的扣钱，但会走完整的真实流程
4. 确认：
   - 购买成功后，App 内立刻显示会员已解锁（UI 状态变化，锁图标消失等）
   - 去 RevenueCat 后台 Customers 页面，能查到这个测试账号的订阅记录
   - 如果配了 Firebase（第五部分），去 Firestore 控制台看 `memberships` 这个 collection，应该能看到对应的一条记录
   - 点"恢复购买"按钮，卸载重装 App 后再点一次，能正确恢复会员状态
   - 如果配了 `MEMBERSHIP_VERIFY_URL`（第五部分·续），可以在浏览器里直接打开
     `你的getMembershipStatus网址?app_user_id=你的deviceId`（deviceId可以在App里打开调试
     工具执行 `Auth.deviceId()` 看到）手动验证一下返回的 JSON 里 `isPremium` 是不是 `true`，
     确认这条"服务器核实"链路真的接通了，不是只是没报错但其实没生效

---

## 还没做的部分（留给以后）

- iOS 版：等你有了 Apple Developer Program 账号，在 RevenueCat 后台加一个 iOS App、填 iOS 的 Public SDK Key，App Store Connect 里建同样的四个商品 ID，基本就能跟安卓共用现在这套代码，不需要重写
- 大陆渠道（微信支付/支付宝）：`payments.js` 里的 `chinaAdapter` 还是占位状态，需要企业资质到位后再接，RevenueCat 不支持这条线，需要单独开发
- 真正的账号系统（跨平台会员身份同步）：设计已经在 `/backend-reference/accounts-design.md` 里，现在这份 Firebase webhook 只是先把数据存起来，还没有登录/查询接口，等账号系统排上日程再接着做
- "限制同一个 Apple/Google 账号最多能绑定几个 User ID"这类防共享账号刷权益的限制：现在还没有
  登录/账号系统，`app_user_id` 用的是设备本机id（`Auth.deviceId()`），不是真正的登录身份，
  所以"一个购买账号对应多个登录账号"这个风险目前不存在——这条要等账号系统做出来、有了真正的
  登录User ID之后才需要处理，到时候要记得回来补这一条，别忘了
- 主动提醒"支付方式有问题/宽限期快结束"的App内弹窗或推送：见上面第五部分·再续，服务端已经记录了
  `billingIssueDetectedAt`，客户端这边的提醒UI还没做

---

## 钻石档（nightwindow_diamond）上架专项

### 1. 韩国区价格上限——钻石档全球唯一建不出来的市场（钻石档已于 2026-10-14 由 $999 下调为 $600）

官方规则（Play Console 帮助页「Increased price limit」）：符合条件的开发者可以申请把商品价格上限
提高到 US$8,000（或当地等值，仅面向"与 Google 保持良好合作、年收入至少 100 万美元"的开发者），但**韩国的上限固定维持在 US$400（或当地等值），不随申请提高**。
提升上限的资格门槛我们短期内达不到，所以钻石档在韩国只能二选一：

**方案 A（推荐）：韩国区不卖钻石档，其他市场正常卖 $600**
1. Play Console → 创建商品 `nightwindow_diamond`（其余配置照本文档第一部分正常做）
2. 在商品的「国家/地区」可用性设置里添加国家/地区时，**不勾选韩国**
3. 保存后韩国用户在商店里看不到这个商品。注意：韩国用户在 App 内付费墙仍会看到钻石卡
   （展示价来自 `pricing.js` 的参考值），点购买会走统一的失败提示——能用但不完美；
   想做得更干净，以后可以按商店区域（storefront）把钻石卡对韩国隐藏，属于非必须的打磨项

**方案 B（不推荐）：韩国单独设一个 ₩55 万左右的本地价**
同一权益两个市场价差一倍，容易被截图对比，引发"韩国被区别对待/其他市场被宰"的舆情，
还可能有人换区购买。真要选 B，韩国本地价以 Play Console 里的实际换算为准。

> 上限数值以 Play Console 保存商品时的实际报错为准（Google 会微调政策）。
> App Store（iOS）没有这道坎：App Store Connect 的价格阶梯上限远高于 $600，个别商店超出当地
> 上限时定价界面会单独提示，逐个确认即可。

### 2. 钻石专线邮箱——升级为域名邮箱的路径

现状：`diamond.js` 的 `DIAMOND_SUPPORT_EMAIL` 和 `index.html` 的 `SUPPORT_EMAIL` 都已填真实
Gmail，"尽量 24 小时回复"的承诺从现在就能开始兑现，gmail 本身不挡上架。

可选升级（让发件人显示域名而不是 @gmail.com，更有"专线"身份感；成本 ≈ 一个域名的年费）：
1. 买一个域名（任何注册商）。顺手把法务站 GitHub Pages 也绑到这个域名，一站两用
2. 选一种免费方案：
   - **Cloudflare Email Routing**（配置最简）：添加 `diamond@你的域名` → 转发到现有 Gmail。
     只管收信，回信仍从 Gmail 发出
   - **Zoho Mail 免费版**：收发都显示域名，配置稍多（需改域名的 MX/SPF/DKIM 记录）
3. 代码里同步改两处：`diamond.js` 的 `DIAMOND_SUPPORT_EMAIL`、`index.html` 的 `SUPPORT_EMAIL`
