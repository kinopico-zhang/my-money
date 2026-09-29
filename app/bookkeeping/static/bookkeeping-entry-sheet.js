// bookkeeping-entry-sheet — My Money 记/改一笔 (底部弹层):
// 顶部收入/支出标签页 + 金额行类别牌 (点开弹类别树选层: 大类手风琴, 点开才见小类)
// + 5×3 常见类别格 + 时间 iOS 闹钟式拨轮 (日期/时/分三列) + 标签列表层
// (单选一枚选中即收, 创建时间新→旧, 顶部可打新标签) + 备注浮层输入
// (点备注行弹, 从行原位升起 rides 系统键盘; 系统键盘回车/点别处收) + 整层手势
// (左右划换收支 — 只换类别那一摊; 任意部位下拽关层) + 删除/点行改账。
// 金额键盘常驻吸底 (amount-pad), 键盘上的「完成」就是保存。
// 拆自 bookkeeping.js (结构化重构, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
"use strict";
/* global $, esc, entries, dirty, persist, render, scheduleSync,
          parseTags, todayStr, nowTime, pad, catIcon, catTree,
          refreshAmountPreview */
/* exported closeSheet, fillChips, whenPicked */

// ---------- 记/改一笔 (底部弹层) ----------
let editingId = null;
let sheetKind = "expense";
let sheetCat = "";

// 常见类别 (默认只铺这些, 恰好填满 5×3): 按组合名存, 树里没有的自动落空 (类别树各家不同)
const COMMON_CATS = {
  expense: ["餐饮/早餐", "餐饮/午餐", "餐饮/晚餐", "餐饮/夜宵", "餐饮/买菜原料",
            "餐饮/饮料水果", "餐饮/零食", "交通/充电", "交通/打车", "交通/地铁",
            "交通/公交", "交通/加油", "居家/水电燃气", "居家/手机电话", "购物/家居百货"],
  income: ["工资薪水", "奖金", "兼职外快", "红包", "利息", "基金", "股票",
           "余额宝", "分红", "营业收入", "工程款", "福利补贴", "礼金", "顺风车", "赔付款"],
};

function treeFor(kind) {          // 当前收支方向的类别树 (离线用缓存)
  return (catTree && catTree[kind]) || [];
}

/* ---------- 标签: 点「标签」牌弹列表 (创建时间新→旧), 单选一枚选中即收 ---------- */
let sheetTags = [];               // 本笔的标签 (单选一枚; 旧账多枚的照原样带出)

function updateTagPill() {        // 标签牌: 已选的空格并排 (每枚前带 # — 主页账目行同款), 没选给占位灰字
  const el = $("#tag-label");
  el.textContent = sheetTags.length ? sheetTags.map(t => "#" + t).join(" ") : "标签";
  el.classList.toggle("empty", !sheetTags.length);
}

function tagLib() {               // 列表数据: 本账本新打的在最前 (最新), 挖财种子按创建时间倒排
  const seen = new Set(), local = [];
  for (const e of entries) {
    if (e.deleted) continue;
    for (const t of e.tags || [])
      if (t && !seen.has(t)) { seen.add(t); local.push(t); }
  }
  const seeds = ((catTree && catTree.tags) || [])    // 旧缓存里 tags 还是串数组, 兼一手
    .map(t => typeof t === "string" ? { name: t, created: "" } : t);
  const seedNames = new Set(seeds.map(s => s.name));
  return [...local.filter(t => !seedNames.has(t)).reverse()
             .map(name => ({ name, created: "" })),
          ...seeds];
}

function tpRow(t) {                // 名字前带 # (主页账目行同款 — 一眼认得出这截是标签; data-tag 留原名)
  return `<button type="button" class="cp-row${sheetTags.includes(t.name) ? " on" : ""}"` +
    ` data-tag="${esc(t.name)}"><span class="cp-name">#${esc(t.name)}</span>` +
    (t.created ? `<span class="tp-date">${esc(t.created.replace(/-/g, "/"))}</span>` : "") +
    `<span class="cp-check"></span></button>`;
}

function openTagPick() {
  const lib = tagLib();
  const pend = sheetTags                                  // 已选但还没存进账本的 (刚打
    .filter(t => !lib.some(s => s.name === t))            // 的新标签): 铺在最前也亮着
    .map(name => ({ name, created: "" }));
  $("#tp-list").innerHTML = [...pend, ...lib].map(tpRow).join("");
  $("#tp-new").value = "";
  const pick = $("#tag-pick");
  pick.hidden = false;
  requestAnimationFrame(() => pick.classList.add("on"));
  const onRow = $("#tp-list .cp-row.on");        // 已选的滚到眼前
  if (onRow) onRow.scrollIntoView({ block: "center" });
}

function closeTagPick() {
  const pick = $("#tag-pick");
  pick.classList.remove("on");
  setTimeout(() => { pick.hidden = true; }, 250);
}

function addTypedTag() {          // 顶部输入框: 打的新标签直接选作这一笔的那一枚
  const [tag] = parseTags($("#tp-new").value);
  if (!tag) return;
  sheetTags = [tag];
  $("#tp-new").value = "";
  updateTagPill();
  closeTagPick();                 // 与点列表同款: 选中即收
}

/* ---------- 备注: 点行弹浮层输入, 从行原位升起 rides 系统键盘 (数字键盘让位, 页面不动) ---------- */
let kbSettle = null;              // 键盘升起是一串 resize: 停 80ms 才贴实
let kbFrom = 0;                   // 出发线: 浮层底边 (备注行那里), 升键过程不往这线以下挪

function updateNoteRow() {        // 备注行: 有字显字, 没字灰提示 (与浮层输入实时同文)
  const v = $("#f-note").value.trim();
  const el = $("#note-label");
  el.textContent = v || "输入备注...";
  el.classList.toggle("empty", !v);
}

function placeNoteKb(bottom) {    // 贴系统键盘上方; bottom 不给 = visual viewport 底边
  const bar = $("#note-kb");
  if (bar.hidden) return;
  const vv = window.visualViewport;
  if (bottom == null) bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  bar.style.transform = `translateY(${bottom - bar.offsetHeight}px)`;
}

function openNoteKb() {           // 同一手势里聚焦, iOS 才肯弹系统键盘
  const bar = $("#note-kb");
  bar.hidden = false;
  const top = $("#note-btn").getBoundingClientRect().top;
  bar.style.transition = "none";             // 无声钉在备注行原位: 是那行自己升起来, 不是天降新框
  bar.style.transform = `translateY(${top}px)`;
  void bar.offsetWidth;                      // 先提交起始位, 之后的挪动才走缓动
  bar.style.transition = "";
  kbFrom = bar.getBoundingClientRect().bottom;
  $("#amt-pad").style.visibility = "hidden";     // 数字键盘让位 (占位留着, 页面不动)
  $("#f-note").focus({ preventScroll: true });   // 不让 iOS 顺势推页面 (其他界面不动)
  if (!window.matchMedia("(pointer: coarse)").matches)
    placeNoteKb();                           // 桌面没有系统键盘: 从行位滑到屏底
}

function closeNoteKb() {
  clearTimeout(kbSettle);
  const bar = $("#note-kb");
  if (bar.hidden) return;
  bar.hidden = true;
  bar.style.transform = "";
  $("#f-note").blur();
  $("#amt-pad").style.visibility = "";
  updateNoteRow();
}

function chipsHtml(kind, cat) {     // 格子页 html (真页与横划跟手的「对面页」共用一份)
  const all = [];                 // [组合名, 显示名] (图标按组合名查: 子类有自己的)
  for (const {name: top, children: kids} of treeFor(kind)) {
    if (kids.length) for (const kid of kids) all.push([top + "/" + kid, kid]);
    else all.push([top, top]);   // 没子类的大类自己就是可选类别
  }
  const byKey = new Map(all);
  return COMMON_CATS[kind]                       // 常见格: 树里有的才上
    .filter(k => byKey.has(k)).map(k => [k, byKey.get(k)])
    .map(([val, name]) =>
      `<button class="tile${cat === val ? " on" : ""}" data-cat="${esc(val)}">` +
      `<span class="ti">${catIcon(val, kind)}</span><span class="tn">${esc(name)}</span></button>`).join("");
}

function fillChips() {
  $("#cat-tiles").innerHTML = chipsHtml(sheetKind, sheetCat);
}

// 金额行左边的类别牌: 当前类别的图标+名字 (没选给占位灰字); 选上了牌底翻白点亮
function updateAmtHead() {
  $("#amt-cat-ic").innerHTML = catIcon(sheetCat, sheetKind);
  const name = $("#amt-cat-name");
  name.textContent = sheetCat ? sheetCat.split("/").pop() : "选类别";
  name.classList.toggle("empty", !sheetCat);
  $("#amt-cat").classList.toggle("on", !!sheetCat);
}

/* ---------- 类别树选层: 点「选类别」弹整棵树 (常见格之外的都在这) ---------- */
function cpRow(val, name, solo) {   // solo: 没小类的大类 —— 与大类标题同一副面孔, 点一下直选
  return `<button type="button" class="cp-row${solo ? " cp-solo" : ""}${sheetCat === val ? " on" : ""}"` +
    ` data-cat="${esc(val)}"><span class="cp-ic">${catIcon(val, sheetKind)}</span>` +
    `<span class="cp-name">${esc(name)}</span><span class="cp-check"></span></button>`;
}

function openCatPick() {
  // 手风琴: 大类带着图标收着进 (小类不铺开), 点哪个大类才亮哪个的小类;
  // 没小类的大类 (房贷/团队管理这些自建的) 不参与手风琴 —— 同一副面孔铺成一级行, 点一下直接选中
  $("#cp-list").innerHTML = treeFor(sheetKind).map(({name: top, children: kids}) =>
    kids.length
      ? `<div class="cp-group"><button type="button" class="cp-top">` +
        `<span class="cp-ic">${catIcon(top, sheetKind)}</span><span class="cp-name">${esc(top)}</span><span class="cp-n">${kids.length}</span>` +
        `<svg class="cp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` +
        `<div class="cp-kids">${kids.map(kid => cpRow(`${top}/${kid}`, kid)).join("")}</div></div>`
      : `<div class="cp-group">${cpRow(top, top, true)}</div>`).join("");
  const pick = $("#cat-pick");
  pick.hidden = false;
  requestAnimationFrame(() => pick.classList.add("on"));
  const onRow = $("#cp-list .cp-row.on");   // 改账时已选的: 亮出所在大类并滚到眼前
  if (onRow) {
    const g = onRow.closest(".cp-group");
    if (g) g.classList.add("open");
    onRow.scrollIntoView({ block: "center" });
  }
}

function closeCatPick() {
  const pick = $("#cat-pick");
  pick.classList.remove("on");
  setTimeout(() => { pick.hidden = true; }, 250);
}

/* ---------- 时间拨轮 (iOS 闹钟式): 日期 + 时 + 分三列, 弯面渐隐居中高亮 ----------
   whenVal 是唯一事实源: 开层按它摆轮位, 拨定回写它, 保存 (whenPicked) 读它。
   时/分循环轮: 一套值摆 7 份, 拨出中段就在停下时无声跳回 (值不变);
   日期轮不循环: 窗口 ±120 天, 拨到边沿换一扇窗重摆。 */
const WP_ITEM = 40;               // 一格高 (高亮带同高)
const WP_COPIES = 7;              // 循环轮套数 (奇数, 中段 3)
const MID_COPIES = 3;
const WP_DEG = 20;                // 每格转角 (度): 40px 弧长 → 圆筒半径 ≈ 115px
const WP_R = WP_ITEM / (WP_DEG * Math.PI / 180);   // 圆筒半径 (各项拼在同一只筒上)
const WP_VIEW = 620;              // 与 css .wp-scroll 的 perspective 同值 (算远一档缩一档)
const WP_LIVE = 3;                // 可见带半宽 (格): 轮框 220px ≈ ±2.75 格, 带外进停机位
const WP_WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const whenVal = { d: new Date(), hh: 0, mm: 0 };

function fmtWhen() {              // 时间牌同款写法: 2026/01/01 22:41
  const d = whenVal.d;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ` +
         `${pad(whenVal.hh)}:${pad(whenVal.mm)}`;
}

function whenPicked() {           // saveEntry 用: 拆回 date/time 进条目
  const d = whenVal.d;
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
           time: `${pad(whenVal.hh)}:${pad(whenVal.mm)}` };
}

function updateWhenPill() { $("#when-label").textContent = fmtWhen(); }

function wpFace(scroll) {         // 弯面+渐隐: 各项按同一只圆筒的角位摆 — 绕自身中心转切角,
  const mid = scroll.clientHeight / 2;   // 挪到弧上投影位、按远近缩一档 (连起来是真滚筒的圆弧,
  for (const it of scroll.children) {    // 但版心不挪 — 吸附/裁剪认的就是版心, 远处项也不荡回来)
    if (!it.classList.contains("wp-it")) continue;
    const d = (it.offsetTop + WP_ITEM / 2 - scroll.scrollTop - mid) / WP_ITEM;
    if (Math.abs(d) >= WP_LIVE) {        // 可见带外: 进停机位摆平 (裁剪框外, 反正看不见)
      if (it.dataset.f !== "park") {     // 写一次就不再动 — 整列 400+ 项滚起来也轻
        it.dataset.f = "park";
        it.style.transform = ""; it.style.opacity = "";
      }
      continue;
    }
    const rad = d * WP_DEG * Math.PI / 180;          // 弧上角位
    const dy = WP_R * Math.sin(rad) - d * WP_ITEM;   // 版心 → 弧上投影位 (近处 ≈ 0, 吸附不跑)
    const sc = WP_VIEW / (WP_VIEW + WP_R * (1 - Math.cos(rad)));   // 远一档小一档
    const q = d / 2.9;                               // 渐隐: 近处饱满, 临带归零 (遮罩外双保险)
    const op = Math.max(0, 1 - q * q).toFixed(2);
    const f = d.toFixed(3) + "/" + op;       // 值没变的项不重排
    if (it.dataset.f === f) continue;
    it.dataset.f = f;
    it.style.transform = `translateY(${dy.toFixed(2)}px) scale(${sc.toFixed(4)})` +
      ` rotateX(${(-d * WP_DEG).toFixed(2)}deg)`;
    it.style.opacity = op;
  }
}

function wireWheel(scroll, onIdx) {   // 滚动帧里整列弯面; 停 130ms 视为拨定
  let tick = false, settle = null;
  scroll.addEventListener("scroll", () => {
    if (!tick) {
      tick = true;
      requestAnimationFrame(() => { tick = false; wpFace(scroll); });
    }
    clearTimeout(settle);
    settle = setTimeout(() => onIdx(Math.round(scroll.scrollTop / WP_ITEM)), 130);
  }, { passive: true });
}

function fillLoop(scroll, len, text, cur) {   // 循环轮摆内容: 一套 7 份, 停在中段
  let html = '<div class="wp-pad"></div>';
  for (let c = 0; c < WP_COPIES; c++)
    for (let i = 0; i < len; i++) html += `<div class="wp-it">${text(i)}</div>`;
  scroll.innerHTML = html + '<div class="wp-pad"></div>';
  scroll.scrollTop = (MID_COPIES * len + cur) * WP_ITEM;
  wpFace(scroll);
}

function wireLoop(scroll, len, onPick) {
  wireWheel(scroll, idx => {
    const v = ((idx % len) + len) % len;  // 循环轮: 哪一份里的同值都等价
    const home = MID_COPIES * len + v;
    if (Math.abs(idx - home) > len) {     // 拨出中段: 无声跳回 (停位不跳值)
      scroll.scrollTop = home * WP_ITEM;
      wpFace(scroll);
    }
    onPick(v);
  });
}

let wpDates = [];                 // 日期轮当前窗口 (选中项 ±120 天)
function wpDateText(d) {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${WP_WEEK[d.getDay()]}`;
}

function wpDateRows() {           // 今天 = 整条轮的锚点: 那格「今天」打头 (年份让位) + 挂 .today (样式另给)
  const t = new Date();
  const isToday = d => d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  return wpDates.map(d => {
    const td = isToday(d);
    return `<div class="wp-it${td ? " today" : ""}">${td
      ? `今天 · ${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${WP_WEEK[d.getDay()]}`
      : wpDateText(d)}</div>`;
  }).join("");
}

function buildDateWheel(sel) {    // 以 sel 为中心重摆窗口, 轮位停在 sel
  const base = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() - 120);
  wpDates = Array.from({ length: 241 }, (_, i) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
  const scroll = $("#wp-date");
  scroll.innerHTML = '<div class="wp-pad"></div>' + wpDateRows() + '<div class="wp-pad"></div>';
  scroll.scrollTop = wpDates.findIndex(d => d.getTime() === sel.getTime()) * WP_ITEM;
  wpFace(scroll);
}

function wireDateWheel() {
  wireWheel($("#wp-date"), idx => {
    idx = Math.max(0, Math.min(wpDates.length - 1, idx));
    whenVal.d = wpDates[idx];
    if (idx < 15 || idx > wpDates.length - 16)
      buildDateWheel(whenVal.d);       // 拨到窗口边沿: 换一扇窗, 停位照旧
    updateWhenPill();
  });
}

function openWhenPick() {
  const pick = $("#when-pick");
  pick.hidden = false;                 // 先显示再摆位 (hidden 没有高度, scrollTop 立不住)
  buildDateWheel(whenVal.d);
  fillLoop($("#wp-hour"), 24, i => `${pad(i)}时`, whenVal.hh);
  fillLoop($("#wp-min"), 60, i => `${pad(i)}分`, whenVal.mm);
  requestAnimationFrame(() => pick.classList.add("on"));
}

function closeWhenPick() {
  const pick = $("#when-pick");
  pick.classList.remove("on");
  setTimeout(() => { pick.hidden = true; }, 250);
}

function openSheet(entry) {
  closeNoteKb();                  // 备注浮层若还开着, 先收 (键盘跟着落)
  editingId = entry ? entry.id : null;
  sheetKind = entry ? entry.kind : "expense";
  document.body.dataset.kind = sheetKind;    // 方向配色跟走 (支出红/收入绿)
  sheetCat = entry ? entry.category : "";
  $("#kind-seg").querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.dataset.kind === sheetKind));
  $("#f-amount").value = entry ? entry.amount : "";
  if (entry) $("#f-amount").dataset.fresh = "1";   // 带出的旧金额: 首个数字键 = 重打 (amount-pad 里消费)
  else delete $("#f-amount").dataset.fresh;
  // 时间拨轮的初值: 新记一笔默认此刻, 旧账没记时刻的按 00:00 露出来 (改存就补上)
  const day = (entry && entry.date) || todayStr();
  const clock = entry ? (entry.time || "00:00") : nowTime();
  const [y, mo, da] = day.split("-").map(Number);
  whenVal.d = new Date(y, mo - 1, da);
  [whenVal.hh, whenVal.mm] = clock.split(":").map(Number);
  updateWhenPill();
  $("#f-note").value = entry ? entry.note : "";
  updateNoteRow();
  sheetTags = entry ? [...(entry.tags || [])] : [];
  updateTagPill();
  $("#sheet-del").hidden = !entry;
  fillChips();
  updateAmtHead();
  const mask = $("#sheet-mask"), sheet = $("#sheet");
  mask.hidden = false; sheet.hidden = false;
  requestAnimationFrame(() => { mask.classList.add("on"); sheet.classList.add("on"); });
  document.body.style.overflow = "hidden";
  refreshAmountPreview();       // 键盘常驻: 开层即有结果预览
}

function closeSheet() {
  closeCatPick();               // 类别选层若还开着, 跟着收
  closeWhenPick();              // 时间拨轮同理
  closeTagPick();               // 标签列表同理
  closeNoteKb();                // 备注浮层同理 (键盘落, 数字键盘回位)
  const mask = $("#sheet-mask"), sheet = $("#sheet");
  mask.classList.remove("on"); sheet.classList.remove("on");
  setTimeout(() => { mask.hidden = true; sheet.hidden = true; }, 250);
  document.body.style.overflow = "";
  editingId = null;
}

/* 下滑关闭 (与充电详情/轨迹弹层同一手法)。不用 setPointerCapture:
   iOS Safari 对 touch 指针 capture 会当场 pointercancel (手指一动事件
   就被系统收走), move/up 挂 window 级 —— 不捕获手指出界照样收。 */
(() => {
  const sheet = $("#sheet"), zone = $("#grab-zone");
  let y0 = null, dy = 0;
  const move = e => {
    dy = Math.max(0, e.clientY - y0);      // 只往下拖有效, 往上顶不抬层
    sheet.style.transition = "none";       // 拖动跟手, 不吃 .25s 缓动
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const release = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    if (y0 == null) return;
    sheet.style.transition = ""; sheet.style.transform = "";
    if (dy > 90) closeSheet();             // 拉过 90px = 明确想关; 否则弹回
    y0 = null;
  };
  zone.addEventListener("pointerdown", e => {
    y0 = e.clientY; dy = 0;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  });
  zone.addEventListener("click", () => {   // 点一下把手也关 (拖过 8px 不算点)
    if (dy > 8) { dy = 0; return; }
    closeSheet();
  });
})();

/* 整层手势 (触屏): 左右划换收支 (划一下只换类别那一摊 — 金额/备注/键盘都不动),
   按住任意部位下拽关层 (把手那一条走 pointer 版还带点一下关, 这里让给它)。
   横划是跟手的: 定轴后格子跟着指尖走, 对面那页从边上同步滑进来, 松手拖过小半屏
   (或甩得够快) 才真换、不过线弹回; 划/拽过的那一下点击当场吃掉 (不顺着误触格子);
   层内容超高的机器下拽让给滚动。 */
(() => {
  const sheet = $("#sheet");
  let x0 = null, y0 = 0, axis = "", dy = 0, ate = false;
  const solid = () => sheet.scrollHeight <= sheet.clientHeight + 1;   // 没超高: 整层拽得动
  const settle = () => { x0 = null; axis = ""; dy = 0; };

  let drag = null;               // 横划拖动中: {target/live/dir/anchorX/lastX/lastT/vx/px/ghost}
  let flight = null;             // 松手后的滑翔: 两页过渡到位才落状态 (影子撤走)
  const finishFlight = () => {   // 滑翔没落完又开划: 当场兑现 (状态落地, 影子撤走)
    if (!flight) return;
    clearTimeout(flight.t);
    const f = flight; flight = null;
    if (f.ghost) f.ghost.remove();
    f.tiles.style.transition = ""; f.tiles.style.transform = "";
    if (f.kind) switchKind(f.kind, true);
  };

  const dragStart = (target, t, ts) => {   // 定轴那刻: 摆好「对面页」(盖在真格子上的影子)
    ate = true;
    const live = target !== sheetKind;     // 已在这边还往同边划: 只给橡皮筋的劲道
    drag = { target, live, dir: target === "expense" ? -1 : 1,
             anchorX: t.clientX, lastX: t.clientX, lastT: ts, vx: 0, px: 0 };
    if (live) {
      const tiles = $("#cat-tiles");
      const g = document.createElement("div");
      g.className = "cat-tiles cat-ghost";
      const top = sheetCat.split("/")[0];  // 换过去大类还在: 类别照带; 不在会清空 — 影子同款
      g.innerHTML = chipsHtml(target,
        treeFor(target).some(x => x.name === top) ? sheetCat : "");
      g.style.top = tiles.offsetTop + "px";
      g.style.left = tiles.offsetLeft + "px";
      g.style.width = tiles.clientWidth + "px";
      sheet.appendChild(g);
      drag.ghost = g;
    }
    settle();                              // 定轴后 drag 接管, x0 不再用了
  };

  const dragMove = e => {                  // 跟手: 真页随指尖, 影子页对齐着从边上进来
    e.preventDefault();                    // 拖动说了算, 不让层顺势滚/橡皮筋
    const t = e.touches[0];
    drag.vx = (t.clientX - drag.lastX) / Math.max(1, e.timeStamp - drag.lastT);
    drag.lastX = t.clientX; drag.lastT = e.timeStamp;
    const tiles = $("#cat-tiles");
    const w = tiles.clientWidth || 1;
    const raw = t.clientX - drag.anchorX;
    drag.px = drag.live ? Math.max(-w, Math.min(w, raw))   // 真划: 1:1 到一整页为止
                        : Math.max(-72, Math.min(72, raw * .18));   // 没得换: 阻尼一小截
    tiles.style.transition = "none";
    tiles.style.transform = `translateX(${drag.px}px)`;
    if (drag.ghost) {
      drag.ghost.style.transition = "none";
      drag.ghost.style.transform = `translateX(${drag.px - drag.dir * w}px)`;
    }
  };

  const dragEnd = () => {                  // 松手: 过小半屏或甩得够快 = 换, 否则弹回
    const d = drag; drag = null;
    const tiles = $("#cat-tiles");
    const w = tiles.clientWidth || 1;
    const go = d.live && (Math.abs(d.px) > w * .3 || Math.abs(d.vx) > .5);
    const ease = "transform .26s cubic-bezier(.25,.8,.3,1)";
    tiles.style.transition = ease;
    tiles.style.transform = `translateX(${go ? -d.dir * w : 0}px)`;
    if (d.ghost) {
      d.ghost.style.transition = ease;
      d.ghost.style.transform = `translateX(${go ? 0 : -d.dir * w}px)`;
    }
    flight = { tiles, ghost: d.ghost, kind: go ? d.target : null,
               t: setTimeout(() => {       // 滑翔落定才落状态: 影子页已就位, 无缝交棒
                 flight = null;
                 if (d.ghost) d.ghost.remove();
                 tiles.style.transition = ""; tiles.style.transform = "";
                 if (go) switchKind(d.target, true);   // 静默换: 不再重播滑入动画
               }, 270) };
  };

  sheet.addEventListener("touchstart", e => {
    if (e.target.closest("#grab-zone")) return;    // 把手: pointer 版管 (还带点一下关)
    if (flight) finishFlight();                    // 滑翔没落完又开划: 先兑现再拖
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; axis = ""; dy = 0;
  }, { passive: true });
  sheet.addEventListener("touchmove", e => {
    if (drag) { dragMove(e); return; }             // 定轴后跟手拖, 直到松手
    if (x0 == null) return;
    const t = e.touches[0], dx = t.clientX - x0;
    dy = t.clientY - y0;
    if (!axis && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) + 6) {
      axis = "x";                                   // 先定轴向, 定了不反悔
      dragStart(dx < 0 ? "expense" : "income", t, e.timeStamp);   // 左划支出, 右划收入
    } else if (!axis && dy > 12 && dy > Math.abs(dx)) {
      axis = solid() ? "y" : "scroll";              // 超高时这层在滚, 下拽不抢
    }
    if (axis === "y") {
      e.preventDefault();                           // 这层拽走: 不让 iOS 顺势橡皮筋
      if (dy > 8) ate = true;
      sheet.style.transition = "none";              // 拽动跟手 (不吃 .25s 缓动)
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  }, { passive: false });
  const end = () => {
    if (drag) dragEnd();
    else if (axis === "y") {
      sheet.style.transition = ""; sheet.style.transform = "";
      if (dy > 90) closeSheet();                    // 拽过 90px = 明确想关, 否则弹回
    }
    if (ate) setTimeout(() => { ate = false; }, 350);   // 划/拽完的点击吃掉 (兜底自清)
    settle();
  };
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
  sheet.addEventListener("click", e => {            // 捕获先于格子/牌: 误触当场吃掉
    if (!ate) return;
    e.stopPropagation(); e.preventDefault();
    ate = false;
  }, true);
})();

$("#fab").addEventListener("click", () => openSheet(null));
$("#sheet-mask").addEventListener("click", closeSheet);
$("#sheet-close").addEventListener("click", closeSheet);

// 类别牌点开 = 类别树选层 (全部类别都在树里); 树里大类点开亮小类, 小类点一下选好即收
$("#amt-cat").addEventListener("click", openCatPick);
$("#cp-x").addEventListener("click", closeCatPick);
$("#cp-mask").addEventListener("click", closeCatPick);
$("#cp-list").addEventListener("click", e => {
  const head = e.target.closest(".cp-top");
  if (head) {                            // 大类手风琴: 开一个收一窝
    const g = head.parentElement;
    const was = g.classList.contains("open");
    $("#cp-list").querySelectorAll(".cp-group.open")
      .forEach(x => x.classList.remove("open"));
    if (!was) g.classList.add("open");
    return;
  }
  const btn = e.target.closest("button[data-cat]");
  if (!btn) return;
  sheetCat = btn.dataset.cat;
  closeCatPick();
  fillChips();
  updateAmtHead();
});

// 时间牌点开 = 拨轮; 三列各自拨定回写 whenVal, 关层即存下所选时刻
$("#when-btn").addEventListener("click", openWhenPick);
$("#wp-x").addEventListener("click", closeWhenPick);
$("#wp-mask").addEventListener("click", closeWhenPick);
wireLoop($("#wp-hour"), 24, v => { whenVal.hh = v; updateWhenPill(); });
wireLoop($("#wp-min"), 60, v => { whenVal.mm = v; updateWhenPill(); });
wireDateWheel();

function switchKind(kind, silent) {  // 点标签页 / 左右划共用: 只换类别那一摊 (金额/备注/键盘都不动)
  if (kind === sheetKind) return;
  sheetKind = kind;
  document.body.dataset.kind = kind;        // 配色跟方向走 (支出红/收入绿), 渐变过去
  $("#kind-seg").querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.dataset.kind === sheetKind));
  const top = sheetCat.split("/")[0];       // 支出↔收入树不同, 原大类不在就清空重选
  if (!treeFor(sheetKind).some(t => t.name === top)) sheetCat = "";
  fillChips();
  if (!silent) {                            // 跟手划过来的: 影子页已滑到位, 不再重播滑入
    const tiles = $("#cat-tiles");            // 类别格顺着划的方向滑入 (连划几下每次都重放)
    tiles.classList.remove("swap-l", "swap-r");
    void tiles.offsetWidth;
    tiles.classList.add(kind === "expense" ? "swap-l" : "swap-r");
  }
  updateAmtHead();
}

$("#kind-seg").addEventListener("click", e => {
  const btn = e.target.closest("button[data-kind]");
  if (btn) switchKind(btn.dataset.kind);
});

$("#cat-tiles").addEventListener("click", e => {
  const btn = e.target.closest("button[data-cat]");
  if (!btn || !btn.dataset.cat) return;
  sheetCat = sheetCat === btn.dataset.cat ? "" : btn.dataset.cat;   // 再点一下取消
  fillChips();
  updateAmtHead();
});
$("#tag-btn").addEventListener("click", openTagPick);
$("#tp-x").addEventListener("click", closeTagPick);
$("#tp-mask").addEventListener("click", closeTagPick);
$("#tp-list").addEventListener("click", e => {
  const btn = e.target.closest("button[data-tag]");
  if (!btn) return;
  const tag = btn.dataset.tag;
  // 单选: 点的就是这一笔唯一的一枚; 再点已选的那枚 = 取下
  sheetTags = sheetTags.length === 1 && sheetTags[0] === tag ? [] : [tag];
  updateTagPill();
  closeTagPick();               // 选中即收, 不多停一秒
});
$("#tp-add").addEventListener("click", addTypedTag);
$("#tp-new").addEventListener("keydown", e => { if (e.key === "Enter") addTypedTag(); });

// 备注行点开 = 浮层输入 rides 系统键盘; 键盘起落/视口拖动都贴着键盘正上方
// (浮层没钮: 系统键盘的回车 [enterkeyhint=done] 或点别处 blur 收下)
$("#note-btn").addEventListener("click", openNoteKb);
$("#f-note").addEventListener("input", updateNoteRow);
$("#f-note").addEventListener("blur", closeNoteKb);
$("#f-note").addEventListener("keydown", e => { if (e.key === "Enter") closeNoteKb(); });
if (window.visualViewport)
  for (const ev of ["resize", "scroll"])
    window.visualViewport.addEventListener(ev, () => {
      const vv = window.visualViewport;
      if ($("#note-kb").hidden) return;
      if (ev === "scroll") placeNoteKb();  // 拖移视口: 即刻贴
      else {                               // 键盘升起: 贴着键盘顶往上走
        placeNoteKb(Math.min(kbFrom, vv.offsetTop + vv.height));
        clearTimeout(kbSettle);            // 但不许越过出发线往下跳 (看着是从行里升上去的)
        kbSettle = setTimeout(placeNoteKb, 80);   // 停稳后贴实
      }
    });

$("#sheet-del").addEventListener("click", () => {
  const prev = entries.find(x => x.id === editingId);
  if (prev) {          // 墓碑: 本地也留着, 才能把删除同步给别人
    prev.deleted = true;
    prev.updatedAt = new Date().toISOString();
    dirty.add(prev.id);
    persist();
  }
  closeSheet();
  render();
  scheduleSync();
});

/* ---------- 账目行左滑删除: 滑出红条, 点了还要再确认一次 (防手滑误删) ----------
   行身 (.sw-body) 整层挪、删除钮垫在身后右侧 (见 bookkeeping-page.css);
   竖滚意图让给页面, 横滑才接 (preventDefault 钉住页面不让边滑边滚) */
const SW_W = 72;             // 删除钮宽 (与 css .sw-del 的 width 一致)
let openRow = null;          // 当前滑开的行 (一次只开一行)
let sw = null;               // 进行中的滑动: { row, body, x0, y0, base, cur, mode }
let swClick = false;         // 刚滑完的收尾 click 别当成点开行
let delId = null;            // 待删的账目 id (确认框开着时)
let dcTimer = 0;             // 确认框收尾动画的计时器 (重开要先撤)

function closeOpenRow() {    // 收掉滑开的行 (行随重画没了就当没开过)
  if (openRow && openRow.isConnected)
    openRow.querySelector(".sw-body").style.transform = "";
  openRow = null;
}
function staleRow() {        // render() 整体重画会换掉行节点: 攥着旧节点判空
  if (openRow && !openRow.isConnected) openRow = null;
  return openRow;
}

$("#entry-list").addEventListener("touchstart", e => {
  swClick = false;                                   // 新的一下从零起算
  const t = e.touches[0];
  const row = t.target instanceof Element && t.target.closest(".entry");
  sw = row ? { row, body: row.querySelector(".sw-body"), x0: t.clientX, y0: t.clientY,
               base: row === staleRow() ? -SW_W : 0, cur: 0, mode: "" } : null;
}, { passive: true });

$("#entry-list").addEventListener("touchmove", e => {
  if (!sw) return;
  const t = e.touches[0];
  const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
  if (!sw.mode) {            // 先辨意图: 竖着滚还给页面, 横着才接
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      sw = null; closeOpenRow(); return;             // 滚列表: 滑开的行顺手收掉
    }
    if (Math.abs(dx) > 12) {                   // 12 起才当滑 (点按的手指微晃不开门)
      sw.mode = "swipe"; sw.row.classList.add("dragging");
      if (openRow && openRow !== sw.row) closeOpenRow();
    } else return;
  }
  e.preventDefault();        // 横滑钉住页面 (别同时纵滚)
  let x = sw.base + dx;
  if (x > 0) x *= .25;                               // 右侧橡皮筋 (不许拉出行外)
  if (x < -SW_W) x = -SW_W + (x + SW_W) * .25;       // 开到底再拉: 阻尼
  sw.cur = x;
  sw.body.style.transform = `translateX(${x}px)`;
}, { passive: false });

function swFinish(e) {       // 松手: 过半开, 没过半收 (带弹簧回弹)
  if (!sw) return;
  if (sw.mode === "swipe") {
    const open = sw.cur < -SW_W / 2;
    sw.row.classList.remove("dragging");
    sw.body.style.transform = open ? `translateX(${-SW_W}px)` : "";
    openRow = open ? sw.row : null;
    if (Math.abs(e.changedTouches[0].clientX - sw.x0) > 10)
      swClick = true;        // 这一下是滑不是点: 随后的 click 别当点开
  }
  sw = null;
}
$("#entry-list").addEventListener("touchend", swFinish);
$("#entry-list").addEventListener("touchcancel", swFinish);

document.addEventListener("touchstart", e => {        // 滑开的行: 点到行外任何地方收掉
  if (staleRow() && e.target instanceof Element && !e.target.closest(".entry"))
    closeOpenRow();
}, { passive: true });

function askDelRow(row) {    // 删除的二次确认: iOS 警示框 (写着这笔是啥, 红字删除)
  const entry = entries.find(x => x.id === row.dataset.id);
  if (!entry) { closeOpenRow(); return; }
  delId = entry.id;
  clearTimeout(dcTimer);
  $("#dc-msg").textContent =
    `${entry.category ? entry.category.split("/").pop() : "未分类"} · ` +
    `${entry.kind === "income" ? "+" : "-"}${Number(entry.amount).toFixed(2)}`;
  const dlg = $("#del-confirm");
  dlg.hidden = false;        // 先显示再点亮 (跟选层同一套开合)
  requestAnimationFrame(() => dlg.classList.add("on"));
}
function closeDelConfirm() {
  const dlg = $("#del-confirm");
  dlg.classList.remove("on");
  clearTimeout(dcTimer);
  dcTimer = setTimeout(() => { if (!delId) dlg.hidden = true; }, 220);
  delId = null;
}
$("#dc-cancel").addEventListener("click", closeDelConfirm);
$("#dc-mask").addEventListener("click", closeDelConfirm);   // 点遮罩也是取消
$("#dc-ok").addEventListener("click", () => {        // 确认: 与记一笔里删同一套墓碑
  const prev = entries.find(x => x.id === delId);
  if (prev) {
    prev.deleted = true;
    prev.updatedAt = new Date().toISOString();
    dirty.add(prev.id);
    persist();
  }
  closeDelConfirm();
  openRow = null;            // 行随重画没了, 别攥着旧元素
  render();
  scheduleSync();
});

$("#entry-list").addEventListener("click", e => {
  const t = e.target;
  if (!(t instanceof Element) || !t.isConnected) return;   // 重渲染脱链防误触
  if (swClick) { swClick = false; return; }          // 滑完的收尾点击: 不当点开
  const row = t.closest(".entry");
  if (!row) return;
  if (t.closest(".sw-del")) { askDelRow(row); return; }   // 点的是删除钮: 走二次确认
  if (staleRow()) { closeOpenRow(); return; }        // 有行开着: 这一下先收它, 不点开
  const entry = entries.find(x => x.id === row.dataset.id);
  if (entry) openSheet(entry);
});
