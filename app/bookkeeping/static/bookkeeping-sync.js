// bookkeeping-sync — My Money 同步: 状态条 + 上行/增量下行 (LWW 纯逻辑在 bookkeeping-merge.js)
// + 触发点 (进页/联网/回前台/每分钟/记完一笔) + 类别树拉取 (缓存先用, 联网刷新)。
// 拆自 bookkeeping.js (结构化重构: 代码逐字节未动, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
// 1.11.0 同步条改 transient (用户点名不常驻顶端): 平时收在顶沿外, 主页下拉
// 到头的手动同步亮一下报「已同步」即退场; 「已同步」后的时间改客户端本地
// 的钟 (原先打的是服务器钟, 跟手机状态栏对不上) — 游标 lastSync 照旧服务器
// 钟, 两码事 (展示钟 syncedAt / 游标各存各的)。
// 1.11.1 亮条只归下拉 (用户点名「其他同步的提示不要特别明显」): 进页/联网
// 恢复/定时器全静默, 连「同步中…」都不闪; 离线/没连上仍要说 (账存本机得有
// 个交代), 但降为 hush 弱化样式钉在顶沿, 问题解除自己收 — 想看报时下拉。
"use strict";
/* global $, entries: writable, dirty: writable, lastSync: writable,
          catTree: writable, persist, saveLS, loadLS, pad, render, fillChips,
          mergeEntries, entriesToUpload, setCatColors */
/* exported renderSyncStrip, syncNow, scheduleSync, loadCategories */

// ---------- 同步 ----------
let syncing = false;
let syncFailed = false;      // 上次尝试没连上 (没待传的账时会误显"已同步", 要如实说)
let syncShown = false;       // 亮条窗口: 只有下拉手动同步置真 (1.11.1 起唯一通道)
let syncedAt = Number(loadLS("bk-synced-at", "0")) || 0;  // 展示钟: 客户端本地时刻
let stripHideTimer = null;   // 报完「已同步」的退场闸 (2.6 秒后收)

function renderSyncStrip() {
  const strip = $("#sync-strip");
  const text = $("#sync-text");
  strip.classList.remove("pending", "off", "hush");
  const loud = syncShown;    // 亮条窗口 (下拉手动同步): 报进度/报时的唯一通道
  let pin = false;           // 问题态: 条子钉住不退场 (静默期也钉, 但弱化一等)
  if (!navigator.onLine) {
    strip.classList.add("off");
    text.textContent = "离线 · 账存本机, 联网后自动同步";
    pin = true;
  } else if (syncing) {
    text.textContent = "同步中…";
  } else if (syncFailed) {   // 排在待传前: 没连上才是该说的 (待传只是它的后果)
    strip.classList.add("pending");
    text.textContent = "没连上 · 稍后自动重试";
    pin = true;
  } else if (dirty.size > 0) {
    strip.classList.add("pending");
    text.textContent = `${dirty.size} 条待同步`;
  } else {
    const t = syncedAt ? new Date(syncedAt) : null;
    text.textContent = t && !isNaN(t)
      ? `已同步 · ${pad(t.getHours())}:${pad(t.getMinutes())}` : "本地账本";
  }
  if (pin && !loud) strip.classList.add("hush");   // 静默期的问题态: 弱化钉住
  if (pin || (loud && syncing)) {
    clearTimeout(stripHideTimer);            // 问题没解 / 亮着的同步正跑: 不退场
    strip.classList.add("show");
  } else if (loud && strip.classList.contains("show")) {
    clearTimeout(stripHideTimer);            // 报时中换了状态: 退场重排
    stripHideTimer = setTimeout(() => {
      strip.classList.remove("show");
      renderSyncStrip();                     // 退场前再看一眼: 期间出问题就不退
    }, 2600);
  } else {
    // 静默且无麻烦: 收 (问题刚解除也直接收, 不闪「已同步」— 想看报时下拉)
    clearTimeout(stripHideTimer);
    strip.classList.remove("show");
  }
}

async function syncNow(show) {   // show 真值 = 下拉手动同步, 亮条报进度; 其余静默
  if (show) syncShown = true;
  if (syncing || !navigator.onLine) { renderSyncStrip(); return; }
  syncing = true;
  if (syncShown) renderSyncStrip();   // 只有亮条窗口报「同步中…」; 静默重试不动条子
  try {
    const r = await fetch("/bookkeeping/api/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        last_sync: lastSync || null,
        entries: entriesToUpload(entries, [...dirty]),
      }),
    });
    if (r.status === 401) { location.replace("/login"); return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    // EntryOut (snake_case) → 本地条目形状 (camelCase)
    const remote = data.entries.map(e => ({
      id: e.id, date: e.date, time: e.time || "", amount: e.amount, kind: e.kind,
      category: e.category, tags: e.tags || [], note: e.note, deleted: e.deleted,
      updatedAt: e.updated_at,
      createdByName: e.created_by_name, updatedByName: e.updated_by_name,
    }));
    entries = mergeEntries(entries, remote);
    dirty = new Set();        // 服务器收下了, 脏名单清空 (失败不清, 下次重传)
    lastSync = data.server_now;          // 游标: 服务器钟 (增量按它取, 不动)
    syncedAt = Date.now();               // 展示: 客户端钟 (跟手机状态栏一致)
    syncFailed = false;       // 这次连上了
    saveLS("bk-last-sync", lastSync);
    saveLS("bk-synced-at", String(syncedAt));
    persist();
    render();
  } catch (_e) {
    syncFailed = true;        // 没连上/失败: 如实记下, 条子统一在 finally 画
  } finally {
    syncing = false;
    renderSyncStrip();        // 结果落定才画: 静默成功=收, 失败/亮条窗口各自态
    syncShown = false;        // 这轮亮完了, 下轮默认静默
  }
}

let syncTimer = null;
function scheduleSync() {      // 记完一笔不急着打接口, 稍聚一下
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1200);
}

// 触发点: 回到前台 / 每分钟 / 记完一笔 / 主页下拉(亮) — 除下拉外一律静默
addEventListener("online", () => syncNow());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncNow();
});
setInterval(syncNow, 60000);

// 主页下拉刷新 (1.11.0): 拉到头顶出橡皮筋就是手动同步的口 — 过 70px 在拖动中
// 就触发 (拉丝的同时条子滑下来报「同步中…」, 系统橡皮筋就是拉丝反馈, 不另画
// 菊花)。只认主页本体的起手 (main/日历胶囊; 层/弹层/弹框各是各的地盘),
// 页面中途滚到顶的接力不算 (起手那刻 scrollY 已 > 0)。
let pullY = null;
let pullFired = false;
document.addEventListener("touchstart", (e) => {
  pullY = e.target instanceof Element &&
    e.target.closest("main, #cal-bar") && window.scrollY <= 0
    ? e.touches[0].clientY : null;
  pullFired = false;
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (pullY === null || pullFired) return;
  if (e.touches[0].clientY - pullY > 70) { pullFired = true; syncNow(true); }
}, { passive: true });

async function loadCategories() {   // 类别树: 缓存先用, 联网刷新 (离线优先同账目)
  try {
    const r = await fetch("/bookkeeping/api/categories", { cache: "no-store" });
    if (r.status === 401) { location.replace("/login"); return; }
    if (!r.ok) return;
    const tree = await r.json();
    if (tree && Array.isArray(tree.expense) && Array.isArray(tree.income)) {
      catTree = tree;
      saveLS("bk-categories-v2", catTree);
      setCatColors(tree);            // 自选图标色 (设置页挑的) 跟树一起进来
      fillChips();                  // 弹层正开着也立刻换上
    }
  } catch (_e) { /* 离线/失败: 用缓存树 */ }
}
