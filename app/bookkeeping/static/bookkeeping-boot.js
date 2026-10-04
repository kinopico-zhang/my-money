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
syncNow();         // 首同步静默 (1.11.1: 亮条只归下拉 — 进页不再闪条)

// 全应用禁双指缩放 (跟 My Music / My Tesla 一致): body 的 touch-action: pan-y
// 挡得住安卓/桌面, iOS Safari 的捏合缩放不吃 touch-action —— 非标准手势事件
// 掐掉才是 iOS 上的真解
document.addEventListener("gesturestart", (event) => event.preventDefault());

// 1.7.4 的子页预热 (拉独立子页的 HTML/CSS/JS 进 HTTP 缓存) 随 1.8.0 退役:
// 设置/统计/类别管理/更新日志不再是独立网页, 住进推入层 — 层的骨架与脚本
// 本来就随主页一起装好了, 点开即画, 无物可预热。
