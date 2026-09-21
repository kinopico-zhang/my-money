// bookkeeping-render — My Money 渲染: 日历卡 (每天收支, 点日子跳位; 离屏缩成顶上一小条,
// 点小条滚回展开) + 记账人筛选 + 全月份瀑布流 (所有月份排成一条往下滚的长列表:
// 月份头吸顶带当月小计; 滚到哪渲染到哪 — 上下双向懒加载, 日历跳到哪窗口挪到哪,
// 往上滚还能接回前头; 数据没变就不重建, 滚动位置不跳)。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
"use strict";
/* global $, esc, WEEK, entries, person: writable, saveLS, pad, todayStr,
          catIcon, creatorName, fmtMoney, renderSyncStrip, curMonth,
          visibleEntries */
/* exported render */

// ---------- 记账人筛选 ----------
function renderPersons() {
  const names = [...new Set(entries.filter(e => !e.deleted && e.createdByName)
    .map(e => e.createdByName))];
  if (!names.length) {          // 还没同步过: 没有服务端名字, 不显示筛选
    $("#person-row").innerHTML = "";
    return;
  }
  const mk = (label, val) =>
    `<button data-person="${esc(val)}"${person === val ? ' class="on"' : ""}>${esc(label)}</button>`;
  $("#person-row").innerHTML = mk("全部", "") + names.map(n => mk(n, n)).join("");
}

// ---------- 账目瀑布流 ----------
const FEED_CHUNK = 12;          // 一次展开的日组数 (懒加载步长)
let feedGroups = [];            // 当前筛选下的全部日组 [date, entries][]
let feedMonths = new Map();     // "2026-07" → {expense, income} (月头/日历小计)
let feedStart = 0;              // 窗口上沿: 已画的最早一组 (往上补从这往前)
let feedDrawn = 0;              // 窗口下沿: 还没画的下一组 [feedStart, feedDrawn) 已画
let feedSig = "";               // 数据签名: 不变不重建 (滚动位置不跳)

function feedSignature() {
  let newest = "";
  for (const e of entries) if (e.updatedAt > newest) newest = e.updatedAt;
  return `${entries.length}|${person}|${newest}`;
}

function monthHeadHtml(mon) {
  const t = feedMonths.get(mon) || { expense: 0, income: 0 };
  const [y, m] = mon.split("-");
  return `<div class="month-head"><span>${y}年${+m}月</span>` +
    `<span class="msum">支 ${fmtMoney(t.expense)} · 收 ${fmtMoney(t.income)}</span></div>`;
}

function dayGroupHtml(date, items) {
  const [y, m, d] = date.split("-");
  const wd = WEEK[new Date(+y, +m - 1, +d).getDay()];
  const dayOut = items.filter(e => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
  return `<div class="day-group" data-date="${date}">` +
    `<div class="day-head"><span>${+m}月${+d}日 周${wd}</span>` +
    `<span>${dayOut > 0 ? "支出 " + fmtMoney(dayOut) : ""}</span></div>` +
    `<div class="entries">` +
    items.map(e => {
      // 三层: 最小类别 / 备注+标签 (没写不占行) / 几点记的 · 谁记的
      const small = e.category ? e.category.split("/").pop() : "";
      const bits = [];
      if (e.note) bits.push(esc(e.note));
      for (const t of e.tags || []) bits.push("#" + esc(t));
      return `<div class="entry" data-id="${esc(e.id)}">` +
      `<div class="cat-dot">${catIcon(e.category)}</div>` +
      `<div class="mid">` +
      `<div class="l1">${esc(small || "未分类")}</div>` +
      (bits.length ? `<div class="l2">${bits.join(" ")}</div>` : "") +
      `<div class="l3">${e.time ? e.time + " · " : ""}${esc(creatorName(e))}</div>` +
      `</div>` +
      `<div class="amt${e.kind === "income" ? " in" : ""}">${e.kind === "income" ? "+" : "-"}${Number(e.amount).toFixed(2)}</div>` +
      `</div>`; }).join("") +
    `</div></div>`;
}

function drawMore() {           // 往下再展开一段 (观察器进视口/首屏没填满都会走到这)
  if (feedDrawn >= feedGroups.length) return;
  const html = [];
  const end = Math.min(feedDrawn + FEED_CHUNK, feedGroups.length);
  let lastMonth = feedDrawn > 0 ? feedGroups[feedDrawn - 1][0].slice(0, 7) : "";
  for (let i = feedDrawn; i < end; i++) {
    const [date, items] = feedGroups[i];
    const mon = date.slice(0, 7);
    if (mon !== lastMonth) { html.push(monthHeadHtml(mon)); lastMonth = mon; }
    html.push(dayGroupHtml(date, items));
  }
  feedDrawn = end;
  $("#entry-list").insertAdjacentHTML("beforeend", html.join(""));
  const more = feedDrawn < feedGroups.length;
  $("#feed-more").hidden = !more;
  $("#feed-end").hidden = more;
  if (!more) {                  // 到底了: 报个最早的月份
    const first = feedGroups[feedGroups.length - 1][0];
    $("#feed-end").textContent =
      `到底了 · 最早记到 ${+first.slice(0, 4)}年${+first.slice(5, 7)}月`;
  } else if ($("#feed-more").getBoundingClientRect().top < innerHeight + 120) {
    drawMore();                 // 一屏没填满: 接着喂 (观察器只认"进入视口"的边沿)
  }
}

function drawLess() {           // 往上补一段 (日历跳过来/滚到顶: 窗口上沿之上还有)
  if (feedStart <= 0) return;
  const begin = Math.max(feedStart - FEED_CHUNK, 0);
  const html = [];
  let lastMonth = begin > 0 ? feedGroups[begin - 1][0].slice(0, 7) : "";
  for (let i = begin; i < feedStart; i++) {
    const [date, items] = feedGroups[i];
    const mon = date.slice(0, 7);
    if (mon !== lastMonth) { html.push(monthHeadHtml(mon)); lastMonth = mon; }
    html.push(dayGroupHtml(date, items));
  }
  feedStart = begin;
  $("#feed-top").hidden = begin <= 0;
  const doc = document.documentElement;
  const h0 = doc.scrollHeight;
  $("#entry-list").insertAdjacentHTML("afterbegin", html.join(""));
  const grew = doc.scrollHeight - h0;
  if (grew > 0) window.scrollBy(0, grew);      // 内容往上加了, 视线钉在原来看的那行
  if (feedStart > 0 && $("#feed-top").getBoundingClientRect().bottom > 0) drawLess();
}

function buildFeed() {
  const list = visibleEntries(entries, person)
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
  feedMonths = new Map();      // 月度小计: 顺着组一遍算出来 (月头和日历共用)
  for (const [date, items] of feedGroups) {
    const mon = date.slice(0, 7);
    const t = feedMonths.get(mon) || { expense: 0, income: 0 };
    for (const e of items) {
      if (e.kind === "income") t.income += e.amount;
      else t.expense += e.amount;
    }
    feedMonths.set(mon, t);
  }
  feedStart = 0;
  feedDrawn = 0;
  $("#feed-top").hidden = true;
  $("#entry-list").innerHTML = "";
  $("#list-empty").hidden = feedGroups.length > 0;
  drawMore();
}

function jumpToDate(date) {     // 日历点日子: 窗口挪到那天 (没账落到最近的有账日)
  const idx = feedGroups.findIndex(g => g[0] <= date);
  if (idx < 0) return;
  if (idx < feedStart || idx >= feedDrawn) {
    feedStart = idx; feedDrawn = idx;          // 窗口从那天起往下画
    $("#feed-top").hidden = idx <= 0;
    $("#entry-list").innerHTML = "";
    drawMore();
  }
  const el = document.querySelector(`.day-group[data-date="${feedGroups[idx][0]}"]`);
  if (!el) return;
  const head = el.previousElementSibling;      // 让开吸顶的月份头 (有的话)
  window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY -
    (head && head.classList.contains("month-head") ? head.offsetHeight : 10)));
}

function render() {
  const sig = feedSignature();  // 数据/筛选没变: 只刷日历和状态, 列表不动 (滚动不跳)
  if (sig !== feedSig) { feedSig = sig; buildFeed(); }
  renderCalendar();
  renderPersons();
  renderSyncStrip();
}

// ---------- 日历 (主页顶: 每天收支, 点日子跳瀑布流) ----------
let calMon = curMonth();        // 日历看着的月份 (不存本地, 开页回本月)

function calAmt(n) {            // 格子里的紧凑金额: 上万缩成 1.2万, 否则至多一位小数
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return String(Math.round(n * 10) / 10);
}

function renderCalendar() {
  const [y, m] = calMon.split("-").map(Number);
  const t = feedMonths.get(calMon) || { expense: 0, income: 0 };
  $("#cal-title").innerHTML = `${y}年${m}月` +
    `<span class="msum">支 ${fmtMoney(t.expense)} · 收 ${fmtMoney(t.income)}</span>`;
  $("#cal-bar").innerHTML = `${y}年${m}月` +     // 离屏小条: 月份 + 整月收支 (与日历同源)
    `<span class="msum">支 ${fmtMoney(t.expense)} · 收 ${fmtMoney(t.income)}</span>`;
  const first = new Date(y, m - 1, 1).getDay();          // 1 号是周几
  const days = new Date(y, m, 0).getDate();
  const per = new Map();                                 // 那个月每天 {exp, inc}
  for (const [date, items] of feedGroups) {
    if (!date.startsWith(calMon)) continue;
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
    const date = `${calMon}-${pad(d)}`;
    const s = per.get(date);
    const cls = `cal-day${date === today ? " today" : ""}`;
    // 三个槽位常驻 (没数也占行): 日期/支出/收入各自钉在一条水平线上, 整行对得齐
    const inner = `<span class="d">${d}</span>` +
      `<span class="e">${s && s.exp > 0 ? calAmt(s.exp) : ""}</span>` +
      `<span class="i">${s && s.inc > 0 ? "+" + calAmt(s.inc) : ""}</span>`;
    html += s                                    // 没账的日子不可点 (没有可跳的组)
      ? `<button type="button" class="${cls}" data-date="${date}">${inner}</button>`
      : `<div class="${cls}">${inner}</div>`;
  }
  $("#cal-grid").innerHTML = html;
}

function shiftCal(delta) {
  const [y, m] = calMon.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  calMon = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  renderCalendar();
}

// 滚到底/顶附近就再展开一段 (rootMargin 提前量, 一屏没填满的兜底在 drawMore/Less 里)
new IntersectionObserver(es => {
  if (es[0].isIntersecting) drawMore();
}, { rootMargin: "900px" }).observe($("#feed-more"));
new IntersectionObserver(es => {
  if (es[0].isIntersecting) drawLess();
}, { rootMargin: "700px 0px 0px 0px" }).observe($("#feed-top"));

$("#cal-prev").addEventListener("click", () => shiftCal(-1));
$("#cal-next").addEventListener("click", () => shiftCal(1));
$("#cal-grid").addEventListener("click", e => {
  const btn = e.target.closest("button[data-date]");
  if (btn) jumpToDate(btn.dataset.date);
});
$("#feed-top").addEventListener("click", drawLess);

// 日历滚出屏幕 (进列表/跳到老月份): 顶上钉一条小日历, 点了滚回日历展开
new IntersectionObserver(es => {
  const gone = !es[0].isIntersecting;
  $("#cal-bar").hidden = !gone;
  document.body.classList.toggle("cal-mini", gone);   // 月份头让到小条下面吸顶
}, { }).observe($("#cal-sent"));
$("#cal-bar").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#person-row").addEventListener("click", e => {
  const btn = e.target.closest("button[data-person]");
  if (!btn) return;
  person = btn.dataset.person;
  saveLS("bk-person", person);
  window.scrollTo(0, 0);        // 换了人: 回到最新处看
  render();
});
