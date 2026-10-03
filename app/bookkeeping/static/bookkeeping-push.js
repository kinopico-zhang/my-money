// bookkeeping-push — 记账页推入层: 设置/统计/类别管理/更新日志从右滑入盖住
// 主页 (1.8.0, 用户点名「从右边弹出, 要有动画, 样式参考 my-music」)。层栈
// 只住内存, 地址全程不动 — 主页在底下原样躺着 (层盖满屏, 主页摸不到也滚
// 不动, 滚动位置天然保住), 右划 (触屏) / 右拖 (键鼠) / Esc 收顶层。
// 机制照 my-music 的 music-push-panes.js / music-pane-swipe.js 移植 (无磨砂
// 件浮在层上, 撤了运动期换实底那一手); 视图渲染函数在各自文件
// (settings/stats/categories), 本文件只管层壳与手势。
"use strict";
/* global renderCategoriesView, renderChangelogView, renderSettingsView,
          renderStatsView */
/* exported closePushStack, pushView */

const pushStack = [];   // [{view, pane}] — 设置→类别管理会叠两层

/** 按页铺内容 (渲染函数在各视图文件, 全局名字引用 — 加载序上它们都在本文件前)。 */
function renderView(view, target) {
  if (view === "settings") renderSettingsView(target);
  else if (view === "stats") renderStatsView(target);
  else if (view === "categories") renderCategoriesView(target);
  else renderChangelogView(target);
}

/** 推一层: 骨架先落 DOM (translateX(100%) 藏在右沿外), 下一拍加 .open 放滑入;
    内容随即铺 (数据各自现拉, 页面骨架先弹出 — 「先弹页面再慢慢加载数据」)。 */
function pushView(view) {
  const top = pushStack[pushStack.length - 1];
  if (top && top.view === view) return;   // 顶层已是它: 再点当没点 (不重开不复位)
  const pane = document.createElement("div");
  pane.className = "push-pane";
  pane.dataset.view = view;
  pane.innerHTML = '<div class="pane-scroll"></div>';
  document.getElementById("push-stack").appendChild(pane);
  pushStack.push({ view, pane });
  bindPaneSwipe(pane);
  void pane.offsetWidth;   // 起点样式落地再放滑入 (rAF 在安静页会饿死, 不用它)
  pane.classList.add("open");
  renderView(view, pane.querySelector(".pane-scroll"));
}

/** 收走的层 420ms 后移除 DOM (滑出动画 .34s 走完)。焦点还在层里先摘 —
    移除聚焦过的元素走在键盘收起动画半路, iOS 会把布局视口冻在没收满的
    矮个上 (my-music 1.8.9 录屏量过的坑), 早摘早稳。 */
function removePaneLater(pane) {
  if (pane.contains(document.activeElement)) document.activeElement.blur();
  setTimeout(() => pane.remove(), 420);
}

/** 收层 (栈里保留 keep 层以下): 滑出 + 到点移除。 */
function closePushStack(keep = 0) {
  while (pushStack.length > keep) {
    const item = pushStack.pop();
    item.pane.classList.remove("open");
    removePaneLater(item.pane);
  }
}

/** 右划返回 (my-music 同款): 面板任意位置起手, 横竖先分家 (竖向交还层内
    滚动); 拖过三分之一或带甩劲松手就收层, 否则弹回。行左滑删除 (类别管理)
    是往左的, 与这里的右向天然分家; 行的右向橡皮筋在 0 处钉死, 拖右归这里。
    一个地址走全程, 不碰浏览器历史。 */
function bindPaneSwipe(pane) {
  pane.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // 弹框 (类别管理的新建框) 开着: 框上起手的拖动不拖层 — 旧全局右划的
    // 「弹框开着不返回」同款, 框要收点遮罩/取消钮, 别把整层带跑
    if (event.target instanceof Element && event.target.closest("#cat-modal")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let horizontal = false;      // 分家判定的结果: 这一下归不归右划返回
    let decided = false;
    let lastX = startX;
    let lastT = event.timeStamp;
    const signals = new AbortController();   // 拆掉 cleanup ↔ 手柄的互相引用
    const cleanup = () => signals.abort();
    const swallowClick = () => {       // 拖过层的手松开后, 尾随的那下 click 吞掉
      pane.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); },
                            { capture: true, once: true });
    };
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy);
        if (!horizontal) { cleanup(); return; }   // 竖向: 交还滚动
        // 横向坐实这一下就摘焦点 (键盘从拖动第一下就开始收, 与原生手势同脾气)
        if (pane.contains(document.activeElement)) document.activeElement.blur();
        pane.setPointerCapture(ev.pointerId);
        pane.style.transition = "none";   // 拖动跟手, 不吃过渡
      }
      pane.style.transform = `translateX(${Math.max(0, dx)}px)`;
      lastX = ev.clientX;
      lastT = ev.timeStamp;
    };
    const end = (ev) => {
      cleanup();
      if (!horizontal) return;        // 点按/竖向: 不归这里管
      swallowClick();
      const dx = Math.max(0, ev.clientX - startX);
      const width = pane.offsetWidth || 1;
      const flick = ev.timeStamp - lastT < 100 && lastX - startX > 40;   // 甩劲
      pane.style.transition = "";
      pane.style.transform = "";
      if (dx <= width / 3 && !flick) return;   // 没拖够: 弹回 (.open 的 0)
      pane.classList.remove("open");           // 从当前位置滑出
      const top = pushStack[pushStack.length - 1];
      if (top && top.pane === pane) pushStack.pop();
      removePaneLater(pane);
    };
    const cancel = () => {
      cleanup();
      if (horizontal) {              // 浏览器接管 (如层内滚动起跑): 弹回原位
        swallowClick();
        pane.style.transition = "";
        pane.style.transform = "";
      }
    };
    pane.addEventListener("pointermove", move, { signal: signals.signal });
    pane.addEventListener("pointerup", end, { signal: signals.signal });
    pane.addEventListener("pointercancel", cancel, { signal: signals.signal });
  });
}

// 入口接线: data-push 写在哪都认 (主页快捷钮的 统计/设置, 设置页里的
// 类别管理/更新日志) — 一枚文档级委托, 层内层外都推层
document.addEventListener("click", (ev) => {
  const btn = ev.target instanceof Element && ev.target.closest("[data-push]");
  if (btn) pushView(btn.dataset.push);
});

// Esc 收顶层 (键鼠路; 触屏有右划) — 层里的弹框开着时先收框 (框是层里
// 最顶上的东西, 与拖动让框同一套礼数), 层里的弹框跟着层一起收, 不另设层次
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || !pushStack.length) return;
  const mask = document.querySelector(
    '#push-stack #cat-modal:not([hidden]) .cm-mask');
  if (mask) { mask.click(); return; }   // 走遮罩那一下 = 弹框自己的收框路
  closePushStack(pushStack.length - 1);
});
