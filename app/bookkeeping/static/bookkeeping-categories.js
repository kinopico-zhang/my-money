// bookkeeping-categories — 类别管理页脚本: 拉类别树渲染两级列表 (大类手风琴
// + 小类缩进, 与「选类别」弹层同一副长相), 每行带色点 (点开脚下调色盘,
// 即点即存) 与删除钮 (两击确认)。三个写口 (改色/添加/删除) 都回整棵新树,
// 就地换上; 树同时落 localStorage (bk-categories-v2 — 与记账页同一份缓存,
// 那边开局/刷新就能吃到新色)。断网这页只能看不能改 (写口要打服务端)。
"use strict";
/* global catIcon, setCatColors */

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // 调色盘色票: 顺色环 12 枚 (红→橙→黄→绿→青→蓝→紫→粉, 外加棕/灰),
  // 「默认」一枚撤自选、跟收支方向走。1.5.1 (2026-10-02) 整批换暗底档:
  // 浅色时代的中明度坐 #2c2c2e 暗井发灰看不清 (库里自选色列全空,
  // 换值不用迁移, 也没有赖账的自选色要保)
  const SWATCHES = ["#e5696e", "#e88a55", "#d9b04c", "#b3bd5a", "#4dbf90",
    "#57bdd1", "#79a8ec", "#95a0f2", "#b897e8", "#e687ad", "#b59a7e", "#9aa7b9"];

  let tree = null;
  let kind = "expense";
  let openTop = null;        // 展开的大类 (同时只开一个; null = 全收着)
  let trayFor = null;        // 调色盘垫在哪一行脚下 {parent, name} (只开一盘)
  let confirmKey = null;     // 删除两击确认的第一击 (3 秒内点第二下才真删)

  const groups = () => (tree ? tree[kind] : []);
  const trayOpen = (parent, name) =>
    !!trayFor && trayFor.parent === parent && trayFor.name === name;
  const ownColor = (parent, name) => {   // 自选色: 小类没单挑落大类 (catColor 同路数)
    const colors = (tree && tree.colors) || {};
    return colors[`${parent}/${name}`] || colors[name] || "";
  };
  const dotColor = (parent, name) =>     // 色点亮的就是图标当下的色
    ownColor(parent, name) ||
    (kind === "income" ? "var(--icon-green)" : "var(--icon-red)");

  function saveTree() {      // 树缓存与记账页同一份, 别的页开局就吃到新色
    try { localStorage.setItem("bk-categories-v2", JSON.stringify(tree)); }
    catch (_e) { /* 私隐模式/盘满: 只影响别页用旧缓存, 本页不受影响 */ }
  }

  function applyTree(next) {
    tree = next;
    saveTree();
    setCatColors(tree);
    render();
  }

  // ---------- 渲染 ----------
  function trayHtml(parent, name) {
    const own = ownColor(parent, name);
    return `<div class="tray">` +
      `<button type="button" class="sw def${own ? "" : " cur"}" data-act="pick" data-color="">默认</button>` +
      SWATCHES.map(c => `<button type="button" class="sw${own === c ? " cur" : ""}"` +
        ` style="background:${c}" data-act="pick" data-color="${c}" aria-label="${c}"></button>`).join("") +
      `<span class="hint">小类没单挑色, 就落大类的色</span></div>`;
  }

  function kidRow(parent, name) {
    const key = `${parent}/${name}`;
    return `<div class="kid">` +
      `<span class="ic">${catIcon(key, kind)}</span>` +
      `<span class="nm">${esc(name)}</span>` +
      `<button type="button" class="dot" data-act="color" data-parent="${esc(parent)}"` +
      ` data-name="${esc(name)}" style="--dot:${dotColor(parent, name)}" aria-label="挑颜色"></button>` +
      `<button type="button" class="del${confirmKey === key ? " confirm" : ""}" data-act="del"` +
      ` data-parent="${esc(parent)}" data-name="${esc(name)}" aria-label="删除">${confirmKey === key ? "确认" : "✕"}</button>` +
      `</div>`;
  }

  function groupHtml(g) {
    const kids = g.children || [];
    const open = openTop === g.name && kids.length > 0;
    return `<div class="grp${open ? " open" : ""}">` +
      `<div class="grp-top">` +
      `<button type="button" class="head" data-act="toggle" data-parent="${esc(g.name)}"${kids.length ? "" : " disabled"}>` +
      `<span class="ic">${catIcon(g.name, kind)}</span>` +
      `<span class="nm">${esc(g.name)}</span>` +
      `${kids.length ? `<span class="cnt">${kids.length} 小类</span>` : ""}` +
      `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` +
      `</button>` +
      `<button type="button" class="dot" data-act="color" data-parent="" data-name="${esc(g.name)}"` +
      ` style="--dot:${dotColor("", g.name)}" aria-label="挑颜色"></button>` +
      `<button type="button" class="del${confirmKey === g.name ? " confirm" : ""}" data-act="del"` +
      ` data-parent="" data-name="${esc(g.name)}" aria-label="删除">${confirmKey === g.name ? "确认" : "✕"}</button>` +
      `</div>` +
      (trayOpen("", g.name) ? trayHtml("", g.name) : "") +
      `<div class="kids">${kids.map(n =>
        kidRow(g.name, n) + (trayOpen(g.name, n) ? trayHtml(g.name, n) : "")).join("")}</div>` +
      `</div>`;
  }

  function fillParentSelect() {         // 添加行的归属: 新建大类 + 本侧各大类
    $("#add-parent").innerHTML = `<option value="">新建大类</option>` +
      groups().map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join("");
  }

  function render() {
    $("#cat-list").hidden = false;
    $("#cat-list").innerHTML = groups().map(groupHtml).join("") ||
      `<div class="state">这一侧还没有类别</div>`;
    fillParentSelect();
  }

  // ---------- 写口 ----------
  function showMsg(text) { const m = $("#msg"); m.textContent = text; m.hidden = false; }
  function hideMsg() { $("#msg").hidden = true; }

  async function mutate(path, body) {   // 三口同型: POST 出错亮原因, 成功换树
    try {
      const r = await fetch(path, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body) });
      if (r.status === 401) { location.replace("/bookkeeping/login"); return null; }
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        showMsg((data && data.detail) || `操作失败 (${r.status})`);
        return null;
      }
      const next = await r.json();
      applyTree(next);
      hideMsg();
      return next;
    } catch (_e) {
      showMsg("网络不佳, 稍后再试");
      return null;
    }
  }

  async function addCategory(parent, name) {
    const next = await mutate("/bookkeeping/api/categories/add", { kind, parent, name });
    if (next) {
      $("#add-name").value = "";
      openTop = parent || name;   // 展开落点那一组, 新类别一眼看到
      render();
    }
  }

  function armConfirmReset(key) {       // 3 秒不点第二下, 「确认」缩回 ✕
    setTimeout(() => {
      if (confirmKey === key) { confirmKey = null; render(); }
    }, 3000);
  }

  // ---------- 接线 (列表一枚委托, 行是重画出来的) ----------
  $("#cat-list").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const { act, parent, name } = btn.dataset;
    if (act === "toggle") {
      openTop = openTop === parent ? null : parent;
    } else if (act === "color") {
      trayFor = trayOpen(parent, name) ? null : { parent, name };
      confirmKey = null;
    } else if (act === "pick") {
      if (trayFor) mutate("/bookkeeping/api/categories/color",
        { kind, parent: trayFor.parent, name: trayFor.name, color: btn.dataset.color });
      return;                    // 调色盘开着不走重画, 换色回来自然刷新色点
    } else if (act === "del") {
      const key = parent ? `${parent}/${name}` : name;
      if (confirmKey !== key) { confirmKey = key; armConfirmReset(key); }
      else {
        confirmKey = null;
        mutate("/bookkeeping/api/categories/delete", { kind, parent, name });
        return;                  // 删除后行就没了, 先别重画 (回树再画)
      }
    }
    render();
  });

  $("#kind-tabs").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-kind]");
    if (!btn || btn.dataset.kind === kind) return;
    kind = btn.dataset.kind;
    document.querySelectorAll("#kind-tabs button").forEach(b =>
      b.classList.toggle("on", b === btn));
    openTop = null; trayFor = null; confirmKey = null;
    render();
  });

  $("#add-btn").addEventListener("click", () => {
    const name = $("#add-name").value.trim();
    if (!name) { showMsg("先填类别名"); return; }
    if (name.length > 10) { showMsg("名字最长 10 个字"); return; }
    if (name.includes("/")) { showMsg("名字里不能带 / (它是大类/小类的分隔)"); return; }
    addCategory($("#add-parent").value, name);
  });

  // ---------- 开局 ----------
  async function load() {
    $("#loading").hidden = false;
    $("#load-error").hidden = true;
    try {
      const r = await fetch("/bookkeeping/api/categories", { cache: "no-store" });
      if (r.status === 401) { location.replace("/bookkeeping/login"); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tree = await r.json();
      setCatColors(tree);
      saveTree();
      render();
      $("#loading").hidden = true;
    } catch (_e) {
      $("#loading").hidden = true;
      $("#load-error").hidden = false;
    }
  }
  $("#retry").addEventListener("click", load);
  load();
})();
