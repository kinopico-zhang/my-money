// bookkeeping-render — My Money 主页 (2.0 挖财版式): 蓝封面数字 + 快捷行 +
// 日历卡 (恒当前月 — 挖财首页不翻月, 想看别的月走月头进账单日历推入层);
// 点日 = 记一笔预填该日 (快捷记账主入口)。账目瀑布流批次 3 整体搬去了
// 明细推入层 (bookkeeping-ledger.js) — 本文件只留数据半边: feedGroups/
// feedMonths (buildFeed 顺着组一遍算月度小计) 供封面/日历/明细层共用;
// render() 每趟发 "bk-render", 明细/账单日历层开着跟着重铺 (层里自保滚位)。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
"use strict";
/* global $, WEEK, entries, pad, todayStr, curMonth, visibleEntries,
          pushView, openSheet, renderSyncStrip */
/* exported render, feedGroups, feedMonths */

// ---------- 账目数据 (封面/日历/明细层共用) ----------
let feedGroups = [];            // 全部日组 [date, entries][] (日期新→老, buildFeed 排好)
let feedMonths = new Map();     // "2026-07" → {expense, income} (封面/日历月头/明细层月卡)
let feedSig = "";               // 数据签名: 不变不重建

function feedSignature() {
  let newest = "";
  for (const e of entries) if (e.updatedAt > newest) newest = e.updatedAt;
  return `${entries.length}|${newest}`;
}

function buildFeed() {
  const list = visibleEntries(entries)
    .sort((a, b) => {          // 日期新→老, 同日内时刻新→老 (旧账无时刻沉底)
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if ((a.time || "") !== (b.time || ""))
        return (a.time || "") < (b.time || "") ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  const groups = new Map();
  for (const e of list) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  feedGroups = [...groups.entries()];
  feedMonths = new Map();      // 月度小计: 顺着组一遍算出来
  for (const [date, items] of feedGroups) {
    const mon = date.slice(0, 7);
    const t = feedMonths.get(mon) || { expense: 0, income: 0 };
    for (const e of items) {
      if (e.kind === "income") t.income += e.amount;
      else t.expense += e.amount;
    }
    feedMonths.set(mon, t);
  }
}

// ---------- 封面: 本月支出大数字 + 收入/结余 + 月预算条 ----------
// 口径与日历月头/明细层同一份 (feedMonths); 月预算存 localStorage
// bk-budget-v1 (输入口批次 4 落我的页), 没设不亮条
function renderCover() {
  const st = feedMonths.get(curMonth()) || { expense: 0, income: 0 };
  const bal = st.income - st.expense;
  $("#cov-expense").textContent = st.expense.toFixed(2);
  $("#cov-income").textContent = st.income.toFixed(2);
  $("#cov-balance").textContent = (bal < 0 ? "-" : "") + Math.abs(bal).toFixed(2);
  const budget = parseFloat(localStorage.getItem("bk-budget-v1") || "") || 0;
  const box = $("#cov-budget");
  if (budget > 0) {
    box.hidden = false;
    box.classList.toggle("over", st.expense > budget);
    $("#cb-fill").style.width = Math.min(st.expense / budget, 1) * 100 + "%";
    $("#cb-used").textContent = "已用 " + Math.round(st.expense / budget * 100) + "%";
    $("#cb-total").textContent = "月预算 " + budget.toFixed(2);
  } else {
    box.hidden = true;
  }
}

function render() {
  const sig = feedSignature();  // 数据没变: 只刷日历/封面/状态
  if (sig !== feedSig) { feedSig = sig; buildFeed(); }
  renderCalendar();
  renderCover();
  renderSyncStrip();
  // 开着的推入层 (明细/账单日历) 跟着重铺 — 层里自己保滚动位置;
  // CustomEvent 老环境也认
  document.dispatchEvent(new CustomEvent("bk-render"));
}

// ---------- 日历卡 (主页: 恒当前月, 每天收支, 点日 = 记一笔预填该日) ----------
function calAmt(n) {            // 紧凑金额 (格子那块宽度有限, 长数字简写不硬挤):
                                // 上万缩 1.2万, 上千缩 1.2千, 否则至多一位小数
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}千`;
  return String(Math.round(n * 10) / 10);
}

function calTitleHtml() {       // 月头: y年m月 + 整月小计; 整行是按钮 — 挖财
                                // 月头点开账单日历独立页 (‹ › 翻月在那), 小箭头提示可点
  const mon = curMonth();
  const t = feedMonths.get(mon) || { expense: 0, income: 0 };
  const [y, m] = mon.split("-");
  return `${y}年${+m}月` +
    '<svg class="cal-caret" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9 5.5L15 12L9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    `<span class="msum">支 ${t.expense.toFixed(2)} · 收 ${t.income.toFixed(2)}</span>`;
}

function calGridHtml() {        // 月份格 (42 格恒高 — 月初补空 / 月尾接下月灰字)
  const mon = curMonth();
  const [y, m] = mon.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();          // 1 号是周几
  const days = new Date(y, m, 0).getDate();
  const per = new Map();                                 // 那个月每天 {exp, inc}
  for (const [date, items] of feedGroups) {
    if (!date.startsWith(mon)) continue;
    let exp = 0, inc = 0;
    for (const e of items) {
      if (e.kind === "income") inc += e.amount; else exp += e.amount;
    }
    per.set(date, { exp, inc });
  }
  const today = todayStr();
  let html = WEEK.map(w => `<div class="cal-wd">${w}</div>`).join("");
  for (let i = 0; i < first; i++) html += `<div class="cal-day blank"></div>`;
  for (let d = 1; d <= days; d++) {
    const date = `${mon}-${pad(d)}`;
    const s = per.get(date);
    const cls = `cal-day${date === today ? " today" : ""}`;
    // 三个槽位常驻 (没数也占行): 日期/支出/收入各自钉在一条水平线上, 整行对得齐
    const inner = `<span class="d">${d}</span>` +
      `<span class="e">${s && s.exp > 0 ? calAmt(s.exp) : ""}</span>` +
      `<span class="i">${s && s.inc > 0 ? "+" + calAmt(s.inc) : ""}</span>`;
    // 日子个个能点 (没账的日子也能记 — 预填该日)
    html += `<button type="button" class="${cls}" data-date="${date}">${inner}</button>`;
  }
  // 尾部补下月的日子 (灰字, 不可点): 补足六行 42 格 —— 格子数恒定, 日历高度
  // 不跟着月初星期/月长短变来变去
  for (let d = 1; d <= 42 - first - days; d++) html += `<div class="cal-day after"><span class="d">${d}</span></div>`;
  return html;
}

function renderCalendar() {
  $("#cal-title").innerHTML = calTitleHtml();
  $("#cal-grid").innerHTML = calGridHtml();
}

$("#cal-title").addEventListener("click", () => pushView("bill-cal"));
$("#cal-grid").addEventListener("click", e => {
  const btn = e.target.closest("button[data-date]");
  if (btn) openSheet(null, btn.dataset.date);   // 点日 = 记一笔预填该日 (快捷记账主入口)
});
// 快捷行 (2.0): 明细/日历/周期账全走推入层 (账单日历从首页进, 主 tab 栏留着)
$("#quick-row").addEventListener("click", e => {
  const cell = e.target.closest("[data-q]");
  if (!cell) return;
  pushView(cell.dataset.q === "ledger" ? "ledger"
    : cell.dataset.q === "calendar" ? "bill-cal" : "cyc");
});
