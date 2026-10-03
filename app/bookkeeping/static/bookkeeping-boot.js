// bookkeeping-boot — My Money 开局: 进页渲染/拉类别树/首同步。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
// 退出登录随主页菜单撤了 (住在更新日志页) —— 这里不许再接不存在的元素:
// 接 null 直接 TypeError, 连后面的 render/首同步全被带崩 (重开应用首页就空了)。
"use strict";
/* global render, loadCategories, syncNow, catTree, setCatColors */

/* ---------- 启动 ---------- */
setCatColors(catTree);          // 缓存树里的自选图标色先灌上 (刷新前也带色)
render();
loadCategories();
syncNow();

// 全应用禁双指缩放 (跟 My Music / My Tesla 一致): body 的 touch-action: pan-y
// 挡得住安卓/桌面, iOS Safari 的捏合缩放不吃 touch-action —— 非标准手势事件
// 掐掉才是 iOS 上的真解
document.addEventListener("gesturestart", (event) => event.preventDefault());

// 子页预热 (1.7.4): 主页一就绪就顺手把设置/统计两页的骨架+样式+脚本
// 取进 HTTP 缓存 —— 都是 ?v= 一年 immutable 的地址, 取过一次往后全是
// 本地命中; 头一回点开也不等网络, 页面即点即画 (数据照旧点开现拉)
for (const warm of [
  "/bookkeeping/settings?v=1", "/bookkeeping/stats?v=1",
  "/bookkeeping/static/bookkeeping-settings.js?v=3",
  "/bookkeeping/static/bookkeeping-stats.js?v=2",
  "/bookkeeping/static/css/bookkeeping-settings.css?v=4",
  "/bookkeeping/static/css/bookkeeping-stats.css?v=5",
  "/static/back-swipe.js?v=2",
]) {
  fetch(warm).catch(() => { });   // 预热失败无妨 (点开时再取就是)
}
