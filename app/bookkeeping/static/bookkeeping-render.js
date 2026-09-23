// bookkeeping-render — My Money 渲染: 日历卡 (每天收支, 点日子跳位 — 没账的
// 日子也点得动, 落到最近的有账日; 升到顶被按住, 跟手收拢成顶上一枚磨砂
// 胶囊 — 胶囊定宽, ‹ › 钉死两端, 实时报着列表滚到哪个月、那月收支多少
// (长数字缩成 1.2千/1.2万), 滚回来一路长回, 点胶囊滚回展开; 胶泡上的
// ‹ › 歇着也能翻月, 胶泡里子新旧两层顺着方向对滑, 日历翻月 (箭头/左右划)
// 明细联动顺着滑到那个月 (不瞬移) — 用户翻的月钉住优先, 滚动探测不抢)
// + 全月份瀑布流 (所有月份排成一条往下滚的长列表; 滚到哪渲染到哪 —
// 上下双向懒加载, 日历跳到哪窗口挪到哪, 往上滚还能接回前头;
// 月份不插横幅: 胶泡一个人报月和整月收支, 日子行的日期自带月份;
// 数据没变就不重建, 滚动位置不跳)。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
"use strict";
/* global $, esc, WEEK, entries, pad, todayStr,
          catIcon, creatorName, fmtMoney, renderSyncStrip, curMonth,
          visibleEntries */
/* exported render */

// ---------- 账目瀑布流 ----------
const FEED_CHUNK = 12;          // 一次展开的日组数 (懒加载步长)
let feedGroups = [];            // 当前筛选下的全部日组 [date, entries][]
let feedMonths = new Map();     // "2026-07" → {expense, income} (日历标题/胶泡小计)
let feedStart = 0;              // 窗口上沿: 已画的最早一组 (往上补从这往前)
let feedDrawn = 0;              // 窗口下沿: 还没画的下一组 [feedStart, feedDrawn) 已画
let feedSig = "";               // 数据签名: 不变不重建 (滚动位置不跳)
let calGlide = null;            // 程序滑屏进行中 (跳位联动, 弹簧阻尼驱动): {to, cur, v,
                                // t0, last, raf} — 途中 drawLess 往上补内容, 视口跟内容
                                // 一起下移, cur/to 整体跟移 (画面不跳, 终点还落在目标上)

function feedSignature() {
  let newest = "";
  for (const e of entries) if (e.updatedAt > newest) newest = e.updatedAt;
  return `${entries.length}|${newest}`;
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
      // 两行 (每笔同高): 类别 + 备注/标签跟着排 (灰字小一号, 没写不占字) /
      // 几点记的 · 谁记的
      const small = e.category ? e.category.split("/").pop() : "";
      const bits = [];
      if (e.note) bits.push(esc(e.note));
      for (const t of e.tags || []) bits.push("#" + esc(t));
      return `<div class="entry" data-id="${esc(e.id)}">` +
      `<div class="cat-dot">${catIcon(e.category)}</div>` +
      `<div class="mid">` +
      `<div class="l1">${esc(small || "未分类")}${bits.length ? ` <span class="sub">${bits.join(" ")}</span>` : ""}</div>` +
      `<div class="l2">${e.time ? e.time + " · " : ""}${esc(creatorName(e))}</div>` +
      `</div>` +
      `<div class="amt${e.kind === "income" ? " in" : ""}">${e.kind === "income" ? "+" : "-"}${Number(e.amount).toFixed(2)}</div>` +
      `</div>`; }).join("") +
    `</div></div>`;
}

function drawMore() {           // 往下再展开一段 (观察器进视口/首屏没填满都会走到这)
  if (feedDrawn >= feedGroups.length) return;
  const html = [];
  const end = Math.min(feedDrawn + FEED_CHUNK, feedGroups.length);
  for (let i = feedDrawn; i < end; i++) {
    const [date, items] = feedGroups[i];
    html.push(dayGroupHtml(date, items));     // 月份不插横幅: 胶泡报月, 日子行自带月份
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
  for (let i = begin; i < feedStart; i++) {
    const [date, items] = feedGroups[i];
    html.push(dayGroupHtml(date, items));
  }
  feedStart = begin;
  $("#feed-top").hidden = begin <= 0;
  const doc = document.documentElement;
  const h0 = doc.scrollHeight;
  $("#entry-list").insertAdjacentHTML("afterbegin", html.join(""));
  const grew = doc.scrollHeight - h0;
  if (grew > 0) {
    window.scrollBy(0, grew);         // 内容往上加了: 视口跟着下移, 视线钉在原来看的那行
    if (calGlide) {                   // 滑屏途中: 滑的坐标系整体跟移 (cur/to 都挪), 终点仍
      calGlide.cur += grew;           // 落在目标日组上, 画面一根线不跳 — 光挪 to 不挪 cur,
      calGlide.to += grew;            // 下一帧公式会把这步 scrollBy 顶回去, 落点差一截
    }
  }
  if (!calGlide && feedStart > 0 && $("#feed-top").getBoundingClientRect().bottom > 0) drawLess();
  // ↑ 递归补到哨兵出屏: 终止条件靠上面那步 scrollBy 把视口推下去 — 滑屏期间视口
  //   只跟着 glide 的节奏走, 递归会一路画到头 (真机上几千组), 滑屏中每边沿只补一段
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
  feedMonths = new Map();      // 月度小计: 顺着组一遍算出来 (日历标题和胶泡共用)
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

function jumpToDate(date) {     // 日历点日子: 窗口挪到那天 (没账落到最近的有账日) —
                                // 顺着滑过去 (calGlideTo), 不再一下子蹦到
  const idx = feedGroups.findIndex(g => g[0] <= date);
  if (idx < 0) return;
  if (idx < feedStart || idx >= feedDrawn) {
    const gap = idx < feedStart ? feedStart - idx : idx - feedDrawn + 1;
    if (gap <= FEED_CHUNK * 3) {          // 邻月附近: 窗口朝目标扩, 眼前的内容不动 —
      while (feedStart > idx) drawLess(); // 滑过去一路穿的是真内容, 没有"啪"一下换内容
      while (feedDrawn <= idx) drawMore();
    } else {                              // 远 (跨年跳日子这种): 整窗重画再滑
      feedStart = idx; feedDrawn = idx;   // 窗口从那天起往下画
      $("#feed-top").hidden = idx <= 0;
      $("#entry-list").innerHTML = "";
      drawMore();
    }
  }
  const el = document.querySelector(`.day-group[data-date="${feedGroups[idx][0]}"]`);
  if (!el) return;
  calGlideTo(Math.max(0, el.getBoundingClientRect().top + scrollY - calGap()));
}

function jumpToMonth(mon) {     // 明细联动: 日历翻了 (箭头/左右划/气泡上的 ‹ ›),
                                // 窗口跟着挪到那个月 — 目标钉那个月的最后一天,
                                // 落到该月最新的有账日 (没账的月落到前头最近的有账日)
  const [y, m] = mon.split("-").map(Number);
  jumpToDate(`${mon}-${pad(new Date(y, m, 0).getDate())}`);
}

function render() {
  const sig = feedSignature();  // 数据/筛选没变: 只刷日历和状态, 列表不动 (滚动不跳)
  if (sig !== feedSig) { feedSig = sig; buildFeed(); }
  renderCalendar();
  renderSyncStrip();
}

// ---------- 日历 (主页顶: 每天收支, 点日子跳瀑布流) ----------
let calMon = curMonth();        // 日历看着的月份 (不存本地, 开页回本月)
let calFeedMon = "";            // 胶泡正报着的月份 (列表当前月; "" = 待探测)
let calPin = "";                // 翻月钉住的月份 (非空时滚动探测让位 — 用户翻的月
                                // 说了算; 手一碰页面才交还探测权, 见下方解钉监听)

function calAmt(n) {            // 紧凑金额 (日历格子/胶泡里子同一副): 上万缩 1.2万,
                                // 上千缩 1.2千, 否则至多一位小数 — 中间那块宽度有限,
                                // 长数字简写不硬挤
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}千`;
  return String(Math.round(n * 10) / 10);
}

function calCapHtml(mon) {         // 胶泡文字: 某年某月 + 整月收支 (走紧凑写法 千/万 —
                                   // 与日历标题同一副面孔, 但中间窗口宽度有限不硬挤;
                                   // 收支带方向色 — 支出柔红/收入柔绿, 磨砂里一眼分得清)
  const t = feedMonths.get(mon) || { expense: 0, income: 0 };
  const [y, m] = mon.split("-");
  return `${y}年${+m}月<span class="msum">` +
    `<span class="e">支 ${calAmt(t.expense)}</span> · ` +
    `<span class="i">收 ${calAmt(t.income)}</span></span>`;
}

// ‹ › 画成 SVG 线段箭头: 字形的 ‹ 在自己的字形框里光学偏心, 跟旁边的文字
// 对不齐; 线段箭头几何居中, 中线真正对上 (记一笔弹层关闭钮同一副线帽粗细)
const CAL_CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M15 5.5L9 12L15 18.5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CAL_CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 5.5L15 12L9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function calCapInHtml(mon) {       // 胶泡整副里子: ‹ [月份+收支] › — 胶囊定宽, ‹ › 钉死在
                                   // 两端 (位置恒定), 中间窗口 (cb-mid) 吃满剩余宽度;
                                   // 月份每次整包重写, 按钮无状态跟着一起重建
  return `<button type="button" class="cb-nav" data-d="-1" aria-label="上月">${CAL_CHEV_L}</button>` +
    `<span class="cb-mid"><span class="cb-mv">${calCapHtml(mon)}</span></span>` +
    `<button type="button" class="cb-nav" data-d="1" aria-label="下月">${CAL_CHEV_R}</button>`;
}

function calBarShell() {           // 胶囊里子骨架 (‹ 窗口 ›) 只搭一次: 之后翻月/换报
                                   // 只换中间那层字 (cb-mv) — 按钮和窗口常驻, 点 ‹ › 那
                                   // 下不把它们拆掉重搭 (整包重搭一下, 点着的钮和文字
                                   // 全闪一遍 — 就是点箭头气泡回闪那毛病)
  if ($("#cal-bar .cb-in")) return;
  $("#cal-bar").innerHTML = `<span class="cb-in">${calCapInHtml(calMon)}</span>`;
}

function calSlideCap(oldHtml, delta) {   // 胶泡换月的对滑: 新月顺着翻的方向进 (‹ 从左/
                                         // › 从右 — 日历格 cal-in 同一套方向约定), 旧月
                                         // 被顶到对面出去; 旧月先照原样垫一层 (cb-mv),
                                         // 两层各挂一档动画, 窗口 (cb-mid) 裁形, 滑完旧层
                                         // 拆走 (兜底自清)。只有 ‹ › 翻月走这 — 滚动探测
                                         // 换月/数据刷新不演
  const mid = $("#cal-bar .cb-mid");
  if (!mid) return;                // 胶泡还没画过里子 (没接管过): 没得滑, 直接就是新的
  const mv = mid.querySelector(".cb-mv");
  if (!mv) return;
  const ghost = document.createElement("span");
  ghost.className = "cb-mv";       // 同款一层: 铺满窗口垫着, 等动画把它顶出去
  ghost.innerHTML = oldHtml;
  mid.appendChild(ghost);
  const inCls = delta > 0 ? "cb-mv-in-r" : "cb-mv-in-l";
  const outCls = delta > 0 ? "cb-mv-out-l" : "cb-mv-out-r";
  mv.classList.remove("cb-mv-in-l", "cb-mv-in-r");   // 连点几下: 重放式 class + reflow
  ghost.classList.remove("cb-mv-out-l", "cb-mv-out-r");   // (1.3.0 类别格同款)
  void mv.offsetWidth;
  mv.classList.add(inCls);
  ghost.classList.add(outCls);
  setTimeout(() => ghost.remove(), 360);
}

function renderCalendar() {
  const [y, m] = calMon.split("-").map(Number);
  const t = feedMonths.get(calMon) || { expense: 0, income: 0 };
  $("#cal-title").innerHTML = `${y}年${m}月` +
    `<span class="msum">支 ${fmtMoney(t.expense)} · 收 ${fmtMoney(t.income)}</span>`;
  // 离屏气泡的底稿跟日历月份 (接管中会被列表当前月实时盖掉): 只换中间那层字,
  // 缓存的月份作废, 下一帧重新探测 (翻月钉着时跟钉 — 不重探测)
  calBarShell();
  const mv = $("#cal-bar .cb-mv");
  if (mv) mv.innerHTML = calCapHtml(calMon);
  calFeedMon = calPin;
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
    // 日子个个能点: 没账的落到最近的有账日 (jumpToDate 兜底), 不留死格子
    html += `<button type="button" class="${cls}" data-date="${date}">${inner}</button>`;
  }
  // 尾部补下月的日子 (灰字, 不可点): 补足六行 42 格 —— 格子数恒定, 左右划切月
  // 时日历高度不跟着月初星期/月长短变来变去
  for (let d = 1; d <= 42 - first - days; d++) html += `<div class="cal-day after"><span class="d">${d}</span></div>`;
  $("#cal-grid").innerHTML = html;
  if ($("#cal-card").style.visibility === "hidden") {   // 分身接管中: 重搬内容 + 对一遍位 (别演旧戏)
    calRetwin();
    calSync();
  }
}

function shiftCal(delta, base) {    // ‹ › 按钮 / 左右划 / 气泡上的 ‹ › 共用: 换月, 新月份
                                    // 顺着切换方向滑入。base = 从哪个月翻起 — 日历自己翻
                                    // 不传 (calMon), 气泡上翻传它正报着的月 (翻的是用户
                                    // 眼前那个月); 翻完明细联动挪到那个月 (jumpToMonth)
  const from = base || calMon;      // 翻月前的那副月: 胶泡里子先存下, 画完新月演对滑
  const oldMv = $("#cal-bar .cb-mv");
  const oldHtml = oldMv ? oldMv.innerHTML : "";
  const [y, m] = from.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  calMon = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  calPin = calMon;                 // 翻月钉住: 气泡跟日历月走, 滚动探测让位 — 不钉的话,
                                    // 翻到没账的月份 (跳位落回眼前) 或跳位被惯性余波压回,
                                    // 随后的滚动事件会让探测把月份又盖回旧月, 看起来就是
                                    // "点了没反应"; 手指真落下 (touchstart/wheel) 才解钉
  jumpToMonth(calMon);            // 先挪明细再画日历: 接管分支里 calSync 探测到的
                                   // 就是新月, 胶泡不会先闪一帧旧月
  renderCalendar();
  if (oldHtml && from !== calMon)   // 换了月胶泡里子才演对滑 (同月点两下不演; 没接管过
    calSlideCap(oldHtml, delta);    // 没得滑)
  const cls = delta > 0 ? "cal-in-r" : "cal-in-l";   // 下月从右进, 上月从左进
  [$("#cal-title"), $("#cal-grid")].forEach(el => el.classList.remove("cal-in-r", "cal-in-l"));
  void $("#cal-grid").offsetWidth;                   // 重放式 class + reflow (连划几下每次都重放,
  [$("#cal-title"), $("#cal-grid")].forEach(el => el.classList.add(cls));   // 1.3.0 类别格同款)
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

// 日历左右划: 快速翻上月/下月 (向左划=下月, 向右划=上月; 记一笔弹层整层手势
// 同款骨架: 先定轴向定了不反悔, 一划只翻一次 —— 手指没抬也不再触发, 竖着划
// 让给页面滚动; 划/拽完的那一下点击当场吃掉, 不顺着误触日子格子和 ‹ › 钮)
(() => {
  const card = $("#cal-card");
  let x0 = null, y0 = 0, axis = "", ate = false;
  const settle = () => { x0 = null; axis = ""; };
  card.addEventListener("touchstart", e => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; axis = "";
  }, { passive: true });
  card.addEventListener("touchmove", e => {
    if (x0 == null) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (!axis && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) + 6) {
      axis = "x";
      ate = true;
      settle();                                     // 一划只翻一次
      shiftCal(dx < 0 ? 1 : -1);
    } else if (!axis && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      settle();                                     // 竖滚: 让给页面, 翻月不抢
    }
  }, { passive: true });
  const end = () => {
    if (ate) setTimeout(() => { ate = false; }, 350);   // 划完的点击吃掉 (兜底自清)
    settle();
  };
  card.addEventListener("touchend", end);
  card.addEventListener("touchcancel", end);
  card.addEventListener("click", e => {            // 捕获先于格子/‹›: 误触当场吃掉
    if (!ate) return;
    e.stopPropagation(); e.preventDefault();
    ate = false;
  }, true);
})();

$("#cal-grid").addEventListener("click", e => {
  const btn = e.target.closest("button[data-date]");
  if (btn) jumpToDate(btn.dataset.date);
});
$("#feed-top").addEventListener("click", drawLess);

// ---------- 日历 ⇄ 顶部胶囊 (跟手收拢, 停手收场) ----------
// 日历卡顶一碰到 --cal-top 落位线, #cal-bar 就化身日历分身接管 (搬真身内容,
// 扮卡面皮肤, 交接那帧像素连续): 上边界钉死在落位线不动, 下边界跟着滚动
// 一路往上收 —— 后段宽度收窄、圆角长成胶囊, 分身内容交叉淡成胶泡文字,
// 滚到头日历正好退化成那枚胶囊。往回滚完全对称: 一路长回日历, 卡顶回到
// 落位线下方那一帧交还真身。全程滚动驱动 (rAF 逐帧直写行内几何, 不挂
// 过渡) —— 收拢的速度就是手速。流畅治在三处 (帧率就丢在逐帧重排/换肤):
// 分身是定格快照 (接管那刻宽高钉死, 外壳一路只当裁形窗口裁它 —— 日历
// 网格全程零重排), 底色/影子接管那刻一次写死 (途中不逐帧换肤, 影子干脆
// 歇到到站), 逐帧要碰的 DOM 引用也接管那刻缓存。收到头 (p=1) 就歇进
// 胶囊位: 行内几何整个交还样式表世界 (居中 + 定宽) —— 胶泡以后再换内容
// (翻月/记了笔账), ‹ › 和宽度都纹丝不动; 歇着时被往回滚, 从胶囊位接着
// 跟手长回 (胶囊定宽: 静止位接管那刻量过一直有效, 不用重测)。停手不冻在
// 半缩的中间形态 (动画要么不播, 播就播完): 手静 ~180ms, 页面自己把没走完
// 的走完 —— 收场走的是真滚动 (往哪边滚就朝哪边收场: scrollTo 一路平滑滑
// 到底), 分身始终从实时几何取形, 不另演一套 (先前停手后分身自演一遍、
// 演完又被真身几何拽回半路, 来回抽搐就抽在这); 一摸就停, 停在手里的样子
// 继续跟手。胶泡文字实时跟列表走: 滚到哪个月, 视线线上那条日组就是哪个月,
// 胶泡连月份带整月收支整包换 (月份换了才动一次 DOM); ‹ › 翻月时里子新旧
// 两层在窗口里对滑 (calSlideCap), 联动的明细顺着滑过去 (calGlideTo)。
// 磨砂照旧运动期暂撤、歇下来恢复 (变换层从磨砂件底下扫过是 WebKit 吐
// 重影的配方, my-music body.pane-anim 同规矩)。落位卡在 --cal-top
// (bookkeeping-page.css: 独立模式贴着 iOS 26+ 系统磨砂带的底沿停, 不躲安全线)。
// 分身 pointer-events:none (css) — 它只是张快照, 别挡胶泡自己的 ‹ › 和点击。
const CAL_H = 36;                 // 胶囊高 (#cal-bar 样式表同值)
const CAL_EPS = 0.5;              // 接管/交还的判定余量 (防边界抖)
const CAL_W_PINCH = 0.45;         // 收拢进度打这起才收窄/长圆/换字 (前半程只收高, 后半程裁形收拢)
const CAL_FADE = 0.8;             // 换字淡完的进度线 (分身淡到头, 后段只剩外壳裁形)
const CAL_IDLE = 180;             // 手静多久算停 (没走完的就自己走完)
const CAL_G_K = 110;              // 滑屏弹簧劲度 (ω≈10.5): 拉着视口奔目标那股劲 — 特意调
                                  // 柔 (先前 260 太硬): 临到头那口气慢慢泄, 缓缓地刹住, 不再
                                  // 干脆利落地急停一下
const CAL_G_C = 2 * Math.sqrt(CAL_G_K);   // 临界阻尼 (ζ=1): 到位不弹头不哆嗦
const CAL_G_V0 = 13;              // 距离→起步冲量: 近处轻推、远处甩得快 (小跳带点过冲回落)
const CAL_G_VMAX = 7000;          // 冲量/速度封顶 (px/s): 大跳也就是顺手一甩那么快
let calHeld = false;              // 分身接管中 (真身 visibility:hidden)
let calDocked = false;            // 收到头歇在胶囊位 (行内几何已交还样式表, 定宽居中)
let calSlot = null;               // 胶囊静止位 (接管那刻量; 定宽居中 — 内容再换也不变)
let calFrame = false;             // scroll → rAF 节流闸
let calSettleT = 0;               // 停手判定的计时器
let calLastY = -1;                // 上一帧的滚位 (-1 = 还没真滚过; 开页恢复滚位不算手)
let calVel = 0;                   // 最近的滚动方向 (负 = 收拢, 正 = 长回) — 停手朝这头收场
let calTwin = null;               // 分身元素 (接管那刻缓存, 热路径不再查 DOM)
let calIn = null;                 // 胶泡文字 (同上)

const calSmooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);   // 两端缓一拍

function calGap() {               // 跳位落点要让开的高度: 目标日组全在日历底下 (深列表),
                                   // 跳过去必进接管带 — 落点一律让到胶囊底下 (日组头从
                                   // 胶囊底下钻出来才看得见); 没接管过就现量一眼静止胶囊
  const top = calSlot ? calSlot.top : $("#cal-bar").getBoundingClientRect().top;
  return top + CAL_H + 8;         // 胶囊高 36 + 8 缝
}

function calGlideStop() {         // 停下在途的程序滑屏 (手一碰/新目标先来): 用户随时能夺回
  if (calGlide) {
    cancelAnimationFrame(calGlide.raf);
    calGlide = null;
  }
}

function calGlideTo(y) {          // 程序滑屏 (翻月联动/点日子跳位/点胶囊滚回): 真·物理
                                  // 手感 — 弹簧拉着视口奔目标, 临界阻尼耗着 (到位不弹头),
                                  // 起步按远近先给一脚冲量: 近处轻推、小跳带点过冲再落回,
                                  // 远处一甩、速度指数衰减拖着长尾缓缓刹住 (阻尼感);
                                  // 半路换目标把在途速度带过去 (连点两下 ‹, 第二趟从
                                  // 第一趟的余速接着走 — 物理连续); 滑的是真滚动, 滚动
                                  // 事件照常驱动胶囊收拢/长回; 途中 drawLess 往上补内容
                                  // 时视口跟着内容下移、滑的坐标系整体跟移 (画面不跳,
                                  // 终点还落在目标上)
  const carry = calGlide ? calGlide.v : 0;    // 在途余速: 换目标不从零再起
  calGlideStop();
  while (y > document.documentElement.scrollHeight - innerHeight
         && feedDrawn < feedGroups.length) drawMore();
  // ↑ 目标可能压着文档底 (目标在窗口里但离底不远, 底下哨兵还没带出更多内容):
  //   先把文档画够高再滑 — 不然滑到头被最大滚动钳在离目标差一截的半道
  const cur = scrollY;
  const dist = y - cur;
  if (Math.abs(dist) < 2 && Math.abs(carry) < 40) return;   // 本来就在: 不演
  let v = Math.max(-CAL_G_VMAX, Math.min(CAL_G_VMAX, dist * CAL_G_V0));
  if (carry * dist > 0)                        // 余速同向: 带着走, 别反而降速
    v = Math.sign(v) * Math.max(Math.abs(v), Math.abs(carry));
  const t0 = performance.now();
  const g = calGlide = { to: y, cur, v, t0, last: t0, raf: 0 };
  const step = now => {
    if (calGlide !== g) return;                // 半路被停/被换: 旧这一趟就地熄火
    const dt = Math.min(0.04, Math.max(0.001, (now - g.last) / 1000));
    g.last = now;                              // 卡顿的帧不当长帧算 (弹簧会炸)
    g.v += (CAL_G_K * (g.to - g.cur) - CAL_G_C * g.v) * dt;   // 弹簧拉 + 阻尼耗
    g.v = Math.max(-CAL_G_VMAX, Math.min(CAL_G_VMAX, g.v));   // 甩得再快也就这么快
    g.cur += g.v * dt;
    window.scrollTo(0, g.cur);
    if ((Math.abs(g.to - g.cur) < 0.6 && Math.abs(g.v) < 60) || now - g.t0 > 3200) {
      window.scrollTo(0, g.to);                // 到位收工 (半像素内直接落准); 三秒二兜底熄火
                                               // (弹簧调柔后一趟能滑到 1.1s, 兜底跟着放宽 —
                                               // jsdom 假时钟 2.5 倍速, 27 帧才走完一趟)
      calGlide = null;
    } else g.raf = requestAnimationFrame(step);
  };
  g.raf = requestAnimationFrame(step);
}

function calRetwin() {            // 搬真身内容成分身 (接管时/数据变了重搬)
  if (calTwin) calTwin.remove();  // 旧分身先拆走 (胶囊骨架不再整包重搭, 没人顺手清它了)
  const bar = $("#cal-bar");
  const twin = document.createElement("div");
  twin.className = "cal-card cb-card";     // 挂 .cal-card: 标题/网格的样式原样生效
  twin.innerHTML = $("#cal-card").innerHTML;
  const r = $("#cal-card").getBoundingClientRect();
  twin.style.width = `${r.width}px`;      // 定格快照: 宽高接管那刻钉死 —— 外壳一路
  twin.style.height = `${r.height}px`;    // 只当裁形窗口裁它, 日历网格全程零重排
  for (const el of twin.querySelectorAll("[id]")) el.removeAttribute("id");
  // ↑ 分身去 id: $/querySelector 永远命中真身 (日历样式全走 class, 去了不亏)
  if (calDocked) {                        // 歇在胶囊位时数据变了 (整包重写过胶泡): 分身接着隐、
    twin.style.opacity = "0";             // 胶泡文字接着亮 —— 运动期这两笔 calDraw 逐帧带, 不用管
  }                                       // (胶囊定宽: 运动途中换内容, 终点几何不变, 不用重测)
  bar.appendChild(twin);
  calTwin = twin;                         // 逐帧要碰的引用接管那刻缓存, calDraw 不再查 DOM
  calIn = bar.querySelector(".cb-in");
  if (calDocked) calIn.style.opacity = "1";   // 新胶泡没走过 calDraw (样式表默认 0), 歇着也得亮着
}

function calClear(bar) {          // 清行内形变样式, 回样式表世界 (磨砂胶囊)
  bar.style.left = bar.style.top = "";
  bar.style.width = bar.style.height = "";
  bar.style.borderRadius = bar.style.boxShadow = "";
  bar.style.backgroundColor = bar.style.transform = "";
}

function calRelease() {           // 交还真身 (此刻分身几何 ≡ 真身)
  const bar = $("#cal-bar"), card = $("#cal-card");
  clearTimeout(calSettleT);
  calHeld = false;
  calDocked = false;
  calPin = "";                    // 翻月的钉跟着交还: 回到日历了, 探测权还给滚动
  card.style.visibility = "";
  bar.style.visibility = "";
  calClear(bar);
  bar.classList.remove("morph");
  calTwin.remove();
  calTwin = calIn = null;
}

function calDraw(r, p) {          // 把分身摆到收拢进度 p (0 卡原样 → 1 胶囊)
  const bar = $("#cal-bar");
  const top = calSlot.top;                       // 上边界钉死在落位线
  const bottom = top + r.height - p * (r.height - CAL_H);   // 下边界 (跟手或收场驱动)
  const pinch = calSmooth((p - CAL_W_PINCH) / (1 - CAL_W_PINCH));
  const fade = calSmooth((p - CAL_W_PINCH) / (CAL_FADE - CAL_W_PINCH));
  bar.style.left = `${r.left + (calSlot.left - r.left) * pinch}px`;
  bar.style.top = `${top}px`;
  bar.style.width = `${r.width + (calSlot.width - r.width) * pinch}px`;
  bar.style.height = `${bottom - top}px`;
  bar.style.borderRadius = `${14 + 985 * pinch}px`;
  if (p >= 1) {                    // 收到头: 位不再动, 磨砂/底色/影子都交还样式表
    bar.classList.remove("morph");
    bar.style.backgroundColor = "";
    bar.style.boxShadow = "";
  } else {                         // 在途: 磨砂暂撤 (底色/影子接管那刻已一次写死, 不逐帧换肤)
    bar.classList.add("morph");
  }
  calTwin.style.opacity = String(1 - fade);      // 交叉淡出 (定格快照, 只动合成层)
  calIn.style.opacity = String(fade);            // 胶泡文字交叉淡入
}

function calSettle() {             // 手静 ~180ms: 没走完的自己走完 (往哪边滚就朝哪边收场),
  clearTimeout(calSettleT);        // 不冻在半缩的中间形态 —— 收场走真滚动, 分身从实时几何取形
  if (!calHeld || calLastY < 0) return;   // 没真滚过 (开页恢复滚位): 不代劳
  calSettleT = setTimeout(() => {
    if (!calHeld) return;
    const r = $("#cal-card").getBoundingClientRect();
    const line = calSlot.top;
    const bottom = Math.max(r.bottom, line + CAL_H);
    const p = (r.height - (bottom - line)) / (r.height - CAL_H);
    if (p <= 0 || p >= 1) return;                        // 本来就走到头了
    if (calVel > 0) {                                    // 刚才在往回长: 一路长回到顶
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {                                             // 刚才在收拢: 一路收到下边界贴胶囊底
      window.scrollTo({ top: scrollY - (r.bottom - line - CAL_H),
                        behavior: "smooth" });
    }
  }, CAL_IDLE);
}

function calViewMon() {            // 列表现在看着哪个月: 月份头横幅撤了, 日组就是月界 —
                                   // 视线线上最靠上那条日组 (从胶囊底下钻出来的头一条) 说了算
  const line = calSlot.top + 44;   // 视线线 = 胶囊高 36 + 8 缝: 钻出胶囊底下才算"看着"
  const gs = document.querySelectorAll(".day-group");
  if (!gs.length) return "";
  let mon = gs[0].dataset.date.slice(0, 7);   // 还没滚进任何日组: 先按最上面那个月
  let lo = 0, hi = gs.length - 1;
  while (lo <= hi) {               // 日组新→老排 (DOM 顺序), 屏上越靠下顶越高: 二分找
    const mid = (lo + hi) >> 1;    // 顶过线的最后一条 (它那个月就是现在看着的月)
    if (gs[mid].getBoundingClientRect().top <= line) {
      mon = gs[mid].dataset.date.slice(0, 7);
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return mon;
}

function calSync() {               // 滚一帧对一帧: 收拢/长回全跟手
  const bar = $("#cal-bar"), card = $("#cal-card");
  const r = card.getBoundingClientRect();
  const slot = calHeld ? calSlot : bar.getBoundingClientRect();  // 隐身仍占位, 自由态量得到
  if (!calHeld) {
    if (r.top > slot.top + CAL_EPS) return;   // 卡顶还在落位线下方: 真身自己走
    calSlot = slot;                           // 接管: 分身 = 日历, 真身隐身
    calRetwin();
    card.style.visibility = "hidden";
    bar.style.visibility = "visible";
    bar.style.transform = "none";   // 形变期不吃样式表的 translateX 居中 (就写这一回)
    bar.style.backgroundColor = "rgb(34,43,49)";  // 底色途中一次写死 (卡面 #1e2429 → 磨砂等效 #2b3841·72% 的中点)
    bar.style.boxShadow = "none";                 // 影子路上干脆歇着 (减细节换流畅); 到站都交还样式表
    calHeld = true;
  } else if (r.top > calSlot.top + CAL_EPS) { // 滚回来了: 交还真身 (此刻分身几何 ≡ 真身)
    calRelease();
    return;
  }
  const top = calSlot.top;
  const bottom = Math.max(r.bottom, top + CAL_H);
  const mon = calViewMon();         // 列表滚到哪个月了 (先读后写: 探测跟几何同一批读, 不多排一遍)
  const p = Math.min(1, Math.max(0,             // 收拢进度: 0 卡原样 → 1 胶囊
    (r.height - (bottom - top)) / (r.height - CAL_H)));
  if (calDocked && p < 1) {         // 歇在胶囊位又被往回滚: 从胶囊位接着跟手长回 (胶囊定宽,
    calDocked = false;              // 静止位接管那刻量过一直有效, 不用重测)
    bar.style.transform = "none";   // 形变期不吃样式表的 translateX 居中 (换肤同接管那套)
    bar.style.backgroundColor = "rgb(34,43,49)";
    bar.style.boxShadow = "none";
  }
  if (mon && mon !== calFeedMon && !calPin) {   // 翻进新的月份: 只换中间那层字 (月份换了
                                    // 才动 DOM, 不逐帧写); 翻月钉着时让位 — 钉着的月说了算,
                                    // 跳位后的余波滚动事件别把用户翻的月又盖回旧月
    calFeedMon = mon;               // (‹ › 和窗口常驻不重搭 — 同 calBarShell, 滚动途中
    const mv = $("#cal-bar .cb-mv");   //  换报也不闪按钮)
    if (mv) mv.innerHTML = calCapHtml(mon);
  }
  if (!calDocked) {
    calDraw(r, p);                  // 跟手/收场: 逐帧行内几何 (上面清掉的 left/width 也在这重写)
    if (p >= 1) {                   // 收到头: 歇进胶囊位, 几何交还样式表 (居中 + 定宽) ——
      calDocked = true;             // 胶泡以后再变 (翻月/记账), ‹ › 和宽度都纹丝不动
      calClear(bar);
    }
  }
  calSettle();                      // 手要是停在这半路: 一口气收场
}

addEventListener("scroll", () => {     // 滚一帧追一帧 (rAF 节流); 滚动方向也记下 (停手朝这头收场)
  if (calFrame) return;
  calFrame = true;
  requestAnimationFrame(() => {
    calFrame = false;
    const y = scrollY;
    if (calLastY >= 0 && y !== calLastY) calVel = y - calLastY;
    calLastY = y;
    calSync();
  });
}, { passive: true });

// 观察器只当开机一脚: 恢复滚位开页没有 scroll 事件, 靠它的初次回调带进 calSync
new IntersectionObserver(() => calSync(),
  { rootMargin: "-40px 0px 0px 0px" }).observe($("#cal-card"));
// 翻月的解钉 + 滑屏的让权: 钉着的月只在"没人动"时有效 — 翻完那一下, 跳位
// 自身的滚动事件、惯性/收场余波都不该把月份盖回去; 手指真落下 (或桌面滚轮/
// 按下) 才算用户要动, 交还滚动探测权, 在途的程序滑屏也一并停下 (用户随时
// 能夺回)。点 ‹ › 的那下触摸先解旧钉/停旧滑, 紧跟的翻月再钉新月再起新滑,
// 顺序天然对
for (const ev of ["touchstart", "pointerdown", "wheel"])
  addEventListener(ev, () => { calPin = ""; calGlideStop(); }, { passive: true, capture: true });
$("#cal-bar").addEventListener("click", e => {
  const nav = e.target.closest(".cb-nav");
  if (nav) {                      // 气泡上的 ‹ ›: 从胶泡正报着的月翻起 (明细联动跟着挪)
    shiftCal(+nav.dataset.d, calFeedMon || calMon);
    return;
  }
  calGlideTo(0);                  // 点胶囊滚回: 一路长回日历跟着滑
});
