// bookkeeping-ledger — 明细推入层 + 账单日历 (2.0 挖财批次 3): 账目瀑布流
// 整体从主页搬进层里 (数据还是 render.js 的 feedGroups/feedMonths — render()
// 每趟发 "bk-render", 层开着跟着重铺, 滚动位置保住); 懒加载窗口从双向收成
// 单向 — 层从最新的日组起头往下滚, 只往下展开 (往回看靠层内重排, 主页那套
// 上补窗口/跳位滑屏机器跟着胶囊一起退役)。
// 挖财账单明细版式: 顶部分段 chips [全部|年|月] (切统计口径, 年/月配 ‹ ›
// 步进器, 步数只往过去存) + 三统计块 (结余/支出(N)·笔数在标签里/收入(M) —
// 实测挖财各数各的, 不合笔) + 跨月处月汇总卡 (收/结余/支三值) + 日组头
// (收x 支y 恒两值) + 账目行 (左滑删除/点行改账 — 行机器是 entry-sheet 的
// bindEntryList); 金额不带 ¥ 尾数给足两位 (全应用统一口径 — 封面/月头同裸数);
// 层自带底栏 [日历|记一笔] (主 tab 栏让位 — push.js 的 own-bar 规矩: 栏在
// 69 压在层上, 不藏会两副底栏叠着; 从明细进的账单日历也不吃主栏的垫底 —
// pane 上挂 data-from=ledger)。
// 账单日历 (bill-cal): 月头 ‹ › 翻月 (挖财首页月头点开的就是它) + 大日历
// (点日 = 记一笔预填该日) + 底部 总结余/日均结余 (本月按已过天数摊)。
// 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局。
"use strict";
/* global esc, WEEK, pad, todayStr, curMonth, catIcon, creatorName,
          loadLS, saveLS, feedGroups, feedMonths, pushView, openSheet,
          bindEntryList */
/* exported renderLedgerView, renderBillCalView */

const LG_CHUNK = 12;          // 一次往下展开的日组数 (懒加载步长, 原 FEED_CHUNK)

// ‹ › 画成 SVG 线段箭头: 字形的 ‹ 在自己的字形框里光学偏心, 跟旁边的文字
// 对不齐; 线段箭头几何居中, 中线真正对上 (原主页日历头同一副考量)
const LG_CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M15 5.5L9 12L15 18.5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LG_CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 5.5L15 12L9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function monthAdd(mon, delta) {   // 月头步进: mon 往前/往后 delta 个月
  const [y, m] = mon.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function lgAmt(n) {               // 明细/日历金额口径 (挖财账单明细): 不带 ¥,
                                  // 尾数给足两位; 上百万缩 x.xx万 — 实测挖财的
                                  // 分界 (结余 -462855.46 全显 / 支出 184.16万)
  if (Math.abs(n) >= 1e6) return `${(n / 10000).toFixed(2).replace(/\.?0+$/, "")}万`;
  return n.toFixed(2);
}

let liveLedger = null;         // 开着的明细层 (bk-render 跟着重铺; 层拆了置空)
let liveBillCal = null;        // 开着的账单日历层 (同上 — 栈里最多各一)

document.addEventListener("bk-render", () => {   // render() 每趟发: 记一笔/删/
  for (const live of [liveLedger, liveBillCal]) {  // 同步落账后开着的层跟着新
    if (!live) continue;
    if (!live.pane.isConnected) { live.cleanup(); continue; }   // 层拆了 (关层动画放完)
    live.refresh();
  }
});

// ---------- 明细层 ----------
function renderLedgerView(target) {   // target = .pane-scroll (层里的滚动本体)
  const pane = target.parentElement;
  const q = s => target.querySelector(s);
  let st = { mode: "all", shift: 0 };   // 口径: all 全部年份 / year 按年 / month
  const saved = loadLS("bk-ledger-v1", null);   // 按月; shift = 离当前段几步 (只往
  if (saved && typeof saved === "object") {     // 过去存, 0 = 当前年/月)
    if (saved.mode === "year" || saved.mode === "month") st.mode = saved.mode;
    st.shift = Math.max(0, Number(saved.shift) || 0);
  }
  const save = () => saveLS("bk-ledger-v1", st);
  let groups = [];       // 当前口径下的日组 (refresh 重算)
  let drawn = 0;         // 已画的日组数 (单向窗口: 从最新的组往下画)

  target.innerHTML =
    '<div class="lg-tools">' +
      '<div class="lg-chips" role="group" aria-label="统计口径">' +
        '<button type="button" data-mode="all">全部</button>' +
        '<button type="button" data-mode="year">年</button>' +
        '<button type="button" data-mode="month">月</button>' +
      '</div>' +
      '<div class="month-nav lg-step" hidden>' +
        `<button type="button" class="lg-prev" aria-label="上一段">${LG_CHEV_L}</button>` +
        '<span class="m-title lg-title"></span>' +
        `<button type="button" class="lg-next" aria-label="下一段">${LG_CHEV_R}</button>` +
      '</div>' +
    '</div>' +
    '<div class="lg-stats"></div>' +
    '<div class="lg-list"></div>' +
    '<div class="lg-more"></div>' +
    '<div class="lg-empty" hidden>还没有账目</div>' +
    '<div class="lg-end" hidden></div>';
  const listEl = q(".lg-list");
  bindEntryList(listEl);   // 行机器 (左滑删除/点行改账) — entry-sheet 的全局

  // 层自带底栏 [日历|记一笔] (几何贴 #tab-bar: --tab-h 高, 内容居中钉底)
  const bar = document.createElement("div");
  bar.className = "lg-bar";
  bar.innerHTML =
    '<button type="button" data-act="cal">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" ' +
    'stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" ' +
    'width="16" height="14.5" rx="2.5"/><path d="M8 3.5v3.5M16 3.5v3.5M4 10.5h16"/>' +
    '<path d="M8.5 14.5h2M13.5 14.5h2M8.5 17.5h2"/></g></svg><span>日历</span></button>' +
    '<button type="button" data-act="add">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" ' +
    'stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/>' +
    '<path d="M12 8.2v7.6M8.2 12h7.6"/></g></svg><span>记一笔</span></button>';
  pane.appendChild(bar);
  bar.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "cal") {     // 从明细进账单日历: 不吃主栏的垫底
      const bcPane = pushView("bill-cal");
      if (bcPane) bcPane.dataset.from = "ledger";
    } else {
      openSheet(null);
    }
  });

  function rangeOf() {          // 口径 → [from, to] (含两端); all 不筛 (整本账)
    const now = new Date();
    if (st.mode === "year") {
      const y = now.getFullYear() - st.shift;
      return [`${y}-01-01`, `${y}-12-31`];
    }
    const base = new Date(now.getFullYear(), now.getMonth() - st.shift, 1);
    const [y, m] = [base.getFullYear(), base.getMonth() + 1];
    return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`];
  }

  function stepTitle() {
    const now = new Date();
    if (st.mode === "year") return `${now.getFullYear() - st.shift}年`;
    const d = new Date(now.getFullYear(), now.getMonth() - st.shift, 1);
    return `${d.getFullYear()}/${d.getMonth() + 1}`;   // 月档简写 (报表同款斜杠)
  }

  function dayGroupHtml(i) {    // 日组 (跨月处先垫一张月汇总卡 — 月档整层就
                                // 一个月, 不垫): 日组头收·支恒两值都报 (挖财
                                // 明细头, 零也报 — 收0.00 支469.38 实测)
    const [date, items] = groups[i];
    const [y, m, d] = date.split("-");
    const wd = WEEK[new Date(+y, +m - 1, +d).getDay()];
    let monCard = "";
    if (st.mode !== "month") {
      const mon = date.slice(0, 7);
      const prev = i > 0 ? groups[i - 1][0].slice(0, 7) : "";
      if (mon !== prev) {
        const t = feedMonths.get(mon) || { expense: 0, income: 0 };
        const bal = t.income - t.expense;
        // 月卡三值: 收 / 结余 (带号不带名) / 支 — 挖财月汇总卡同款
        monCard = `<div class="lg-mon"><b>${+mon.slice(5, 7)}月</b><span class="yr">${+mon.slice(0, 4)}</span>` +
          `<span class="sums"><span class="i">收 ${lgAmt(t.income)}</span>` +
          `<span class="${bal < 0 ? "e" : "i"}">${bal < 0 ? "-" : ""}${lgAmt(Math.abs(bal))}</span>` +
          `<span class="e">支 ${lgAmt(t.expense)}</span></span></div>`;
      }
    }
    const dayOut = items.filter(e => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
    const dayIn = items.filter(e => e.kind === "income").reduce((s, e) => s + e.amount, 0);
    return monCard + `<div class="day-group" data-date="${date}">` +
      `<div class="day-head"><span>${+m}/${+d} 周${wd}</span>` +
      `<span>收${lgAmt(dayIn)} 支${lgAmt(dayOut)}</span></div>` +
      `<div class="entries">` +
      items.map(e => {
        // 两行 (每笔同高): 类别 + 备注/标签跟着排 (灰字小一号, 没写不占字) /
        // 几点记的 · 谁记的; 行身 (.sw-body) 单独一层: 左滑删除时整层挪,
        // 身后右侧垫着删除钮 (手势在 bindEntryList)
        const small = e.category ? e.category.split("/").pop() : "";
        const bits = [];
        if (e.note) bits.push(esc(e.note));
        for (const t of e.tags || []) bits.push("#" + esc(t));
        return `<div class="entry" data-id="${esc(e.id)}">` +
        `<button type="button" class="sw-del">删除</button>` +
        `<div class="sw-body">` +
        `<div class="cat-dot">${catIcon(e.category, e.kind)}</div>` +
        `<div class="mid">` +
        `<div class="l1">${esc(small || "未分类")}${bits.length ? ` <span class="sub">${bits.join(" ")}</span>` : ""}</div>` +
        `<div class="l2">${e.time ? e.time + " · " : ""}${esc(creatorName(e))}</div>` +
        `</div>` +
        `<div class="amt${e.kind === "income" ? " in" : ""}">${e.kind === "income" ? "+" : "-"}${Number(e.amount).toFixed(2)}</div>` +
        `</div></div>`; }).join("") +
      `</div></div>`;
  }

  function drawMore() {         // 往下再展开一段 (哨兵进视野/首屏没填满都会走到这)
    if (drawn >= groups.length) return;
    const html = [];
    const end = Math.min(drawn + LG_CHUNK, groups.length);
    for (let i = drawn; i < end; i++) html.push(dayGroupHtml(i));
    drawn = end;
    listEl.insertAdjacentHTML("beforeend", html.join(""));
    const more = drawn < groups.length;
    q(".lg-more").hidden = !more;
    q(".lg-end").hidden = more;
    if (!more) {                // 到底了: 报个最早的月份
      const first = groups[groups.length - 1][0];
      q(".lg-end").textContent =
        `到底了 · 最早记到 ${+first.slice(0, 4)}年${+first.slice(5, 7)}月`;
    } else if (q(".lg-more").getBoundingClientRect().top <
               target.getBoundingClientRect().bottom + 120) {
      drawMore();               // 一屏没填满: 接着喂 (观察器只认"进入视口"的边沿)
    }
  }

  function refresh() {          // 重铺 (铺层/切口径/翻档/数据变了都走这)
    const [from, to] = st.mode === "all" ? ["", ""] : rangeOf();
    groups = st.mode === "all" ? feedGroups
      : feedGroups.filter(g => g[0] >= from && g[0] <= to);
    // 三统计块: 结余 = 收-支; 笔数带在标签里各数各的 (支出(N) / 收入(M) —
    // 挖财明细页实测口径: 支出(1819) 收入(86), 不合笔)
    let exp = 0, inc = 0, nExp = 0, nInc = 0;
    for (const [, items] of groups)
      for (const e of items) {
        if (e.kind === "income") { inc += e.amount; nInc++; }
        else { exp += e.amount; nExp++; }
      }
    const bal = inc - exp;
    q(".lg-stats").innerHTML =
      `<div class="lg-st"><i>结余</i>` +
      `<b class="${bal < 0 ? "e" : "i"}">${bal < 0 ? "-" : ""}${lgAmt(Math.abs(bal))}</b></div>` +
      `<div class="lg-st"><i>支出(${nExp})</i><b class="e">${lgAmt(exp)}</b></div>` +
      `<div class="lg-st"><i>收入(${nInc})</i><b class="i">${lgAmt(inc)}</b></div>`;
    target.querySelectorAll(".lg-chips button").forEach(
      b => b.classList.toggle("on", b.dataset.mode === st.mode));
    q(".lg-step").hidden = st.mode === "all";   // 全部档没有段可步进
    if (st.mode !== "all") {
      q(".lg-title").textContent = stepTitle();
      q(".lg-next").disabled = st.shift <= 0;   // 步数只往过去存 (报表同规矩)
    }
    drawn = 0;
    listEl.innerHTML = "";
    q(".lg-empty").hidden = groups.length > 0;
    drawMore();
  }

  q(".lg-chips").addEventListener("click", e => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn || btn.dataset.mode === st.mode) return;
    st.mode = btn.dataset.mode;
    st.shift = 0;               // 换口径从头数
    save();
    refresh();
    target.scrollTop = 0;       // 换了口径从头看 (数据刷新才保滚位)
  });
  q(".lg-step").addEventListener("click", e => {
    const nav = e.target.closest("button");
    if (!nav) return;
    const next = st.shift + (nav.classList.contains("lg-prev") ? 1 : -1);
    if (next < 0) return;       // › 到当前段为止
    st.shift = next;
    save();
    refresh();
    target.scrollTop = 0;
  });
  // 懒加载哨兵: root 钉在层的滚动本体上 (观察的是层内滚位, 不是页面)
  new IntersectionObserver(es => {
    if (es[0].isIntersecting) drawMore();
  }, { root: target, rootMargin: "900px" }).observe(q(".lg-more"));

  refresh();
  liveLedger = {                // render() 发 bk-render 时跟着重铺 (滚位保住)
    pane,
    refresh: () => {
      const y = target.scrollTop;
      refresh();
      target.scrollTop = y;
    },
    cleanup: () => { liveLedger = null; }
  };
}

// ---------- 账单日历层 ----------
function renderBillCalView(target) {
  let mon = curMonth();         // 看着的月 (开页回本月, ‹ › 翻; 不存本地)

  target.innerHTML =
    '<div class="month-nav bc-head">' +
      `<button type="button" class="bc-prev" aria-label="上月">${LG_CHEV_L}</button>` +
      '<span class="m-title bc-title"></span>' +
      `<button type="button" class="bc-next" aria-label="下月">${LG_CHEV_R}</button>` +
    '</div>' +
    `<div class="bc-week">${WEEK.map(w => `<span>${w}</span>`).join("")}</div>` +
    '<div class="bc-grid"></div>' +
    '<div class="bc-foot"></div>';
  const grid = target.querySelector(".bc-grid");

  function gridHtml() {         // 大日历 (挖财 67×77 格): 日期 + 支/收两行,
                                // 点日 = 记一笔预填该日; 尾部补下月灰字补足 42 格
                                // (恒高 — 翻月时格子数不变层不跳)
    const [y, m] = mon.split("-").map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    const per = new Map();
    for (const [date, items] of feedGroups) {
      if (!date.startsWith(mon)) continue;
      let exp = 0, inc = 0;
      for (const e of items) {
        if (e.kind === "income") inc += e.amount; else exp += e.amount;
      }
      per.set(date, { exp, inc });
    }
    const today = todayStr();
    let html = "";
    for (let i = 0; i < first; i++) html += '<div class="bc-day blank"></div>';
    for (let d = 1; d <= days; d++) {
      const date = `${mon}-${pad(d)}`;
      const s = per.get(date);
      // 三个槽位常驻 (没数也占行 — 主页日历同款, 整列对得齐); 金额给足位数
      // (挖财大格装得下, 不学主页格子的千/万缩写)
      html += `<button type="button" class="bc-day${date === today ? " today" : ""}" data-date="${date}">` +
        `<span class="d">${d}</span>` +
        `<span class="e">${s && s.exp > 0 ? s.exp.toFixed(2) : ""}</span>` +
        `<span class="i">${s && s.inc > 0 ? "+" + s.inc.toFixed(2) : ""}</span></button>`;
    }
    for (let d = 1; d <= 42 - first - days; d++)
      html += `<div class="bc-day after"><span class="d">${d}</span></div>`;
    return html;
  }

  function refresh(dir) {       // dir = 翻月方向 (网格顺着滑入, 主页日历同款
                                // 方向约定), 0 = 初铺/数据刷新不演
    const [y, m] = mon.split("-").map(Number);
    target.querySelector(".bc-title").textContent = `${y}年${m}月`;
    grid.innerHTML = gridHtml();
    const t = feedMonths.get(mon) || { expense: 0, income: 0 };
    const bal = t.income - t.expense;
    // 日均结余: 本月按已过天数摊, 往月按整月摊 (没过完的月整摊会把均值压虚低)
    const elapsed = mon === curMonth() ? new Date().getDate() : new Date(y, m, 0).getDate();
    const avg = bal / elapsed;
    const cls = v => (v < 0 ? "e" : "i");
    target.querySelector(".bc-foot").innerHTML =
      `<div><i>总结余</i><b class="${cls(bal)}">${bal < 0 ? "-" : ""}${lgAmt(Math.abs(bal))}</b></div>` +
      `<div><i>日均结余</i><b class="${cls(avg)}">${avg < 0 ? "-" : ""}${lgAmt(Math.abs(avg))}</b></div>`;
    if (dir) {
      grid.classList.remove("cal-l", "cal-r");
      void grid.offsetWidth;    // 重放式 class + reflow (连点几下每趟都演)
      grid.classList.add(dir > 0 ? "cal-r" : "cal-l");
    }
  }

  grid.addEventListener("click", e => {
    const btn = e.target.closest("button[data-date]");
    if (btn) openSheet(null, btn.dataset.date);   // 点日 = 记一笔预填该日 (与主页同一入口)
  });
  target.querySelector(".bc-head").addEventListener("click", e => {
    const nav = e.target.closest("button");
    if (!nav) return;
    const delta = nav.classList.contains("bc-prev") ? -1 : 1;
    mon = monthAdd(mon, delta);
    refresh(delta);
  });

  refresh(0);
  liveBillCal = {               // 数据变了 (记一笔/删/同步) 网格和结余跟着新
    pane: target.parentElement,
    refresh: () => refresh(0),
    cleanup: () => { liveBillCal = null; }
  };
}
