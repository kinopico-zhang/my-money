// bookkeeping-render — My Money 渲染: 日历卡 (每天收支, 点日子跳位 — 没账的
// 日子也点得动, 落到最近的有账日; 升到顶被按住, 收拢成顶上一枚磨砂胶囊 —
// 缩放全程跟手: 收拢跟长回一样跟着滚动走 (滚到哪停到哪 — 任意高度都是稳态,
// 分身下边界贴着列表内容的头, 没有空档可言; 圆角全程钉死 18px 一分不变 —
// 高度缩到胶囊那截自然就是胶囊); 几何交给浏览器的滚动时间线 — 渲染时按当帧
// 滚位采样零延迟 (脚本驱动天生慢一拍, 快滚时边和内容错开一帧 = 一顿一顿的根);
// 形变期壳只裁不画 — 圆角裁合成层要在壳上挂 mask 逐帧重画, 矩形硬裁不要钱,
// 圆角脸搬去皮肤层 (.cb-skin), 分身自带静态圆角 (帧率);
// 点开的面板没有滚动可跟, 开合才交给那副临界阻尼弹簧; 胶囊定宽, ‹ › 钉死
// 两端, 实时报着列表滚到哪个月、
// 那月收支多少 (长数字缩成 1.2千/1.2万), 往回滚一路跟手长回, 手停半路
// 一口气长回顶; 点胶囊就地展开成悬浮日历面板 (列表纹丝不动, 滑列表才收回);
// 跳位/收场滑屏同这副弹簧脾气; 胶泡上的
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
let calDomSeq = 0;              // 列表 DOM 版号: 动过 #entry-list 的地方都 bump 一下 (铺开/上补/
                                // 重建/远跳重画 — 那些函数就在这片底下, 得先有这行), 日组名单
                                // 缓存 (下两行) 据此作废
let calViewGs = null;           // 日组名单缓存 (querySelectorAll 的静态 NodeList): DOM 没动
                                // 就复用 — 逐帧重查是白花钱 (帧率)
let calViewSeq = -1;            // 名单缓存对着的 DOM 版号
let calGlide = null;            // 程序滑屏进行中 (跳位联动, 弹簧阻尼驱动): {to, cur, v,
                                // t0, last, raf} — 途中 drawLess 往上补内容, 视口跟内容
                                // 一起下移, cur/to 整体跟移 (画面不跳, 终点还落在目标上)
let calJumpT = 0;               // 点日子跳位起步的时刻: 悬浮面板开着时, 自己这趟滑屏发的
                                // 滚动事件不算用户滚动 (面板不收)。calGlide 在途挡得住
                                // 大头; 没起滑屏的那下 (目标本来就在落点位), 挪窗口的
                                // 视口补偿也会发滚动事件 — 起步后 ~350ms 内都当自己人
let calSkin = null;             // 皮肤层 (.cb-skin — 形变期/面板期的底色/圆角/影子): 胶囊
                                // 骨架 calBarShell 营它营得早 (两百来行外就要写), 只好
                                // 跟着住这片 — 面板落位上影/收回歇影写的都是它

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
      // 行身 (.sw-body) 单独一层: 左滑删除时整层挪, 身后右侧垫着删除钮 (手势在 entry-sheet.js)
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
  calDomSeq++;                     // 动了列表: 日组名单缓存作废 (calViewMon 下一趟重查)
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
  calDomSeq++;                     // 动了列表: 日组名单缓存作废 (calViewMon 下一趟重查)
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
  calDomSeq++;                     // 整包重画: 日组名单缓存作废 (calViewMon 下一趟重查)
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
      calDomSeq++;                 // 整窗重画: 日组名单缓存作废 (calViewMon 下一趟重查)
      drawMore();
    }
  }
  const el = document.querySelector(`.day-group[data-date="${feedGroups[idx][0]}"]`);
  if (!el) return;
  const elDoc = el.getBoundingClientRect().top + scrollY;
  if ($("#cal-card").style.visibility !== "hidden") {   // 真身还看得见 = 卡还在流里 (在
                                   // 日历上点的): 落点按"滑到地方时顶上占着的是谁"算 —
    const cr = $("#cal-card").getBoundingClientRect();   // 这趟滑屏带 hold: 滑得远, 卡过线
    const line = $("#cal-bar").getBoundingClientRect().top;   // 原地化成悬浮面板 (顶上 = 落位
    const flow = Math.max(0, elDoc - (cr.bottom + scrollY) - 8);   // 线 + 卡高); 滑得近, 卡留在
    // ↑ 流内落点: 日组头贴着卡底钻出来 — 卡没过线 (flow 还推不动卡顶过线) 就用它,
    //   到地方时日历还是眼前这张卡, 目标在它底下一眼看得见
    calGlideTo(flow >= cr.top + scrollY - line   // flow 把卡顶推过线了: 到地方顶上是面板,
      ? elDoc - (line + cr.height + 8) : flow, true);   // 落点让开整张 (贴胶囊那档不够,
    return;                               // 目标日组会钻进面板背后看不见)
  }
  calGlideTo(Math.max(0, elDoc - calGap()), true);   // 已接管 (胶囊/悬浮面板): 让开占顶的那块
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
let calFloat = false;           // 胶囊点开成悬浮日历面板 (列表纹丝不动; 滑列表才收回)
                                // — 声明在这片早营: 渲染期的 renderCalendar/shiftCal
                                // 也读它 (面板开着时刷新/翻月走别的路), 得先于它们
let calFloatT = null;           // 面板开合的弹簧 {to, v, t0, last, raf} — rAF 驱动
                                // calDraw 的 p (悬浮面板展开/收回/收回途中回滚弹回
                                // 走它 — 缩放本身跟手, 不点弹簧), 与跟手收拢同一
                                // 条形变轨道 (弹簧常数在下方滑屏那片, 只这片早营的读它)
let calP = 1;                   // 最近画过的收拢进度 (0 卡原样 ↔ 1 胶囊) — 弹簧
                                // 从这接着走 (半路改道也从眼下的样子续)

function calAmt(n) {            // 紧凑金额 (日历格子/胶泡里子同一副): 上万缩 1.2万,
                                // 上千缩 1.2千, 否则至多一位小数 — 中间那块宽度有限,
                                // 长数字简写不硬挤
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}千`;
  return String(Math.round(n * 10) / 10);
}

function calCapHtml(mon) {         // 胶泡文字: 某年某月 + 整月收支 — 月份/支出/收入同一副
                                   // 字号粗细 (都继承 #cal-bar, 不再收支小一号细一档),
                                   // 内容之间的空隙交给布局 (.cb-mv 的 gap 与 .i 的
                                   // margin 一样宽 — 不往串里拼 ·); 金额走紧凑写法 千/万
                                   // (与日历标题同一副面孔, 中间窗口宽度有限不硬挤);
                                   // 收支带方向色 — 支出柔红/收入柔绿, 磨砂里一眼分得清
  const t = feedMonths.get(mon) || { expense: 0, income: 0 };
  const [y, m] = mon.split("-");
  return `<span class="cm">${y}年${+m}月</span><span class="msum">` +
    `<span class="e">支 ${calAmt(t.expense)}</span>` +
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
  $("#cal-bar").innerHTML =
    `<div class="cb-skin"></div><span class="cb-in">${calCapInHtml(calMon)}</span>`;
  calSkin = $("#cal-bar .cb-skin");   // 皮肤层缓存 (骨架只搭一次, 它跟着常驻): 形变期
                                      // 底色/圆角/影子全画在它身上 — 壳那会儿只裁不画
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

function calTitleHtml(mon) {       // 标题那一行 (y年m月 + 整月小计): 真身 / 左右划的候场页 /
                                   // 胶泡底稿同一副面孔 — 同一副 HTML, 划到谁身上谁就是真的
  const t = feedMonths.get(mon) || { expense: 0, income: 0 };
  const [y, m] = mon.split("-");
  return `${y}年${+m}月` +
    `<span class="msum">支 ${fmtMoney(t.expense)} · 收 ${fmtMoney(t.income)}</span>`;
}

function calGridHtml(mon) {        // 月份格 (42 格恒高 — 月初补空 / 月尾接下月灰字): 真身 /
                                   // 左右划的候场页同一副几何 (恒高 = 切月时卡不跳)
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
    // 日子个个能点: 没账的落到最近的有账日 (jumpToDate 兜底), 不留死格子
    html += `<button type="button" class="${cls}" data-date="${date}">${inner}</button>`;
  }
  // 尾部补下月的日子 (灰字, 不可点): 补足六行 42 格 —— 格子数恒定, 左右划切月
  // 时日历高度不跟着月初星期/月长短变来变去
  for (let d = 1; d <= 42 - first - days; d++) html += `<div class="cal-day after"><span class="d">${d}</span></div>`;
  return html;
}

function renderCalendar() {
  $("#cal-title").innerHTML = calTitleHtml(calMon);
  // 离屏气泡的底稿跟日历月份 (接管中会被列表当前月实时盖掉): 只换中间那层字,
  // 缓存的月份作废, 下一帧重新探测 (翻月钉着时跟钉 — 不重探测)
  calBarShell();
  const mv = $("#cal-bar .cb-mv");
  if (mv) mv.innerHTML = calCapHtml(calMon);
  calFeedMon = calPin;
  $("#cal-grid").innerHTML = calGridHtml(calMon);
  if ($("#cal-card").style.visibility === "hidden") {   // 分身接管中: 重搬内容 + 对一遍位 (别演旧戏)
    calRetwin();
    if (!calFloat) calSync(false);   // 悬浮面板开着不叫 calSync: 那是滚动探测的门, 进去就会把
                                // 面板收掉 (翻月/记账刷新都走这) — 面板几何归面板弹簧管,
                                // 重搬的分身已经就位, 不用对位; 传 false: 数据刷新的对位
                                // 只是摆一帧, 别拿滚动方向的残账点着收拢弹簧
  }
}

function shiftCal(delta, base, quiet) {    // ‹ › 按钮 / 左右划 / 气泡上的 ‹ › 共用: 换月, 新月份
                                    // 顺着切换方向滑入。base = 从哪个月翻起 — 日历自己翻
                                    // 不传 (calMon), 气泡上翻传它正报着的月 (翻的是用户
                                    // 眼前那个月); 翻完明细联动挪到那个月 (jumpToMonth)。
                                    // quiet = 左右划的拖页已把滑入演完: 只换月, canned
                                    // 动画 (cal-in 滑入/胶泡对滑) 不再叠一遍
  const from = base || calMon;      // 翻月前的那副月: 胶泡里子先存下, 画完新月演对滑
  const oldMv = quiet ? null : $("#cal-bar .cb-mv");
  const oldHtml = oldMv ? oldMv.innerHTML : "";
  const [y, m] = from.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  calMon = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  calPin = calMon;                 // 翻月钉住: 气泡跟日历月走, 滚动探测让位 — 不钉的话,
                                    // 翻到没账的月份 (跳位落回眼前) 或跳位被惯性余波压回,
                                    // 随后的滚动事件会让探测把月份又盖回旧月, 看起来就是
                                    // "点了没反应"; 手指真落下 (touchstart/wheel) 才解钉
  if (!calFloat) jumpToMonth(calMon);   // 先挪明细再画日历: 接管分支里 calSync 探测到的
                                   // 就是新月, 胶泡不会先闪一帧旧月。悬浮面板里翻月不挪 —
                                   // 面板是就着眼前翻月的, 列表等点了日子才走
  renderCalendar();
  if (quiet) return;               // 拖页的路: 滑入/对滑都由拖页演了, 到这收工
  if (oldHtml && from !== calMon)   // 换了月胶泡里子才演对滑 (同月点两下不演; 没接管过
    calSlideCap(oldHtml, delta);    // 没得滑)
  const cls = delta > 0 ? "cal-in-r" : "cal-in-l";   // 下月从右进, 上月从左进
  const panel = calFloat ? $("#cal-bar .cb-card") : null;   // 悬浮面板 (分身): 翻月一回
  const pans = panel   // 查一次现成的 (calTwin 营在后面, 渲染期够不着) — 面板里的同名
    ? [panel.querySelector(".cal-title"), panel.querySelector(".cal-grid")] : [];
  [$("#cal-title"), $("#cal-grid"), ...pans].forEach(el => el.classList.remove("cal-in-r", "cal-in-l"));
  void $("#cal-grid").offsetWidth;                   // 重放式 class + reflow (连划几下每次都重放,
  [$("#cal-title"), $("#cal-grid"), ...pans].forEach(el => el.classList.add(cls));   // 1.3.0 类别格同款)
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

// ---------- 日历 ⇄ 顶部胶囊 (缩放全程跟手, 面板开合走弹簧) ----------
// 日历卡顶一碰到 --cal-top 落位线, #cal-bar 就化身日历分身接管 (搬真身内容,
// 扮卡面皮肤, 交接那帧像素连续): 上边界钉死在落位线不动, 下边界一路往上收
// —— 后段宽度收窄 (圆角不掺和: 运动期恒 18px, 钉在皮肤层 .cb-skin), 分身
// 内容交叉淡成胶泡文字, 收到头日历
// 正好退化成那枚胶囊。缩放全程跟手 (收拢向原先是副自顾自的弹簧: 列表照它
// 自己的滚, 滚得慢中间露空档, 手停再补拽 — 缩放跟列表两副节拍): p 逐帧从
// 滚动几何来, 分身下边界贴着隐身日历卡的下边界 — 那正是列表内容的头: 滚
// 多快收多快 (帧率就是滚动的帧率, 高刷屏就是高刷), 滚停就停在那高度, 任意
// 高度都是稳态 (要配合列表高度, 就得能停在任意一帧)。往回滚保留跟手: 长回
// 随滚动逐帧长, 卡顶回到落位线下方那一帧交还真身; 停在半路手静了, 一口气
// 滑回顶 (要么不播, 播就播完)。点开的面板才走弹簧: 面板浮在列表上, 开合
// 没有滚动可跟, 交给全应用唯一那副临界阻尼弹簧 (滑屏/收场/面板开合同一副
// 脾气); 收回途中回滚过线 (刚上划又反悔): 反着弹回长开, 到位交还真身。流畅
// 治在七处 (帧率就丢在逐帧重排/逐帧重画/遮罩逐帧重栅格/一帧排两遍布局/白跑
// 的探测): 分身是定格快照 (接管那刻宽高钉死, 外壳一路只当裁形窗口裁它 ——
// 日历网格全程零重排), 分身常驻合成层且自带静态圆角 (will-change + 18px 圆角
// 一起进纹理只渲染一次 —— 外壳逐帧改裁形窗口, 快照纹理不再跟着逐帧重画),
// 形变壳只裁不画 (.morph: 矩形裁是 GPU 硬件裁; 圆角裁合成层子元素要在壳上挂
// mask, 壳几何逐帧变 mask 跟着逐帧重栅格化 — 掉帧大头, 底色/圆角/影子搬去
// 皮肤层 .cb-skin 空壳, my-music 流体形变只动空壳同款打法), 胶泡文字也进
// 合成层 (交叉淡入 + 高度逐帧变时的重排中心, 全是免费层位移), 逐帧要碰的
// DOM 引用接管那刻缓存, 读 (几何/文档高/日组名单) 排在写 (样式) 前头 (写完
// 再读 = 逼着一帧排两遍布局), 日组名单按 DOM 版号缓存且胶泡文字还隐着的那程
// 不探测。
// 收到头 (p=1) 就歇进胶囊位: 行内几何整个交还样式表世界 (居中 + 定宽) ——
// 胶泡以后再换内容 (翻月/记了笔账), ‹ › 和宽度都纹丝不动; 歇着时被往回滚,
// 从胶囊位接着跟手长回 (胶囊定宽: 静止位接管那刻量过一直有效, 不用重测)。
// 胶泡文字实时跟列表走: 滚到哪个月, 视线线上那条日组就是哪个月, 胶泡连月
// 份带整月收支整包换 (月份换了才动一次 DOM); ‹ › 翻月时里子新旧两层在窗口
// 里对滑 (calSlideCap), 联动的明细顺着滑过去 (calGlideTo)。磨砂照旧运动期
// 暂撤、歇下来恢复 (变换层从磨砂件底下扫过是 WebKit 吐重影的配方, my-music
// body.pane-anim 同规矩)。落位卡在 --cal-top (bookkeeping-page.css: 独立
// 模式贴着 iOS 26+ 系统磨砂带的底沿停, 不躲安全线)。分身 pointer-events:
// none (css) — 它只是张快照, 别挡胶泡自己的 ‹ › 和点击; 唯独悬浮面板期打开
// (.float): 点的分身的日子/‹ › 都是它身上的 — 日子点击走胶囊的委托 (分身
// 没 id, 认 class/结构), 点了收面板滑列表; ‹ › 和左右划只翻日历的月, 列表
// 等点了日子才走; 滑列表 = 收回令 (calSync 门口设卡), 面板顺着原路缩回
// 胶囊 — 与跟手收拢同一条 calDraw 形变轨道, 推手是那副开合弹簧。
const CAL_H = 36;                 // 胶囊高 (#cal-bar 样式表同值)
const CAL_EPS = 0.5;              // 接管/交还的判定余量 (防边界抖)
const CAL_W_PINCH = 0.45;         // 收拢进度打这起才收窄/换字 (前半程只收高; 圆角不归这管 —
                                  // 运动期恒 18px, 钉在 #cal-bar.morph)
const CAL_FADE = 0.8;             // 换字淡完的进度线 (分身淡到头, 后段只剩外壳裁形)
const CAL_IDLE = 180;             // 手静多久算停 (长回向的收场在这发 — 收拢向停哪算哪不代劳)
const CAL_G_K = 110;              // 滑屏弹簧劲度 (ω≈10.5): 拉着视口奔目标那股劲 — 特意调
                                  // 柔 (先前 260 太硬): 临到头那口气慢慢泄, 缓缓地刹住, 不再
                                  // 干脆利落地急停一下
const CAL_G_C = 2 * Math.sqrt(CAL_G_K);   // 临界阻尼 (ζ=1): 到位不弹头不哆嗦
const CAL_G_V0 = 13;              // 距离→起步冲量: 近处轻推、远处甩得快 (小跳带点过冲回落)
const CAL_G_VMAX = 7000;          // 冲量/速度封顶 (px/s): 大跳也就是顺手一甩那么快
const CAL_P_K = 170;              // 面板开合弹簧劲度 (ω≈13): 上面滑屏弹簧的近亲 — p 这
                                  // 条程只有 0↔1, 取硬些: 起步那脚冲量吃得住, 后段慢慢
                                  // 泄劲。全应用的程序动画就这一副弹簧脾气 (滑屏/收场/
                                  // 面板开合), 不再各演各的
const CAL_P_C = 2 * Math.sqrt(CAL_P_K);   // 临界阻尼: 到位不弹头 (与滑屏同一条公式)
const CAL_P_V0 = 3.2;             // 距离→起步冲量 (p/s): 一整程 ≈3.2/s — 点开利落不装呆,
                                  // 半路改道按眼下距离比例给
const CAL_P_VMAX = 6;             // 冲量封顶 (p/s)
const CAL_P_TMAX = 900;           // 兜底熄火 (真机 60fps 约 650ms 走完; jsdom 假钟 100ms/
                                  // 帧 + dt 钳 40ms, 第 10 帧就兜底落准)
const CAL_TIMELINE = typeof CSS !== "undefined" && CSS.supports("animation-timeline", "scroll()");
                                  // 收拢几何走浏览器的滚动时间线 (渲染时按当帧滚位采样 —
                                  // 零延迟): 脚本驱动天生慢一拍 (滚动事件回来再写样式, 下
                                  // 一帧才上屏), 快滚时分身下边界与内容差一整帧滚距, 就是
                                  // 帧间一顿一顿的根。iOS 26 / Safari 26 / Chrome 都认;
                                  // 老环境 (@supports 整块不生效) 退回脚本逐帧老底盘 calDraw
let calHeld = false;              // 分身接管中 (真身 visibility:hidden)
let calDocked = false;            // 收到头歇在胶囊位 (行内几何已交还样式表, 定宽居中)
let calSlot = null;               // 胶囊静止位 (接管那刻量; 定宽居中 — 内容再换也不变)
let calFrame = false;             // scroll → rAF 节流闸
let calSettleT = 0;               // 停手判定的计时器
let calLastY = -1;                // 上一帧的滚位 (-1 = 还没真滚过; 开页恢复滚位不算手)
let calBaseY = scrollY;           // 开机位 (脚本装载那刻 — 必在顶): 头一滚没上一帧可比,
                                  // 方向从这起算 (滚轮单格那种一锤子滚动也认得出往下)
let calVel = 0;                   // 最近的滚动方向 (正 = 往下滚/收拢, 负 = 往上滚/长回) —
                                  // 收拢向的滚动顺带铺路 (calSync), 停手只认长回向
                                  // 收场 (calSettle)。1.3.1 那版注释把两头写反,
                                  // 收场的分支跟着反 — 停在半缩处它反倒一路滚回顶
let calTwin = null;               // 分身元素 (接管那刻缓存, 热路径不再查 DOM)
let calIn = null;                 // 胶泡文字 (同上)
                                  // (面板三态 calFloat/calFloatT/calP 在前面日历状态那片 —
                                  // 渲染期的函数也读它们, 只好早营; 列表 DOM 版号/日组名单
                                  // 缓存三件套同理住在瀑布流那片 — 铺开/上补的函数 bump 它)

const calSmooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);   // 两端缓一拍

function calGap() {               // 跳位落点要让开的高度: 目标日组全在日历底下 (深列表),
                                   // 跳过去必进接管带 — 落点一律让到胶囊底下 (日组头从
                                   // 胶囊底下钻出来才看得见); 没接管过就现量一眼静止胶囊
  if (calFloat)                   // 悬浮面板开着点日子: 面板不收 (用户滑列表才收), 落点
    return calSlot.top + $("#cal-card").getBoundingClientRect().height + 8;   // 让开整张
                                   // 面板 — 只让胶囊的话, 目标日组会滑进面板背后看不见
  const top = calSlot ? calSlot.top : $("#cal-bar").getBoundingClientRect().top;
  return top + CAL_H + 8;         // 胶囊高 36 + 8 缝
}

function calGlideStop() {         // 停下在途的程序滑屏 (手一碰/新目标先来): 用户随时能夺回
  if (calGlide) {
    cancelAnimationFrame(calGlide.raf);
    calGlide = null;
  }
}

function calGlideTo(y, hold) {     // 程序滑屏 (翻月联动/点日子跳位/点胶囊滚回): 真·物理
                                  // 手感 — 弹簧拉着视口奔目标, 临界阻尼耗着 (到位不弹头),
                                  // 起步按远近先给一脚冲量: 近处轻推、小跳带点过冲再落回,
                                  // 远处一甩、速度指数衰减拖着长尾缓缓刹住 (阻尼感);
                                  // 半路换目标把在途速度带过去 (连点两下 ‹, 第二趟从
                                  // 第一趟的余速接着走 — 物理连续); 滑的是真滚动, 滚动
                                  // 事件照常进 calSync (长回跟手, 收拢向点着弹簧); 途中
                                  // drawLess 往上补内容时视口跟着内容下移、滑的坐标系
                                  // 整体跟移 (画面不跳, 终点还落在目标上)。hold = 这是
                                  // 日历自己点的跳位 (点日子/翻月): 滚到接管线时日历不
                                  // 收拢 — 原地化成悬浮面板接着挑 (calSync 接管分支认它),
                                  // 只有用户亲手滚列表才算收起令
  const carry = calGlide ? calGlide.v : 0;    // 在途余速: 换目标不从零再起
  calGlideStop();
  while (y > document.documentElement.scrollHeight - innerHeight
         && feedDrawn < feedGroups.length) drawMore();
  // ↑ 目标可能压着文档底 (目标在窗口里但离底不远, 底下哨兵还没带出更多内容):
  //   先把文档画够高再滑 — 不然滑到头被最大滚动钳在离目标差一截的半道
  y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
  // ↑ 落点夹进可滚区间 (收场/跳位算出的目标可能出头; 夹不进的话弹簧永远差一口
  //   到不了终点, 只能等三秒兜底熄火)
  const cur = scrollY;
  const dist = y - cur;
  if (Math.abs(dist) < 2 && Math.abs(carry) < 40) return;   // 本来就在: 不演
  let v = Math.max(-CAL_G_VMAX, Math.min(CAL_G_VMAX, dist * CAL_G_V0));
  if (carry * dist > 0)                        // 余速同向: 带着走, 别反而降速
    v = Math.sign(v) * Math.max(Math.abs(v), Math.abs(carry));
  const t0 = performance.now();
  const g = calGlide = { to: y, cur, v, t0, last: t0, raf: 0, hold: !!hold };
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
      calJumpT = now;                          // 落地这一下也盖上"自己滑的"戳: 收尾那半像素
                                               // 滚动事件回来时 calGlide 已清 (先清后跑), 没
                                               // 这个戳会被当成用户滚了列表 — 悬浮面板刚落到
                                               // 日子上就缩回胶囊
      calGlide = null;
    } else g.raf = requestAnimationFrame(step);
  };
  g.raf = requestAnimationFrame(step);
}
// 日历左右划 — 跟手拖拽翻月: 月份内容贴着指尖 1:1 平移, 上月/下月两页候场页垫在
// 两侧 (往哪边拖哪页进画面, 卡变身裁形窗), 拖过一页宽那截走软阻尼 (tanh 渐近 —
// 拖到头也就露出大半页, 永不拖出空白); 松手那刻按拖过多少 + 甩得多快定去留 —
// 过三成或一甩就翻 (候场页弹簧落座), 不足弹回原位, 指尖的速度原样带进弹簧
// (松手那下不换挡); 落定那帧才换真身内容 (候场页与真身同一副 HTML — 接缝
// 零跳)。原先划过 30px 立刻翻页 + 播一段自顾自的 26px 滑入 (动画跟指尖再无
// 关系, 快划慢划同一副节奏) — 就是"不跟手"的根。竖着划让给页面滚动; ‹ › 钮 /
// 胶泡上的箭头是离散点击, canned 滑入 (cal-in) 仍归它们; 一次拖最多翻一页
// (要连翻就连着划几趟)。真身日历和悬浮面板 (点开的日历分身) 各绑一份 — 面板
// 那份只在浮着时听使唤
let calX = null;      // 在途的拖拽/收场 {p 横位px, v, to, dir 落哪边(0=弹回), t0, last,
                      // raf, root 卡或分身, title/grid 本月那两层, flyL/flyR 候场页,
                      // w 页宽} — null = 眼下没有
const calXSoft = (p, w) =>     // 拖拽的软阻尼: 一页宽之内 1:1 跟手, 往后越拖越缓 (tanh
  Math.sign(p) * w * 0.98 * Math.tanh(Math.abs(p) / (w * 0.98));   // 渐近一页 — 拖到头也就
                               // 露出大半页, 不会拖出一片空白

function calXApply(s, p) {         // 把横位摆上屏: 本月标题/格平移 p, 两页候场各贴 ±页宽
  const x = `translateX(${p}px)`;
  s.title.style.transform = s.grid.style.transform = x;
  s.flyL.style.transform = `translateX(${p - s.w}px)`;
  s.flyR.style.transform = `translateX(${p + s.w}px)`;
}

function calXFlies(s) {            // 两侧候场页换内容: 上月垫 -1 页, 下月垫 +1 页 — 往哪边
  const nb = dd => {               // 拖哪页进来 (半途回拖也认, 对面那页候着就是)。假箭头
    const [y, m] = calMon.split("-").map(Number);   // 占位 (cal-hpad) = 真 ‹ › 的身量: 标题
    const t = new Date(y, m - 1 + dd, 1);           // 框与本月一行宽, 字落得同一个位
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
  };
  const one = dd => `<div class="cal-head"><span class="cal-hpad"></span>` +
    `<div class="cal-title">${calTitleHtml(nb(dd))}</div>` +
    `<span class="cal-hpad"></span></div><div class="cal-grid">${calGridHtml(nb(dd))}</div>`;
  s.flyL.innerHTML = one(-1);
  s.flyR.innerHTML = one(1);
}

function calXFinish() {            // 落定收摊: 拆候场页/清平移; 翻定的话静默换月 (shiftCal
  cancelAnimationFrame(calX.raf);  // quiet — 滑入已由拖页演完, canned 不再叠一遍)。收场
  const d = calX.dir, s = calX;    // 弹簧到位 / 上一趟被新一拖打断, 都走这
  calX = null;
  s.title.style.transform = s.grid.style.transform = "";
  s.flyL.remove(); s.flyR.remove();
  s.root.classList.remove("cal-x");
  if (d) shiftCal(d, calMon, true);
}

function calSwipe(el, live) {
  let x0 = null, y0 = 0, axis = "", ate = false;
  const hist = [];                 // 松手前那几笔指尖取样 [{x, t}] — 算甩速 (~近 100ms)
  const end = () => {
    if (axis === "x" && calX) {    // 松手定去留: 甩得快速度说了算 (0.42px/ms 一甩), 否则看
      const h0 = hist[0];          // 拖过三成没有; 都不沾边弹回原位。收场 = 滑屏那副临界
      let vx = 0;                  // 阻尼弹簧原样搬来推横位 (全应用一副脾气), 指尖速度
      if (h0) {                    // 原样带进去 — 松手那下不换挡
        const l = hist[hist.length - 1];
        vx = (l.x - h0.x) / Math.max(1, l.t - h0.t);
      }
      calX.dir = vx > 0.42 ? -1 : vx < -0.42 ? 1
        : calX.p < -calX.w * 0.3 ? 1 : calX.p > calX.w * 0.3 ? -1 : 0;
      calX.to = -calX.dir * calX.w;
      calX.v = Math.max(-CAL_G_VMAX, Math.min(CAL_G_VMAX, vx * 1000));
      calX.t0 = calX.last = performance.now();
      const s = calX, step = now => {
        if (calX !== s) return;    // 半路被新一拖收摊: 旧这一趟就地熄火
        const dt = Math.min(0.04, Math.max(0.001, (now - s.last) / 1000));
        s.last = now;              // 卡顿的帧不当长帧算 (弹簧会炸)
        s.v += (CAL_G_K * (s.to - s.p) - CAL_G_C * s.v) * dt;
        s.p += s.v * dt;
        calXApply(s, s.p);
        if ((Math.abs(s.to - s.p) < 0.6 && Math.abs(s.v) < 60) || now - s.t0 > 1200)
          calXFinish();            // 到位收工; 1.2s 兜底熄火 (与滑屏同款保险)
        else s.raf = requestAnimationFrame(step);
      };
      s.raf = requestAnimationFrame(step);
    }
    if (ate) setTimeout(() => { ate = false; }, 350);   // 划完的点击吃掉 (兜底自清)
    x0 = null; axis = ""; hist.length = 0;
  };
  el.addEventListener("touchstart", e => {
    if (!live()) { x0 = null; axis = ""; return; }   // 面板收起来了: 胶囊上划不动 (没得翻)
    if (axis) return;                   // 这趟手势进行中: 后来落下的手指不掺和
    if (calX) calXFinish();             // 上一趟收场还在飞: 立刻落定, 新一拖从零起 — 连划
                                         // 不用等尾巴飞完 (候场页落座的样子, 不闪)
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = "";
  }, { passive: true });
  el.addEventListener("touchmove", e => {
    if (x0 == null) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (!axis && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 4) {
      axis = "x";                      // 定了横向不反悔; 竖着划让给页面滚动
      ate = true;
      const root = el.id === "cal-card" ? el : $("#cal-bar .cb-card");   // 拖哪张: 真身卡 /
      const grid = root.querySelector(".cal-grid");   // 点开的悬浮面板 (分身) — 候场页垫
      const s = calX = {              // 进同一张里 (面板 .cb-card 自带裁形, 真身挂 .cal-x)
        p: 0, v: 0, to: 0, dir: 0, raf: 0, t0: 0, last: 0, root,
        title: root.querySelector(".cal-title"), grid,
        flyL: document.createElement("div"), flyR: document.createElement("div"),
        w: grid.getBoundingClientRect().width,
      };
      s.flyL.className = s.flyR.className = "cal-fly";
      root.classList.add("cal-x");    // 卡变身裁形窗 (候场页在窗里滑, 不漏到卡外)
      calXFlies(s);
      root.appendChild(s.flyL); root.appendChild(s.flyR);
      s.p = calXSoft(dx, s.w);        // 从锁轴这一步起跟手 (起步这 12px 是一档定格, 手势
      calXApply(s, s.p);              // 惯例 — 再小就跟竖滚分不清了)
    } else if (!axis && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      x0 = null;                      // 竖滚: 让给页面, 翻月不抢
    } else if (axis === "x" && calX) {
      hist.push({ x: t.clientX, t: performance.now() });
      if (hist.length > 6) hist.shift();
      calX.p = calXSoft(dx, calX.w);  // 跟手: 软阻尼后的横位直接上屏
      calXApply(calX, calX.p);
    }
  }, { passive: true });
  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", end);
  el.addEventListener("click", e => {               // 捕获先于格子/‹›: 误触当场吃掉
    if (!ate) return;
    e.stopPropagation(); e.preventDefault();
    ate = false;
  }, true);
}
calSwipe($("#cal-card"), () => true);
calSwipe($("#cal-bar"), () => calFloat);

function calFloatStop() {         // 停在途的收拢/长开弹簧 (交还真身/重开先来): 它管的帧全让出来
  if (calFloatT) {
    cancelAnimationFrame(calFloatT.raf);
    calFloatT = null;
  }
}

function calFloatTween(to, after) {   // 面板开合的弹簧: p 从眼下的值弹簧到 to (0 悬浮日历
                                      // ↔ 1 胶囊) — 面板展开/收回/收回途中回滚弹回走这一副
                                      // (上面滑屏那副临界阻尼弹簧原样搬来推 p — 统一手感:
                                      // 全应用的程序动画一副脾气; 滚动收拢不归它 — 缩放跟
                                      // 手, 弹簧只管没有滚动可跟的面板; 原先 240ms 一口气
                                      // 的大半程挤在前几帧, 稍掉一帧就看见台阶), 逐帧喂
                                      // calDraw。r 只取卡的宽高/横位 (竖滚不动这些),
                                      // 途中列表照滚也不歪
  calFloatStop();
  const r = $("#cal-card").getBoundingClientRect();
  const t0 = performance.now();
  const tw = calFloatT = { to, v: (to - calP) * CAL_P_V0, t0, last: t0, raf: 0 };
  const step = now => {
    if (calFloatT !== tw) return;             // 半路被停/被换: 旧这一趟就地熄火
    const dt = Math.min(0.04, Math.max(0.001, (now - tw.last) / 1000));
    tw.last = now;                            // 卡顿的帧不当长帧算 (弹簧会炸)
    tw.v = Math.max(-CAL_P_VMAX, Math.min(CAL_P_VMAX,
             tw.v + (CAL_P_K * (tw.to - calP) - CAL_P_C * tw.v) * dt));
    calP += tw.v * dt;
    if ((Math.abs(tw.to - calP) < 0.002 && Math.abs(tw.v) < 0.05)
        || now - tw.t0 > CAL_P_TMAX) {        // 到位 (半丝内直接落准) / 兜底熄火
      calP = tw.to;
      calFloatT = null;
      calDraw(r, calP);
      if (after) after();
      return;
    }
    calDraw(r, calP);
    tw.raf = requestAnimationFrame(step);
  };
  tw.raf = requestAnimationFrame(step);
}

function calFloatOpen() {         // 点胶囊: 就地展开成悬浮日历面板, 浮在列表上 —
                                  // 列表纹丝不动 (不再滚回顶), 想去哪天点了日子才走
  const bar = $("#cal-bar");
  if (!calHeld || calFloat) return;
  clearTimeout(calSettleT);       // 手静收场别掺和 (这几百毫秒几何归面板弹簧管)
  calGlideStop();                 // 在途滑屏/收场滑屏也停 (收场早改走弹簧, 一停就真停,
                                  // 不再有掐不断的系统 smooth 滚动) — 点了面板, 列表定格
  calFloat = true;
  bar.classList.add("float");     // css: 分身开 pointer-events — 日子/‹ › 都是它身上的;
                                  // 时间线也让位 (animation:none) — 几何交回行内, 弹簧接管
  if (CAL_TIMELINE)               // 中途点开: 行内几何/淡入淡出还空着 (一直归动画管), 先
    calDraw($("#cal-card").getBoundingClientRect(), calP);   // 把眼下这帧摆进行内 — 不然
                                  // 动画一停, 亮出来的是接管头一帧的旧样子 (闪跳)
  bar.classList.add("morph");     // 壳褪成裁剪窗、皮肤层顶上 (底色/磨砂全在 .morph 样式表
                                  // 那把): 点开这一下就换脸, 不等弹簧头一帧; 途中影子歇着
                                  // (大投影跟着尺寸逐帧重画最吃帧率), 弹簧到位这一下再亮
  bar.style.transform = "none";   // 展开期不吃样式表的 translateX 居中 (与接管同款)
  calFloatTween(0, () => {        // 展开落位: 面板这张脸浮起来了, 影子这才上 (静止的
    calSkin.style.boxShadow = "0 2px 6px rgba(23,30,42,.08), 0 16px 40px rgba(23,30,42,.16)";   // 只画一回, 与日历卡同一副 — 挂皮肤层 (形变期壳不画自己)
  });
}

function calDockOrReturn() {      // 面板收回弹簧落位 (p=1) 的收尾: 真身滚回眼前了直接交还
                                  // (不闪双日历), 没到就歇进胶囊位 (几何交还样式表)
  const bar = $("#cal-bar");
  bar.classList.remove("float");
  if ($("#cal-card").getBoundingClientRect().top > calSlot.top + CAL_EPS) {
    calRelease();                 // 收拢这口气里真身已滚回眼前: 直接交还, 不闪双日历
  } else {
    if (CAL_TIMELINE)               // 时间线收摊 (与滚动路收到头同一套): 不收摊的话动画压
      bar.classList.remove("track");   // 着行内几何 — 落位那刻 scrollY 还在半途时, 胶囊
                                     // 落不了位停在半缩的样子 (淡入淡出弹簧末帧已写对)
    calDocked = true;
    calClear(bar);
  }
}

function calFloatClose() {        // 收回: 面板顺着原路缩回胶囊 (p→1), 列表不动/照滚都行
  if (!calFloat) return;
  calFloat = false;               // 先摘牌: 弹簧路上 calSync 不再二连收
  calSkin.style.boxShadow = "none";   // 落位时亮的那副影子先歇 (途中不逐帧重画 — 挂皮肤层)
  calFloatTween(1, calDockOrReturn);
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
  if (calDocked && !calFloat) {           // 歇在胶囊位时数据变了 (整包重写过胶泡): 分身接着隐、
    twin.style.opacity = "0";             // 胶泡文字接着亮 —— 运动期这两笔 calDraw 逐帧带, 不用管
  }                                       // (胶囊定宽: 运动途中换内容, 终点几何不变, 不用重测)
                                          // 悬浮面板开着时反着: 面板 (分身) 亮、胶泡文字隐
  bar.appendChild(twin);
  calTwin = twin;                         // 逐帧要碰的引用接管那刻缓存, calDraw 不再查 DOM
  calIn = bar.querySelector(".cb-in");
  if (calDocked && !calFloat) calIn.style.opacity = "1";   // 新胶泡没走过 calDraw (样式表默认 0), 歇着也得亮着
}

function calClear(bar) {          // 清行内形变样式, 回样式表世界 (磨砂胶囊)
  bar.style.left = bar.style.top = "";
  bar.style.width = bar.style.height = "";
  bar.style.borderRadius = bar.style.boxShadow = "";
  bar.style.backgroundColor = bar.style.transform = "";
  if (calSkin) calSkin.style.boxShadow = "";   // 皮肤层那副 (面板落位亮的) 影子一并还样式表
}

function calRelease() {           // 交还真身 (此刻分身几何 ≡ 真身)
  const bar = $("#cal-bar"), card = $("#cal-card");
  clearTimeout(calSettleT);
  calHeld = false;
  calDocked = false;
  calPin = "";                    // 翻月的钉跟着交还: 回到日历了, 探测权还给滚动
  card.style.visibility = "";
  bar.style.visibility = "";
  bar.classList.remove("track");  // 时间线收摊: 几何/淡入淡出全交还 (壳这就隐身, 静止胶囊
                                  // 位归样式表 — 下一回接管再挂再烤)
  calClear(bar);
  bar.classList.remove("morph");
  calTwin.remove();
  calTwin = calIn = null;
}

function calTrackBake(r) {         // 烤滚动时间线的变量 (接管/从胶囊位重挂/转屏都来这):
                                    // 卡几何 (r = 真身实时矩形) + 胶囊位 + 起步/收到头的
                                    // 滚位。胶囊位不走 calSlot (歇着时量过的旧值, 转屏就
                                    // 不对了), 照样式表同一道公式现算 — --cal-top 取实算值
  const bar = $("#cal-bar");
  const w = Math.min(innerWidth - 24, 528);            // 胶囊定宽 (与 #cal-bar 样式表同式)
  const left = (innerWidth - w) / 2;                   // 居中 (与 left:50%+translateX 同效)
  const top = parseFloat(getComputedStyle(bar).top);   // 落位线 (--cal-top 实算, 转屏跟手)
  const s0 = scrollY + r.top - top;                    // 卡顶进线那一刻的滚位
  bar.style.setProperty("--col-h", r.height + "px");
  bar.style.setProperty("--col-cl", r.left + "px");
  bar.style.setProperty("--col-cw", r.width + "px");
  bar.style.setProperty("--col-sl", left + "px");
  bar.style.setProperty("--col-sw", w + "px");
  bar.style.setProperty("--col-s0", s0 + "px");
  bar.style.setProperty("--col-s1", s0 + r.height - CAL_H + "px");
}

function calDraw(r, p) {          // 把分身摆到收拢进度 p (0 卡原样 → 1 胶囊) — 面板开合的
                                   // 弹簧逐帧喂它; 老环境 (滚动时间线不认) 的收拢/长回也
                                   // 靠它逐帧。时间线路的收拢几何在样式表 keyframes 里
                                   // (零延迟), 不走这
  const bar = $("#cal-bar");
  const top = calSlot.top;                       // 上边界钉死在落位线
  const bottom = top + r.height - p * (r.height - CAL_H);   // 下边界 (跟手或收场驱动)
  const pinch = calSmooth((p - CAL_W_PINCH) / (1 - CAL_W_PINCH));
  const fade = calSmooth((p - CAL_W_PINCH) / (CAL_FADE - CAL_W_PINCH));
  bar.style.left = `${r.left + (calSlot.left - r.left) * pinch}px`;
  bar.style.top = `${top}px`;
  bar.style.width = `${r.width + (calSlot.width - r.width) * pinch}px`;
  bar.style.height = `${bottom - top}px`;
  if (p >= 1) {                    // 收到头: 位不再动, 壳的胶囊脸 (磨砂/底色/影子/满圆角)
    bar.classList.remove("morph"); // 随 .morph 摘牌整副回来, 皮肤层跟着下屏 — 样式表一把,
    bar.style.backgroundColor = "";   // 行内没挨个写过也就没挨个还的活 (这两行只兜底)
    bar.style.boxShadow = "";
  } else {                         // 在途: .morph 挂上 = 换到形变态 — 壳褪成纯矩形裁剪窗 (圆角
    bar.classList.add("morph");    // 裁合成层子元素要在壳上挂 mask 逐帧重画, 矩形裁是硬件
  }                                // 裁不要钱), 底色/圆角/影子全在皮肤层 (.cb-skin), 磨砂暂撤
  calTwin.style.opacity = String(1 - fade);      // 交叉淡出 (定格快照, 只动合成层)
  calIn.style.opacity = String(fade);            // 胶泡文字交叉淡入
}

function calSettle() {             // 手静 ~180ms 只管长回的收场: 收拢向不归这管 — 缩放全程
                                   // 跟手, 分身下边界贴的就是列表内容的头, 滚到哪停到哪
                                   // 都是稳态 (没有空档, 补拽退役); 长回跟手半路停手,
                                   // 一口气滑回顶交还真身 (要么不播, 播就播完)。滚动每帧
                                   // 重排这个计时 — 惯性没停不触发, 不跟系统惯性抢方向盘;
                                   // 收场走程序滑屏 calGlideTo (与翻月/跳位同一副弹簧,
                                   // 触摸一碰即停, 用户随时能夺回)
  clearTimeout(calSettleT);
  if (!calHeld || calLastY < 0 || calVel > 0) return;   // 没真滚过 (开页恢复滚位)/收拢向停手: 不代劳
  calSettleT = setTimeout(() => {
    if (!calHeld || calFloat || calFloatT || calDocked) return;   // 面板/弹簧在途/歇在胶囊位: 不掺和
    calGlideTo(0);                 // 长回向停手: 半路一口气长回顶
  }, CAL_IDLE);
}

function calViewMon() {            // 列表现在看着哪个月: 月份头横幅撤了, 日组就是月界 —
                                   // 视线线上最靠上那条日组 (从胶囊底下钻出来的头一条) 说了算
  const line = calSlot.top + 44;   // 视线线 = 胶囊高 36 + 8 缝: 钻出胶囊底下才算"看着"
  if (calViewSeq !== calDomSeq) {  // DOM 动过才重查名单 (静态 NodeList 可跨帧持有 — 漏 bump
    calViewGs = document.querySelectorAll(".day-group");   // 会拿 Detached 旧节点, 四处 mutation
    calViewSeq = calDomSeq;        // 点都得记账, 见 calDomSeq)
  }
  const gs = calViewGs;
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

function calSync(spring) {          // 滚一帧对一帧: 缩放全程跟手 (收拢/长回都从滚动几何来) —
                                   // spring = 这一帧是不是真滚动带进来的 (数据刷新对位/开页
                                   // 恢复那脚不算, 不许它们铺路)
  const bar = $("#cal-bar"), card = $("#cal-card");
  const r = card.getBoundingClientRect();
  if (calFloat) {                  // 悬浮面板开着: 用户亲手滑列表才是收起令 — 真身都滚回
                                   // 眼前了 (松手就停在日历里) 面板让位直接交还, 还没到就
                                   // 顺着原路缩回胶囊 (面板自己的弹簧走, 列表照它自己的
                                   // 滚)。自己这趟滑屏不算 (点了日子列表滑过去, calGlide
                                   // 在途; 没起滑屏那下由 calJumpT 短窗兜住) — 面板留着
    if (calGlide || performance.now() - calJumpT < 350) return;
    if (r.top > calSlot.top + CAL_EPS) {
      calFloatStop();
      calFloat = false;
      bar.classList.remove("float");
      calRelease();
    } else {
      calFloatClose();
    }
    return;
  }
  if (calFloatT) {                 // 面板收回的弹簧在途: 这几帧几何归它 (滚动事件别抢方向盘 —
                                    // 面板浮在列表上, 收回是它自己的动画, 跟滚动几何对不上号)
    if (calFloatT.to === 1 && r.top > calSlot.top + CAL_H) {
      calFloatTween(0, calRelease);   // 收回半途回滚过线 (面板收回又反悔): 反着弹回长开,
                                      // 到位交还真身 (p=0 ≡ 卡原样, 接缝不跳也不僵等)。
                                      // 认真反悔得过线一整个胶囊高 — 快滚撞到文档底、
                                      // 系统回弹的几像素毛刺不再把弹簧来回拨 (= 收拢
                                      // 途中一阵发抖); 没过线的回滚照旧让弹簧收完,
                                      // 落位时 calDockOrReturn 认线交还 (与从前一样)
    }
    calSettle();                   // 计时照排 (弹簧在途不动作, 面板收完真停手了才轮到长回收场)
    return;
  }
  let justTook = false;
  const slot = calHeld ? calSlot : bar.getBoundingClientRect();  // 隐身仍占位, 自由态量得到
  if (!calHeld) {
    if (r.top > slot.top + CAL_EPS) return;   // 卡顶还在落位线下方: 真身自己走
    calSlot = slot;                           // 接管: 分身 = 日历, 真身隐身
    calRetwin();
    card.style.visibility = "hidden";
    bar.style.visibility = "visible";
    bar.style.transform = "none";   // 形变期不吃样式表的 translateX 居中 (就写这一回;
                                    // 时间线路 .track 规则也钉着 none — 双保险);
                                    // 换肤 (.morph: 壳褪成裁剪窗, 皮肤层顶上, 磨砂/影子
                                    // 暂歇) 全在样式表 — 行内一个字不用写 (帧率)
    calHeld = true;
    if (calGlide && calGlide.hold) {  // 日历自己点的跳位 (点日子/翻月联动) 滚到这: 日历
      calFloat = true;                // 不收拢 — 原地化成悬浮面板浮在列表上 (p=0 卡原样,
      clearTimeout(calSettleT);       // 接缝零跳), 列表顺着滑, 面板留着接着挑日子; 只有
      bar.classList.add("float", "morph");   // 用户亲手滚列表才收 (顶上那分支)。与
      calP = 0;                       // calFloatOpen 同一副脸 (float 开 pointer-events/
      calDraw(r, 0);                  // 时间线让位, morph 换皮肤层), 只是 p 本来就在 0 —
      return;                         // 不用弹簧从胶囊长开, 行内摆一回即成
    }
    if (CAL_TIMELINE) {                       // 时间线路: 几何全归样式表那把 keyframes — 卡
      calTrackBake(r);                        // 几何/胶囊位/起收滚位烤进变量, .track 一挂
      bar.classList.add("track");             // 滚到哪帧同步到哪 (脚本写天生慢一拍, 快滚时
    }                                         // 分身下边界和内容错开一帧滚距 = 一顿一顿)
    justTook = true;
  } else if (r.top > calSlot.top + CAL_EPS) { // 滚回来了: 交还真身 (此刻分身几何 ≡ 真身)
    calRelease();
    return;
  }
  const top = calSlot.top;
  const bottom = Math.max(r.bottom, top + CAL_H);
  const p = Math.min(1, Math.max(0,             // 收拢进度: 0 卡原样 → 1 胶囊
    (r.height - (bottom - top)) / (r.height - CAL_H)));
  const mon = p > CAL_W_PINCH ? calViewMon() : "";   // 列表滚到哪个月了 (先读后写: 探测跟几何同
                                   // 一批读, 不多排一遍)。胶泡文字还没淡进来 (p≤收窄线, 字不
                                   // 可见) 的那程不探测 — 逐帧路径上最贵的一步白跑 (帧率)
  calP = p;                                     // 记下最新进度: 面板弹簧从眼下的样子接着走
  if (calDocked && p < 1) {         // 歇在胶囊位又被往回滚: 从胶囊位接着跟手长回 (胶囊定宽,
    calDocked = false;              // 静止位接管那刻量过一直有效, 不用重测)
    bar.classList.add("morph");     // 换回形变态的脸 (时间线路几何动画自己往回走; 老路
                                    // calDraw 逐帧也会挂 — 两头都只这一下, 不逐帧)
    if (CAL_TIMELINE) {             // 时间线重挂: 歇着时几何归了样式表 (转屏跟手), 重上
      calTrackBake(r);              // 一趟得把变量重烤一遍 (这刻真身矩形还在线上)
      bar.classList.add("track");
    }
    bar.style.transform = "none";   // 形变期不吃样式表的 translateX 居中 (老路要行内;
  }                                 // 时间线路 .track 规则也钉着 — 双保险)
  if (mon && mon !== calFeedMon && !calPin) {   // 翻进新的月份: 只换中间那层字 (月份换了
                                    // 才动 DOM, 不逐帧写); 翻月钉着时让位 — 钉着的月说了算,
                                    // 跳位后的余波滚动事件别把用户翻的月又盖回旧月
    calFeedMon = mon;               // (‹ › 和窗口常驻不重搭 — 同 calBarShell, 滚动途中
    const mv = $("#cal-bar .cb-mv");   //  换报也不闪按钮)
    if (mv) mv.innerHTML = calCapHtml(mon);
  }
  if (!calDocked) {
    if (spring && calVel > 0 && p < 1) {   // 收拢向的滚动顺手铺路 — 读 (scrollHeight) 必须排在写
      const doc = document.documentElement;   // (calDraw) 前头: 写完再读就是逼着一帧排两遍布局 (帧率)
      while (doc.scrollHeight - scrollY - innerHeight < innerHeight * 1.5
             && feedDrawn < feedGroups.length) drawMore();
      // ↑ 这一滚的惯性要滚多远不可知, 底下哨兵没及时带出内容时文档先到得底 — 滚动被
      //   钳在底上, 系统就地回弹, 跟手的分身跟着一阵发抖 (下面的内容没补上来那毛病)。
      //   先把底下铺出一屏半, 惯性有处去 (追加都在视口下方, 眼前画面不动; 与滑屏
      //   "目标压着文档底先画够高"同一招)
    }
    if (!CAL_TIMELINE || justTook)  // 几何: 老环境逐帧摆 (滚多快收多快, 滚停就停在这高度,
      calDraw(r, p);                // 任意高度都是稳态); 时间线路几何在样式表 keyframes 里
                                    // 零延迟跟滚 — 只有接管头一帧摆一回兜底 (动画若没接上
                                    // 不破相), 之后行内全空, 动画说了算
    if (CAL_TIMELINE && justTook)
      bar.style.top = "";           // top 不留行内: 样式表 --cal-top 转屏跟手 (动画不动画它)
    if (p >= 1) {                   // 收到头: 歇进胶囊位, 几何交还样式表 (居中 + 定宽) ——
      bar.classList.remove("morph");   // 磨砂胶囊脸整副回来 (老路这活在 calDraw 里; 时间
                                    // 线路几何已到 s1 恒胶囊位, 这一下只换脸)
      if (CAL_TIMELINE) {           // 时间线收摊: 歇着归样式表管 (转屏跟手), 往回滚那下
        bar.classList.remove("track");   // un-dock 再重挂重烤; 淡入淡出跟着还样式表 —
        calTwin.style.opacity = "0";    // 歇着的胶囊态行内钉住 (老路这俩是 calDraw 收到头
        calIn.style.opacity = "1";      // 那帧写的同值 — 接缝不跳, 胶囊文字不凭空消失)
      }
      calDocked = true;             // 胶泡以后再变 (翻月/记账), ‹ › 和宽度都纹丝不动
      calClear(bar);
    }
  }
  calSettle();                      // 手要是停在这半路: 长回向才收场 (收拢向停哪算哪)
}

addEventListener("scroll", () => {     // 滚一帧追一帧 (rAF 节流); 滚动方向也记下 (收拢向顺带
                                      // 铺路, 停手只认长回向收场)
  if (calFrame) return;
  calFrame = true;
  requestAnimationFrame(() => {
    calFrame = false;
    const y = scrollY;
    if (calLastY < 0) calVel = y - calBaseY;        // 头一滚: 没上一帧可比, 从开机位起算
    else if (y !== calLastY) calVel = y - calLastY; // (开页必在顶 → 头一滚必是往下)
    calLastY = y;
    calSync(true);
  });
}, { passive: true });

addEventListener("resize", () => {     // 转屏/分屏: 真身几何/胶囊位/落位线全变了, 时间线
  if (CAL_TIMELINE && calHeld && !calDocked && !calFloat && !calFloatT)
    calTrackBake($("#cal-card").getBoundingClientRect());   // 烤的变量重烤一遍 (老路逐帧
                                       // 现量天然跟手不用管; 形变中真身隐着也量得到 — 占位还在)
});

// 观察器只当开机一脚: 恢复滚位开页没有 scroll 事件, 靠它的初次回调带进 calSync
// (不带弹簧 — 开页恢复不演收拢动画, 真滚起来才有动画)
new IntersectionObserver(() => calSync(false),
  { rootMargin: "-40px 0px 0px 0px" }).observe($("#cal-card"));
// 翻月的解钉 + 滑屏的让权: 钉着的月只在"没人动"时有效 — 翻完那一下, 跳位
// 自身的滚动事件、惯性/收场余波都不该把月份盖回去; 手指真落下 (或桌面滚轮/
// 按下) 才算用户要动, 交还滚动探测权, 在途的程序滑屏也一并停下 (用户随时
// 能夺回)。点 ‹ › 的那下触摸先解旧钉/停旧滑, 紧跟的翻月再钉新月再起新滑,
// 顺序天然对
for (const ev of ["touchstart", "pointerdown", "wheel"])
  addEventListener(ev, () => { calPin = ""; calGlideStop(); }, { passive: true, capture: true });
$("#cal-bar").addEventListener("click", e => {
  if (calFloat) {                 // 悬浮日历开着: 这一下落在面板身上
    const day = e.target.closest("button[data-date]");
    if (day) {                    // 点了日子: 面板留着, 列表顺着滑到那天 (这就是"去") —
                                    // 只有用户亲手滑列表, 面板才收 (起步记时刻, 见 calJumpT)
      calJumpT = performance.now();
      jumpToDate(day.dataset.date);
      return;
    }
    const head = e.target.closest(".cal-head button");
    if (head)                     // 面板里的 ‹ ›: 只翻日历的月 (列表不去 — 点了日子才去);
      shiftCal(head.parentElement.firstElementChild === head ? -1 : 1);   // 头一枚是 ‹ (分身
    return;                       // 没了 id, 认结构)。点在面板别处: 不动 (滑列表才收)
  }
  const nav = e.target.closest(".cb-nav");
  if (nav) {                      // 气泡上的 ‹ ›: 从胶泡正报着的月翻起 (明细联动跟着挪)
    shiftCal(+nav.dataset.d, calFeedMon || calMon);
    return;
  }
  calFloatOpen();                 // 点胶囊: 日历就地展开成悬浮面板 (列表纹丝不动)
});
