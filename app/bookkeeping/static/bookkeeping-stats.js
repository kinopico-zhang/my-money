// bookkeeping-stats — 统计页脚本: 读本地账本 (localStorage, 与记账页同一份 —
// 离线优先, 断网也能看), 按月聚合出总账 / 分类榜 / 记账人分摊。
// 不碰同步: 账本的增删改都在记账页, 这里只读。
"use strict";
/* global catIcon, setCatColors */

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pad = n => String(n).padStart(2, "0");
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const loadLS = (key, fb) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fb; }
    catch (_e) { return fb; }
  };
  const fmt = n => n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万` : n.toFixed(2);

  let month = curMonth();

  function shift(delta) {                    // 翻月: 上下都行, 下月封顶在当月 (未来没账)
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (delta > 0 && next > curMonth()) return;
    month = next;
    render();
  }

  // 大类聚合: "餐饮/早餐" 归到「餐饮」 (子类太碎, 榜要的是大盘; 图标也归大类)
  function byCat(rows) {
    const acc = new Map();
    for (const e of rows) {
      const top = String(e.category || "其他").split("/")[0];
      acc.set(top, (acc.get(top) || 0) + Number(e.amount || 0));
    }
    return [...acc].sort((a, b) => b[1] - a[1]);
  }

  function catRowsHtml(pairs, kind) {
    const max = pairs[0][1] || 1;
    return pairs.map(([name, amt]) =>
      `<div class="cat-row"><span class="cat-ic">${catIcon(name, kind)}</span>` +
      `<span class="cat-main"><span class="cat-top"><span class="cat-name">${esc(name)}</span>` +
      `<span class="cat-amt">${fmt(amt)}</span></span>` +
      `<span class="bar"><i style="width:${Math.max(3, amt / max * 100).toFixed(1)}%"></i></span>` +
      `</span></div>`).join("");
  }

  function render() {
    const [y, m] = month.split("-").map(Number);
    $("#m-title").textContent = `${y}年${m}月`;
    $("#m-next").disabled = month >= curMonth();
    const rows = loadLS("bk-entries", [])
      .filter(e => !e.deleted && String(e.date || "").startsWith(month));
    const out = rows.filter(e => e.kind !== "income");
    const inc = rows.filter(e => e.kind === "income");
    const sum = rs => rs.reduce((a, e) => a + Number(e.amount || 0), 0);
    $("#sum-out").textContent = `¥${fmt(sum(out))}`;
    $("#sum-in").textContent = `¥${fmt(sum(inc))}`;

    const catOut = byCat(out), catIn = byCat(inc);
    $("#by-cat").innerHTML = catRowsHtml(catOut, "expense");
    $("#cat-empty").hidden = catOut.length > 0;
    $("#by-cat-in").innerHTML = catRowsHtml(catIn, "income");
    $("#income-card").hidden = catIn.length === 0;   // 收入卡: 有收入才占地方

    const who = new Map();                    // 记账人分摊: 本地刚记的没名字, 标「我」
    for (const e of rows) {
      const k = e.createdByName || "我";
      const w = who.get(k) || { out: 0, in: 0 };
      if (e.kind === "income") w.in += Number(e.amount || 0);
      else w.out += Number(e.amount || 0);
      who.set(k, w);
    }
    $("#by-who").innerHTML = [...who].sort((a, b) => (b[1].out + b[1].in) - (a[1].out + a[1].in))
      .map(([name, w]) =>
        `<div class="who-row"><span class="who-name">${esc(name)}</span>` +
        `<span class="who-amt out">支出 ¥${fmt(w.out)}</span>` +
        `<span class="who-amt in">收入 ¥${fmt(w.in)}</span></div>`).join("");
    $("#who-empty").hidden = who.size > 0;
  }

  $("#m-prev").addEventListener("click", () => shift(-1));
  $("#m-next").addEventListener("click", () => shift(1));
  setCatColors(loadLS("bk-categories-v2", null));   // 自选图标色 (设置页挑的, 随树缓存)
  render();
})();
