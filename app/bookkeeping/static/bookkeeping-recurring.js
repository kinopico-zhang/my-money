// bookkeeping-recurring — My Money 周期账 (1.15.0, 10-14 用户点名「添加
// 账目的时候, 提供一个按钮, 点开可以把这个账目设置成周期帐, 展开周期帐
// 的设置界面, 里面可以设置开始时间, 结束时间, 重复周期, 入账日期, 入账
// 时间」): 记一笔弹层的第三枚胶囊牌「周期」, 新记才亮出来 — 点开周期
// 设置层: 重复周期 (每天/每周/每月/每年) + 入账日期 (随周期换面孔: 周几
// / 几号 / 几月几号) + 入账时刻 + 开始/结束日期 (结束空 = 不限), 底下
// 「设为周期账」一点, 这一笔照常存, 同时规则上服务端。之后到点的账由
// 服务端在同步时落账 (确定性 id "{规则}:{日子}", 补过的不再补), 大伙
// 同步就见账; 改账不带周期 — 首账就是手工记的那笔 (锚), 规则只管往后,
// 要改去设置里删了重立。断网立不了规则先排本地队 (bk-cyc-queue), 同步
// 成功后补交。设置里多一张周期账清单: 怎么重复、下一笔哪天、从哪天到
// 哪天一目了然, 删除两道闸, 删了就停 (已落的账留着)。拨轮借
// bookkeeping-entry-sheet 的 (openWhenPick 的 date/time 两副面孔)。
"use strict";
/* global $, esc, pad, loadLS, saveLS, openWhenPick, whenPicked */
/* exported cyc, resetCyclePanel, closeCycPick, submitCycle, flushCycleQueue,
            renderCycView */

const cyc = { on: false, cycle: "monthly", wday: 0, mday: 1, ymonth: 1,
              time: { hh: 0, mm: 0 }, start: new Date(), end: null };

const WDAYS = ["日", "一", "二", "三", "四", "五", "六"];   // 周日=0 (与 Date.getDay 同尺)
const CYCLES = [["daily", "每天"], ["weekly", "每周"],
                ["monthly", "每月"], ["yearly", "每年"]];

function cycleText(cycle, postDay, postMonth) {  // 怎么个重复法 (弹层牌/设置清单同一副)
  if (cycle === "daily") return "每天";
  if (cycle === "weekly") return "每周" + WDAYS[postDay];
  if (cycle === "monthly") return `每月${postDay}号`;
  return `每年${postMonth}月${postDay}号`;
}

function postDay() { return cyc.cycle === "weekly" ? cyc.wday : cyc.mday; }
function postMonth() { return cyc.ymonth; }

function fmtDay(d) { return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; }
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function resetCyclePanel(entry) {  // 开弹层回零 (entry-sheet 的 openSheet 挂): 新记的口子
  cyc.on = false;                  // 亮出来, 初值跟这一笔正要记的日期时刻走
  $("#cyc-btn").hidden = !!entry;  // 改老账不带周期 (要改规则去设置里删了重立)
  if (entry) return;
  const { date, time } = whenPicked();
  const [y, mo, da] = date.split("-").map(Number);
  cyc.start = new Date(y, mo - 1, da);
  cyc.end = null;
  [cyc.time.hh, cyc.time.mm] = time.split(":").map(Number);
  cyc.cycle = "monthly";
  cyc.wday = cyc.start.getDay();
  cyc.mday = cyc.start.getDate();
  cyc.ymonth = cyc.start.getMonth() + 1;
  updateCycPill();
}

function updateCycPill() {         // 弹层里的「周期」牌: 设上了亮蓝写重复法, 没设给灰占位
  $("#cyc-label").textContent =
    cyc.on ? cycleText(cyc.cycle, postDay(), postMonth()) : "周期";
  $("#cyc-btn").classList.toggle("on", cyc.on);
}

/* ---------- 周期设置层 (点「周期」牌弹, 盖在记一笔之上) ---------- */
function openCycPick() {
  paintCyc();
  const pick = $("#cyc-pick");
  pick.hidden = false;
  requestAnimationFrame(() => pick.classList.add("on"));
}

function closeCycPick() {
  const pick = $("#cyc-pick");
  if (pick.hidden) return;
  pick.classList.remove("on");
  setTimeout(() => { if (!pick.classList.contains("on")) pick.hidden = true; }, 250);
}

function cyChip(key, val, text) {  // 一枚选项片: cyc[key] 对上 data-val 就亮
  return `<button type="button" class="cy-chip${String(cyc[key]) === String(val) ? " on" : ""}"` +
    ` data-key="${key}" data-val="${val}">${text}</button>`;
}

function paintCyc() {              // 周期设置层: 控件全按 cyc 现值摆 (改一下重摆一下)
  const nums = (key, n) =>          // 1..n 一排数字片 (每月的几号 / 每年的几月几号)
    Array.from({ length: n }, (_, i) => cyChip(key, i + 1, String(i + 1))).join("");
  const dateRow = cyc.cycle === "daily" ? "" : `
    <div class="cy-row"><span class="cy-lbl">入账日期</span><div class="cy-chips">${
      cyc.cycle === "weekly"
        ? WDAYS.map((w, i) => cyChip("wday", i, "周" + w)).join("")
        : cyc.cycle === "monthly" ? nums("mday", 31)
        : `<span class="cy-sub">月</span>${nums("ymonth", 12)}` +
          `<span class="cy-sub">日</span>${nums("mday", 31)}`
    }</div></div>`;
  $("#cyp-body").innerHTML = `
    <div class="cy-row"><span class="cy-lbl">重复周期</span><div class="cy-chips">${
      CYCLES.map(([c, t]) => cyChip("cycle", c, t)).join("")}</div></div>
    ${dateRow}
    <div class="cy-row"><span class="cy-lbl">入账时间</span>
      <button type="button" class="cy-pill" id="cy-time">${pad(cyc.time.hh)}:${pad(cyc.time.mm)}</button></div>
    <div class="cy-row"><span class="cy-lbl">开始时间</span>
      <button type="button" class="cy-pill" id="cy-start">${fmtDay(cyc.start)}</button></div>
    <div class="cy-row"><span class="cy-lbl">结束时间</span>
      <button type="button" class="cy-pill${cyc.end ? "" : " empty"}" id="cy-end">${
        cyc.end ? fmtDay(cyc.end) : "不限"}</button>${
      cyc.end ? '<button type="button" class="cy-clear" id="cy-clear">不限</button>' : ""}</div>
    <div class="cy-msg" id="cy-msg" hidden></div>
    <button type="button" class="cy-go${cyc.on ? " off" : ""}" id="cy-go">${
      cyc.on ? "取消周期" : "设为周期账"}</button>`;
}

$("#cyc-btn").addEventListener("click", openCycPick);
$("#cyp-x").addEventListener("click", closeCycPick);
$("#cyp-mask").addEventListener("click", closeCycPick);

$("#cyp-body").addEventListener("click", ev => {
  const btn = ev.target instanceof Element ? ev.target.closest("button") : null;
  if (!btn) return;
  if (btn.classList.contains("cy-chip")) {  // 选项片: 周期换了重摆 (入账日期的面孔跟着换)
    if (btn.dataset.key === "cycle") cyc.cycle = btn.dataset.val;
    else cyc[btn.dataset.key] = Number(btn.dataset.val);
    paintCyc();
    return;
  }
  if (btn.id === "cy-time")                // 入账时刻: 借拨轮的时分两列
    openWhenPick("time", {
      get hh() { return cyc.time.hh; },
      set hh(v) { cyc.time.hh = v; paintCyc(); },
      get mm() { return cyc.time.mm; },
      set mm(v) { cyc.time.mm = v; paintCyc(); },
    });
  else if (btn.id === "cy-start")          // 开始/结束: 借拨轮的日期列 (结束没定过, 从开始处起拨)
    openWhenPick("date", {
      get d() { return cyc.start; },
      set d(v) { cyc.start = v; paintCyc(); },
    });
  else if (btn.id === "cy-end")
    openWhenPick("date", {
      get d() { return cyc.end || cyc.start; },
      set d(v) { cyc.end = v; paintCyc(); },
    });
  else if (btn.id === "cy-clear") {        // 结束收回「不限」
    cyc.end = null;
    paintCyc();
  } else if (btn.id === "cy-go") {         // 设为周期账 / 取消周期 (这一笔照常记)
    if (cyc.on) cyc.on = false;
    else {
      if (cyc.end && cyc.end < cyc.start) {   // 结束早过开始: 不收, 行内亮一句
        const m = $("#cy-msg");
        m.textContent = "结束日期不能早于开始日期";
        m.hidden = false;
        return;
      }
      cyc.on = true;
    }
    updateCycPill();
    closeCycPick();
  }
});

/* ---------- 立规则: 存账成功后紧跟 (amount-pad 的 saveEntry 挂) ---------- */
async function postRule(body) {    // 规则上服务端; "ok" 交上了 / "fail" 没交上 / "auth" 已跳登录
  const r = await fetch("/bookkeeping/api/recurring", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { location.replace("/bookkeeping/login"); return "auth"; }
  return r.ok ? "ok" : "fail";
}

function submitCycle(entry) {      // 这一笔存下的同时把规则立上; 断网先排队, 同步成功补交
  const body = {
    amount: entry.amount, kind: entry.kind, category: entry.category,
    tags: entry.tags, note: entry.note,
    cycle: cyc.cycle, post_day: postDay(), post_month: postMonth(),
    post_time: `${pad(cyc.time.hh)}:${pad(cyc.time.mm)}`,
    start_date: isoDay(cyc.start), end_date: cyc.end ? isoDay(cyc.end) : "",
    anchor_date: entry.date,
  };
  postRule(body).then(ok => {
    if (ok === "fail") {           // 断网/没交上: 排队 (账本身走脏名单, 规则也不能丢)
      const q = loadLS("bk-cyc-queue", []);
      q.push(body);
      saveLS("bk-cyc-queue", q);
    }
  });
}

async function flushCycleQueue() { // 同步成功后 (bookkeeping-sync 挂): 把断网排队的规则补交
  const q = loadLS("bk-cyc-queue", []);
  if (!q.length) return;
  const rest = [];
  for (const body of q) {
    const ok = await postRule(body);
    if (ok === "auth") return;
    if (ok !== "ok") rest.push(body);   // 还没交上: 留队下回再试
  }
  saveLS("bk-cyc-queue", rest);
}

/* ---------- 设置 → 周期账清单 (renderCycView, push.js 注册) ---------- */
async function renderCycView(target) {
  const fmt = s => s.replace(/-/g, "/");
  let rules = [];
  let confirmId = null;            // 待确认删除的那条 (两道闸, 与全应用的删除同礼数)

  function paint() {
    const rows = rules.map(r => `
      <div class="cy-rules-row" data-id="${esc(r.id)}">
        <div class="cy-main">
          <span class="cy-name">${esc(r.category ? r.category.split("/").pop() : "未分类")}</span>
          <span class="cy-amt">${r.kind === "income" ? "+" : "-"}${Number(r.amount).toFixed(2)}</span>
          ${r.id === confirmId
            ? '<button type="button" class="cy-del yes">确认删除</button>' +
              '<button type="button" class="cy-del no">不删</button>'
            : '<button type="button" class="cy-del">删除</button>'}
        </div>
        <div class="cy-sub-line">${cycleText(r.cycle, r.post_day, r.post_month)}${
          r.post_time ? " " + r.post_time : ""} · ${
          r.next_date ? `下一笔 ${fmt(r.next_date)}` : "已收摊"} · ${
          fmt(r.start_date)} ~ ${r.end_date ? fmt(r.end_date) : "不限"}</div>
      </div>`).join("");
    target.innerHTML = `
      <div class="pane-title">周期账</div>
      <div class="card">${rows ||
        '<div class="empty">还没有周期账 — 记一笔时点「周期」立一条</div>'}</div>`;
  }

  async function load() {          // 拉清单: 骨架先弹, 数据后到 (断网给重试)
    target.innerHTML = '<div class="pane-title">周期账</div>'
      + '<div class="state"><div class="spin"></div>正在读取周期账…</div>';
    try {
      const r = await fetch("/bookkeeping/api/recurring", { cache: "no-store" });
      if (r.status === 401) { location.replace("/bookkeeping/login"); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      rules = await r.json();
    } catch (_error) {
      if (!target.isConnected) return;
      target.innerHTML = '<div class="pane-title">周期账</div>'
        + '<div class="state"><div>加载失败, 检查网络后重试</div>'
        + '<button type="button" class="retry-btn">重试</button></div>';
      target.querySelector(".retry-btn").addEventListener("click", load);
      return;
    }
    if (target.isConnected) paint();
  }

  target.addEventListener("click", async ev => {   // 删除两道闸: 点删除亮确认, 再点才真删
    const btn = ev.target instanceof Element && ev.target.closest("button.cy-del");
    if (!btn) return;
    const id = btn.closest(".cy-rules-row").dataset.id;
    if (btn.classList.contains("yes")) {
      try {
        const r = await fetch(`/bookkeeping/api/recurring/${id}`, { method: "DELETE" });
        if (r.status === 401) { location.replace("/bookkeeping/login"); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        rules = rules.filter(x => x.id !== id);
        confirmId = null;
      } catch (_e) { /* 断网: 留在确认态, 再点再试 */ }
    } else if (btn.classList.contains("no")) confirmId = null;
    else confirmId = id;
    if (target.isConnected) paint();
  });
  await load();
}
