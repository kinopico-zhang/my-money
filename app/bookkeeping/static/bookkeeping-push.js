// bookkeeping-push — 记账页推入层: 设置/统计/类别管理/更新日志从右滑入盖住
// 主页 (1.8.0, 用户点名「从右边弹出, 要有动画, 样式参考 my-music」)。层栈
// 只住内存, 地址全程不动 — 主页在底下原样躺着 (层盖满屏, 主页摸不到也滚
// 不动, 滚动位置天然保住), 右划 (触屏) / 右拖 (键鼠) / Esc / 左上角返回钮
// 收顶层。机制照 my-music 的 music-push-panes.js / music-pane-swipe.js 移植
// (无磨砂件浮在层上, 撤了运动期换实底那一手); 视图渲染函数在各自文件
// (settings/stats/categories), 本文件只管层壳与手势。
// 1.14.0: 右划门槛从 1/3 降到 1/4 — 用户妻子 iPhone 桌面版上右划返回难触
// 发 (起手稍斜就被判成竖滚), 当时配了枚左上角返回圆钮当第二条路。
// 1.15.0: 底部常驻 tab 栏 (明细/报表/设置) 接管层栈 — tab 不另起导航,
// switchTab 直接收栈/推层; 栈顶在哪个 tab, 栏上就亮谁。tab 换场即切
// (平级跳转不放「从右进入」的滑入 — 那是往层级深处走的语义), 滑入滑出
// 留给层级推入 (设置→类别管理) 与回退 (右划/Esc)。tab 根层 (报表/设置)
// 当正经页面: 无右划无 Esc, 切换只走底部 tab 栏。返回圆钮同版退役 —
// 怎么来怎么回去: 子界面统一从右滑入, 回头路统一是全局右划收回。
// 2.0 (批次 1): 底栏换挖财三槽中央 morph [报表|⊕/首页|我的] — 「明细」
// tab 退役 (明细内容批次 3 搬进推入页), 设置视图改名 mine (内容批次 4
// 重排); 中央槽首页态是橘 ⊕ (开记一笔, 接线在 entry-sheet), 其他 tab
// 态 morph 成「首页」跳回 — 栏上 .at-home 翻两副面孔 (CSS 管)。
"use strict";
/* global renderCategoriesView, renderChangelogView, renderSettingsView,
          renderStatsView, renderCatSubsView, renderCatEntriesView,
          renderTagsView, renderCycView */
/* exported closePushStack, pushView */

const pushStack = [];   // [{view, pane}] — 设置→类别管理会叠两层

// 视图 → 所属主 tab (2.0): 类别管理/更新日志/标签/周期账是我的页里再推的
// 层, 高亮归我的; 下钻两层 (大类→小类→明细) 是报表页里再推的层, 高亮归报表
const TAB_OF = { stats: "stats", mine: "mine",
                 categories: "mine", changelog: "mine",
                 tags: "mine", cyc: "mine",
                 "cat-subs": "stats", "cat-entries": "stats" };

/** 按页铺内容 (渲染函数在各视图文件, 全局名字引用 — 加载序上它们都在本文件前)。 */
function renderView(view, target) {
  if (view === "mine") renderSettingsView(target);   // 2.0: mine = 现设置页内容 (批次 4 重排)
  else if (view === "stats") renderStatsView(target);
  else if (view === "categories") renderCategoriesView(target);
  else if (view === "tags") renderTagsView(target);
  else if (view === "cyc") renderCycView(target);
  else if (view === "cat-subs") renderCatSubsView(target);
  else if (view === "cat-entries") renderCatEntriesView(target);
  else renderChangelogView(target);
}

/** 推一层: 骨架先落 DOM (translateX(100%) 藏在右沿外), 下一拍加 .open 放滑入;
    内容随即铺 (数据各自现拉, 页面骨架先弹出 — 「先弹页面再慢慢加载数据」)。
    层级层 (1.15.0 定案): 子界面统一从右滑入, 回头路统一是右划/Esc — 返回
    圆钮全数退役, 怎么来怎么回去; tab 根层 (报表/设置) 当正经页面 — 无手势,
    切换只走底部 tab 栏。instant = tab 换场: snap 关过渡直接落位, 不演滑入。 */
function pushView(view, instant) {
  const top = pushStack[pushStack.length - 1];
  if (top && top.view === view) return;   // 顶层已是它: 再点当没点 (不重开不复位)
  const pane = document.createElement("div");
  pane.className = "push-pane" + (instant ? " snap" : "");
  pane.dataset.view = view;
  const root = TAB_OF[view] === view;   // tab 根层 (报表/设置): 页不是层
  pane.innerHTML = '<div class="pane-scroll"></div>';
  document.getElementById("push-stack").appendChild(pane);
  pushStack.push({ view, pane });
  updateTabs();   // 栈顶换了 tab, 栏上高亮跟着走 (1.15.0)
  if (!root) bindPaneSwipe(pane);   // 层级层: 右划收回 (返回钮已退役)
  if (instant) {                     // tab 换场: 即切落位 (无「从右进入」的方向感)
    pane.classList.add("open");
    pane.classList.remove("snap");   // 落位即摘 — 后续滑出手势/动画照常
  } else {
    void pane.offsetWidth;   // 起点样式落地再放滑入 (rAF 在安静页会饿死, 不用它)
    pane.classList.add("open");
  }
  renderView(view, pane.querySelector(".pane-scroll"));
}

/** 收走的层 420ms 后移除 DOM (滑出动画 .34s 走完)。焦点还在层里先摘 —
    移除聚焦过的元素走在键盘收起动画半路, iOS 会把布局视口冻在没收满的
    矮个上 (my-music 1.8.9 录屏量过的坑), 早摘早稳。 */
function removePaneLater(pane) {
  if (pane.contains(document.activeElement)) document.activeElement.blur();
  setTimeout(() => pane.remove(), 420);
}

/** 收层 (栈里保留 keep 层以下): 滑出 + 到点移除; instant = tab 换场,
    立即隐身不演退场。 */
function closePushStack(keep = 0, instant = false) {
  while (pushStack.length > keep) {
    const item = pushStack.pop();
    if (instant) item.pane.style.display = "none";   // 即切: 不滑出
    else item.pane.classList.remove("open");
    removePaneLater(item.pane);
  }
  updateTabs();   // 收到哪层, 栏上亮到哪 (全收就是亮明细) — 1.15.0
}

/** 栈顶落在哪个主 tab: 空栈是首页, 别的视图按 TAB_OF 归口。 */
function topTab() {
  const top = pushStack[pushStack.length - 1];
  return top ? TAB_OF[top.view] || "mine" : "home";
}

/** 刷新底部 tab 栏 (2.0 三槽中央 morph): 报表/我的亮栈顶所属的 tab;
    栏挂 .at-home = 栈收空回首页, 中央槽亮橘 ⊕ (CSS 翻面孔),
    否则中央槽是「首页」跳回钮。 */
function updateTabs() {
  const cur = topTab();
  const bar = document.getElementById("tab-bar");
  bar.classList.toggle("at-home", cur === "home");
  bar.querySelectorAll("button[data-tab]").forEach(
    b => b.classList.toggle("on", b.dataset.tab === cur));
}

/** 切 tab (1.15.0): tab 不另起导航, 直接驱动层栈 — 明细收整栈回主页;
    目标 tab 的层已在栈里就收到它露头 (上面还压着嵌套层, 如设置里的类别
    管理, 也一并收走; 层壳与滚动位置原样保住); 不在栈里先清场再推新层。
    tab 间是平级跳转, 一律即切 (无滑入滑出); 滑出动画留给层级回退 (收
    嵌套层) 和手势。 */
function switchTab(tab) {
  if (tab === "home") {
    if (pushStack.length) closePushStack(0, true);
    return;
  }
  const idx = pushStack.findIndex(it => TAB_OF[it.view] === tab);
  if (idx < 0) { closePushStack(0, true); pushView(tab, true); return; }
  if (idx !== pushStack.length - 1) closePushStack(idx + 1);   // 顶上还压着层: 收到根层
}

/** 右划返回 (my-music 同款): 面板任意位置起手, 横竖先分家 (竖向交还层内
    滚动); 拖过四分之一或带甩劲松手就收层, 否则弹回 (1.14.0 从 1/3 降到
    1/4 — 手势不好划的手, 更短的行程也能回去; 1.15.0 返回钮退役后这是
    回头唯一的路, 键鼠另有 Esc)。断触根治 (10-17, 两轮): 第一轮触轴链放行
    pan-x + 判横收 45° 一把尺 (与浏览器的轴向锁同一把尺; 10-09 的 63° 边
    缘锥是误诊产物, 见内注); 第二轮补触摸看门 (见下内注) 把右向触摸整个
    认领 — 原生滚动锁彻底出局。甩劲窗 130ms/30px (10-09 放宽, 边缘快抹
    常一口气)。
    行左滑删除 (类别管理) 是往左的, 与这里的右向天然分家; 行的右向橡皮筋
    在 0 处钉死, 拖右归这里。一个地址走全程, 不碰浏览器历史。 */
function bindPaneSwipe(pane) {
  // 触摸看门 (my-music 1.8.18 同款思路, 放宽到全层): 右向坐实 (过 6px,
  // 抢在浏览器自家 slop 之前) 的那个触摸, 接下来的 touchmove 全
  // preventDefault — 光靠指针判定拦不住浏览器的滚动锁: 手稍斜, 底下的
  // 竖向滚动器照样能中途赢下竞速, 一接管就 pointercancel, 层跟到一半弹回
  // (10-17 第二轮「还不够丝滑」的残余病灶)。左向 (行左滑删除)/竖向 (滚
  // 列表)/弹框里 (筛选·日历·图标框, 它们有自己的手势), 看门不掺和
  let guardId = null;       // 看门正盯的触摸; null = 没在看
  let guardStartX = 0, guardStartY = 0;
  let guardRight = false;   // 右向坐实后这个触摸的 touchmove 全掐
  pane.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 ||
        (event.target instanceof Element &&
         event.target.closest("#cat-modal, .bk-sheet"))) { guardId = null; return; }
    guardId = event.touches[0].identifier;
    guardStartX = event.touches[0].clientX;
    guardStartY = event.touches[0].clientY;
    guardRight = false;
  }, { passive: true });
  pane.addEventListener("touchmove", (event) => {
    if (guardId === null) return;
    const touch = [...event.changedTouches].find(
      (item) => item.identifier === guardId);
    if (!touch) return;
    if (guardRight) { event.preventDefault(); return; }   // 右向: 归右划返回
    const dx = touch.clientX - guardStartX;
    const dy = touch.clientY - guardStartY;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    guardRight = dx > 0 && Math.abs(dx) > Math.abs(dy);
    if (guardRight) event.preventDefault();
  }, { passive: false });
  pane.addEventListener("touchend", (event) => {
    if (guardId !== null && [...event.changedTouches].some(
        (item) => item.identifier === guardId)) {
      guardId = null;      // 这场看完, 下一场重新认方向
    }
  });
  pane.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // 弹框 (类别管理的新建框 / 统计的筛选·日历框) 开着: 框上起手的拖动不拖
    // 层 — 旧全局右划的「弹框开着不返回」同款, 框要收点遮罩/取消钮, 别把
    // 整层带跑
    if (event.target instanceof Element &&
        event.target.closest("#cat-modal, .bk-sheet")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    // 判横只认 45° 一档 (10-17 定案, my-music 同款): 10-09 报「边缘右划
    // 不灵光」时把左沿锥放宽到 63° 是误诊 — 根子在触轴链拒掉 pan-x (见
    // CSS 内注), iOS 认出横移就地掐流; 锥放宽只是让手势更早开跟、然后死
    // 得更显眼。锥比浏览器的轴向锁宽, 抢到的斜划终归被判回竖滚 — 双方
    // 同一把 45° 尺才不打架
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
      const flick = ev.timeStamp - lastT < 130 && lastX - startX > 30;   // 甩劲 (2026-10-09 放宽: 边缘快抹常一口气)
      pane.style.transition = "";
      pane.style.transform = "";
      if (dx <= width / 4 && !flick) return;   // 没拖够: 弹回 (.open 的 0)
      pane.classList.remove("open");           // 从当前位置滑出
      const top = pushStack[pushStack.length - 1];
      if (top && top.pane === pane) { pushStack.pop(); updateTabs(); }
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

// 入口接线: data-push 写在哪都认 (设置页里的类别管理/更新日志) — 一枚文档级
// 委托, 层内层外都推层
document.addEventListener("click", (ev) => {
  const btn = ev.target instanceof Element && ev.target.closest("[data-push]");
  if (btn) pushView(btn.dataset.push);
});

// 底部 tab 栏 (1.15.0): 明细/报表/设置三枚主 tab, 点击交给 switchTab 驱动层栈
document.getElementById("tab-bar").addEventListener("click", (ev) => {
  const btn = ev.target instanceof Element && ev.target.closest("button[data-tab]");
  if (btn) switchTab(btn.dataset.tab);
});

// Esc 收顶层 (键鼠路) — 层里的弹框开着时先收框 (框是层里最顶上的东西,
// 与拖动让框同一套礼数); tab 根层 (报表/设置) 不归 Esc 收 — 切换走底部
// tab 栏; 层级层 (类别管理/更新日志) 照旧 Esc 回上层
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || !pushStack.length) return;
  const mask = document.querySelector(
    '#push-stack #cat-modal:not([hidden]) .cm-mask, ' +
    '#push-stack .bk-sheet:not([hidden]) .bs-mask');
  if (mask) { mask.click(); return; }   // 走遮罩那一下 = 弹框自己的收框路
  const top = pushStack[pushStack.length - 1];
  if (TAB_OF[top.view] === top.view) return;   // 根层: 无「收层」一说
  closePushStack(pushStack.length - 1);
});
