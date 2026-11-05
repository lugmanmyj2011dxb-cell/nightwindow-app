/* ===================== RevenueCat SDK 打包入口（不要直接在 index.html 里引用这个文件本身） =====================

   背景：这个项目现在 www/js/ 下的文件都是用 <script src="..."> 直接加载的，没有走 webpack/
   vite 这类打包工具；但 @revenuecat/purchases-capacitor 是按 ES Module 发布的 npm 包，
   没法直接用一个 <script> 标签加载 node_modules 里的源文件。

   解决办法：用 esbuild（轻量、几乎不需要配置）把这一个文件单独打包成一个普通的、
   可以直接用 <script> 标签加载的 bundle 文件，运行：

     npm run build:purchases

   会生成 www/js/vendor/capacitor-purchases.bundle.js——这个生成出来的文件才是
   index.html 里真正要 <script src> 引用的那个（已经加好了，看 index.html 里
   `js/vendor/capacitor-purchases.bundle.js` 这一行，就在 js/payments.js 前面，
   顺序不能反，payments.js 要用到这里挂到 window 上的 CapacitorPurchases）。

   以后如果升级了 @revenuecat/purchases-capacitor 版本，或者改了下面这几行 import，
   都需要重新跑一次 `npm run build:purchases` 才会生效——改了这个入口文件本身不会
   自动生效，bundle.js 是构建产物，不是手写的，不要直接去改 bundle.js。
================================================================= */
import { Purchases, PURCHASES_ERROR_CODE, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

window.CapacitorPurchases = { Purchases, PURCHASES_ERROR_CODE, LOG_LEVEL };
