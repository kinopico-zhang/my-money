// bookkeeping-boot — My Money 开局: 进页渲染/拉类别树/首同步。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
// 退出登录随主页菜单撤了 (住在更新日志页) —— 这里不许再接不存在的元素:
// 接 null 直接 TypeError, 连后面的 render/首同步全被带崩 (重开应用首页就空了)。
"use strict";
/* global render, loadCategories, syncNow */

/* ---------- 启动 ---------- */
render();
loadCategories();
syncNow();

// 全应用禁双指缩放 (跟 My Music / My Tesla 一致): body 的 touch-action: pan-y
// 挡得住安卓/桌面, iOS Safari 的捏合缩放不吃 touch-action —— 非标准手势事件
// 掐掉才是 iOS 上的真解
document.addEventListener("gesturestart", (event) => event.preventDefault());
