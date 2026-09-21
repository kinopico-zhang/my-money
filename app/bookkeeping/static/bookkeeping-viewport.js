// bookkeeping-viewport — 底部黑边防治 (tesla-viewport.js 的瘦身移植,
// 2026-09-21 用户点名: 记账页跟特斯拉一样底部留黑边)。记账页是正常滚动的
// 文档 (不是锁死的固定壳), 特斯拉 ① 的"键盘期间解锁文档"不搬 —— 键盘让位
// 的滚动落在本就合法的文档上; 只搬治黑边的三件套:
//   ② 满高基准: localStorage 跨重启记满高 (转屏重立), 冻矮 = 比满高矮 12px;
//   ③ 冻矮自愈: 冷开时 iOS 的还原高度跨重启赖账, 整程带矮值一声事件不响,
//      页面矮一截底下露黑边 —— 实锤时页高直接钉记档的满高 (--shell-h,
//      bookkeeping-page.css 消费), 黑边当场补回, 回满自动撤;
//   ④ 裸 Safari 的 dvh 赖账: 从切卡/键盘折腾回来, 100dvh 这个单位本身会带
//      旧值不刷新 —— 探针 (一枚 fixed 的 100dvh 标尺, 不吃 --shell-h) 比
//      文档根矮超 120px (工具栏浮动 ≤90 不误伤) 且定住 0.7s → 实锤, 页高
//      钉布局视口真值, 探针回平自动撤。
"use strict";

(() => {
  const vv = window.visualViewport;
  // 苹果触屏 (Safari 与独立模式都算); ②③ 的满高基准只有独立模式立得住
  // (Safari 工具栏自己收放, innerHeight 天生会动), 裸 Safari 走 ④ 探针。
  const appleTouch = () => (/iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const patient = () => window.matchMedia("(display-mode: standalone)").matches
    && appleTouch();
  const landscape = () => window.matchMedia("(orientation: landscape)").matches;
  const typing = () => {               // 键盘开着的唯一可靠信号: 焦点在输入框
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"
      || el.isContentEditable);
  };

  /* ---------- ② 满高基准 (跨重启记档, 转屏重立) ---------- */
  let seenLandscape = landscape();
  let full = window.innerHeight;
  try {
    const saved = JSON.parse(localStorage.getItem("bk.fullInner") || "null");
    if (saved && saved.landscape === seenLandscape) full = Math.max(full, saved.height || 0);
  } catch (_error) { /* 隐私模式读不了就只信开局值 */ }
  function noteFull() {
    if (window.innerHeight <= full) return;
    full = window.innerHeight;
    try {
      localStorage.setItem("bk.fullInner",
        JSON.stringify({ height: full, landscape: seenLandscape }));
    } catch (_error) { /* 存不进就算了, 内存里那份还在 */ }
  }
  const sick = () => full - window.innerHeight > 12;   // 冻矮: 比满高矮一截

  /* ---------- ③ 冻矮自愈: 页高别信 webview 的还原高度 ----------
     满高钳在屏内 (竖屏取长边/横屏取短边): 防基线本身被瞬时值带高,
     补偿铺出屏外反而截掉底部内容。 */
  const capOf = () => landscape() ? Math.min(screen.width, screen.height)
                                  : Math.max(screen.width, screen.height);
  function shellH(on, px) {   // 冻矮: 页高钉真满高 (bookkeeping-page.css 消费)
    const root = document.documentElement;
    if (on) root.style.setProperty(
      "--shell-h", Math.min(px != null ? px : full, capOf()) + "px");
    else root.style.removeProperty("--shell-h");
  }

  /* ---------- ④ 裸 Safari 的 dvh 赖账: 探针对账 ----------
     探针 = fixed 的一根 100dvh 标尺 (不吃 --shell-h, 钉了高也照样量真
     dvh)。文档根 (html) 的 clientHeight = 布局视口, 是"应然"; 探针是 dvh 的
     "实然"。两者差超 120px 且定住 0.7s → dvh 在赖旧账, 页高钉布局视口真值;
     探针回平 (差 ≤12) 自动撤。钉着期间探针依旧量真 dvh, 好没好一目了然。 */
  let lieProbe = null, lieTimer = 0, lieSnap = -1, lieDeclared = false;
  function probeDvh() {
    if (!lieProbe) {
      lieProbe = document.createElement("div");
      lieProbe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:100dvh;" +
        "visibility:hidden;pointer-events:none;";
      document.body.appendChild(lieProbe);
    }
    return lieProbe.getBoundingClientRect().height;
  }
  function dvhLie() {
    if (document.hidden || typing()) {          // 键盘期矮是应该的
      lieSnap = -1;
      clearTimeout(lieTimer);
      return;
    }
    const gap = document.documentElement.clientHeight - probeDvh();
    if (gap <= 12) {                            // 探针回平: 赖账好了 (或从没病)
      lieSnap = -1;
      lieDeclared = false;
      clearTimeout(lieTimer);
      shellH(false);
      return;
    }
    if (lieDeclared || gap < 120 || lieSnap === gap) return;   // 已钉/浮动不当病/值没定住
    lieSnap = gap;
    clearTimeout(lieTimer);
    lieTimer = setTimeout(() => {
      lieSnap = -1;
      if (document.hidden || typing()) return;
      const root = document.documentElement;
      if (root.clientHeight - probeDvh() < 120) return;
      lieDeclared = true;
      shellH(true, root.clientHeight);   // 自愈: 页高按布局视口钉真值
    }, 700);
  }

  let freezeTimer = 0, freezeSnap = -1;
  let declared = false;                // 实锤一次就闩住, 回满才解 (别刷屏)
  function check() {
    if (!appleTouch()) return;
    if (!patient()) { dvhLie(); return; }   // 裸 Safari: ④ 探针对账
    const nowLandscape = landscape();
    if (nowLandscape !== seenLandscape) {
      seenLandscape = nowLandscape;
      full = window.innerHeight;       // 转屏: 满高按新方向重立
    }
    noteFull();
    if (window.innerHeight >= full - 12) {   // 健在 (真回满): 清账撤补偿
      freezeSnap = -1;
      declared = false;
      clearTimeout(freezeTimer);
      shellH(false);                   // 冻矮补偿撤掉 (页高回真 100dvh)
      return;
    }
    if (typing()) {                          // 键盘还开着: 矮是应该的
      freezeSnap = -1;
      clearTimeout(freezeTimer);
      return;
    }
    if (declared) return;
    if (freezeSnap !== window.innerHeight) { // 值定住 0.7s 才算实锤
      freezeSnap = window.innerHeight;
      clearTimeout(freezeTimer);
      freezeTimer = setTimeout(() => {
        freezeSnap = -1;
        if (!patient() || typing() || !sick()) return;
        declared = true;
        shellH(true);   // 自愈: 页高钉真满高, 冷开冻矮当场补 (不用用户动手)
      }, 700);
    }
  }
  if (vv) {
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
  }
  document.addEventListener("focusout", () => {
    setTimeout(check, 350);
    setTimeout(check, 900);
    setTimeout(check, 1800);
  });
  addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  setInterval(check, 1500);   // 冻矮后一声事件不响: 慢心跳兜底
  check();
})();
