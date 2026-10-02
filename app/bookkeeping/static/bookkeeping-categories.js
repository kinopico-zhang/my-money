// bookkeeping-categories — 类别管理页脚本: 拉类别树渲染两级列表 (大类手风琴
// + 小类缩进, 与「选类别」弹层同一副长相), 每行带色点 (点开脚下调色盘,
// 即点即存)。三个写口 (改色/添加/删除) 都回整棵新树, 就地换上; 树同时落
// localStorage (bk-categories-v2 — 与记账页同一份缓存, 那边开局/刷新就能
// 吃到新色)。断网这页只能看不能改 (写口要打服务端)。
// 添加与删除的口 (1.7.0): 添加进弹框 — 名字/图标/颜色一次选齐 (顶栏「＋
// 新建大类」与大类列表尾「＋ 添加小类」都进这框, 打字自动预选贴切图标);
// 删除走行左滑 (记账页账目行同款手势) — 滑开露红条, 两击确认。
"use strict";
/* global catIcon, catIconBySlug, setCatColors, CATEGORY_ICONS, CAT_ICONS,
   ICON_NAMES, ICON_HINTS, FALLBACK_ICON */

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
  let confirmKey = null;     // 删除两击确认的第一击 {parent, name} (3 秒内点第二下才真删)

  // 弹框状态: modalFor 是往哪个大类里加 (null = 新建大类); mIconLocked 后
  // 打字不再抢预选 (手点图标 = 定了); mColor 空 = 默认跟收支方向走
  let modalFor = null;
  let mName = "";
  let mIcon = "";
  let mIconLocked = false;
  let mColor = "";

  // 行左滑状态 (记账页账目行同一副手势)
  const SW_W = 72;           // 删除钮宽 (与 css .sw-del 的 width 一致)
  let openRow = null;        // 当前滑开的行 (一次只开一行)
  let sw = null;             // 进行中的滑动: { row, body, x0, y0, base, cur, mode }
  let swClick = false;       // 刚滑完的收尾 click 别当成点按

  const groups = () => (tree ? tree[kind] : []);
  const trayOpen = (parent, name) =>
    !!trayFor && trayFor.parent === parent && trayFor.name === name;
  const ownColor = (parent, name) => {   // 自选色: 小类没单挑落大类 (catColor 同路数)
    const colors = (tree && tree.colors) || {};
    return colors[`${parent}/${name}`] || colors[name] || "";
  };
  const dirColor = () =>            // 方向色 (没自选时的底色)
    kind === "income" ? "var(--icon-green)" : "var(--icon-red)";
  const dotColor = (parent, name) => ownColor(parent, name) || dirColor();

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

  const confirming = (parent, name) =>
    !!confirmKey && confirmKey.parent === parent && confirmKey.name === name;
  function swDelBtn(parent, name) {   // 行身后的删除条 (左滑才见), 两击确认
    return `<button type="button" class="sw-del${confirming(parent, name) ? " confirm" : ""}"` +
      ` data-act="del" data-parent="${esc(parent)}" data-name="${esc(name)}"` +
      ` aria-label="删除">${confirming(parent, name) ? "确认" : "删除"}</button>`;
  }

  function kidRow(parent, name) {
    const key = `${parent}/${name}`;
    return `<div class="kid sw-wrap">` +
      swDelBtn(parent, name) +
      `<div class="sw-body">` +
      `<span class="ic">${catIcon(key, kind)}</span>` +
      `<span class="nm">${esc(name)}</span>` +
      `<button type="button" class="dot" data-act="color" data-parent="${esc(parent)}"` +
      ` data-name="${esc(name)}" style="--dot:${dotColor(parent, name)}" aria-label="挑颜色"></button>` +
      `</div></div>`;
  }

  function groupHtml(g) {
    const kids = g.children || [];
    const open = openTop === g.name;   // 没挂小类的大类也点得开 (展开就是添加行)
    return `<div class="grp${open ? " open" : ""}">` +
      `<div class="grp-top sw-wrap">` +
      swDelBtn("", g.name) +
      `<div class="sw-body">` +
      `<button type="button" class="head" data-act="toggle" data-parent="${esc(g.name)}">` +
      `<span class="ic">${catIcon(g.name, kind)}</span>` +
      `<span class="nm">${esc(g.name)}</span>` +
      `${kids.length ? `<span class="cnt">${kids.length} 小类</span>` : ""}` +
      `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` +
      `</button>` +
      `<button type="button" class="dot" data-act="color" data-parent="" data-name="${esc(g.name)}"` +
      ` style="--dot:${dotColor("", g.name)}" aria-label="挑颜色"></button>` +
      `</div></div>` +
      (trayOpen("", g.name) ? trayHtml("", g.name) : "") +
      `<div class="kids">${kids.map(n =>
        kidRow(g.name, n) + (trayOpen(g.name, n) ? trayHtml(g.name, n) : "")).join("")}` +
      `${addKidRow(g.name)}</div>` +
      `</div>`;
  }

  function addKidRow(parent) {         // 组尾添加口: 一行灰字, 点开弹框 (带父类)
    return `<button type="button" class="kid add-kid" data-act="add-kid"` +
      ` data-parent="${esc(parent)}">＋ 添加小类</button>`;
  }

  function render() {
    $("#cat-list").hidden = false;
    $("#cat-list").innerHTML = groups().map(groupHtml).join("") ||
      `<div class="state">这一侧还没有类别</div>`;
  }

  // ---------- 新建弹框 ----------
  function iconSlugFor(key) {          // 与 catIcon 同一条解析链, 回 slug 不产 svg
    return CAT_ICONS.get(key) || CATEGORY_ICONS[key] ||
      CAT_ICONS.get(key.split("/")[0]) || CATEGORY_ICONS[key.split("/")[0]] ||
      FALLBACK_ICON;
  }

  function guessIcon() {     // 未锁定时随名字预选: 名字映射包含 (键含输入/输入
                             // 含键, 165 键里大类排在前) → 小词典 → 小类落父类
                             // 当前图标 → 兜底; 只是猜个近似的, 手点过就锁
    const n = mName.trim();
    if (n) {
      for (const key of Object.keys(CATEGORY_ICONS)) {
        if (key.includes(n) || n.includes(key)) return CATEGORY_ICONS[key];
      }
      for (const w of Object.keys(ICON_HINTS)) {
        if (n.includes(w)) return ICON_HINTS[w];
      }
    }
    return modalFor ? iconSlugFor(modalFor) : FALLBACK_ICON;
  }

  const modalIcon = () => (mIconLocked ? mIcon : guessIcon());
  const cmErr = text => { const el = $("#cm-err"); el.textContent = text; el.hidden = false; };

  function paintPreview() {            // 顶上预览: 框里生效的图标 + 挑中的色
    $("#cm-icon").innerHTML = catIconBySlug(modalIcon(), mColor || dirColor());
  }

  function paintGrid() {               // 图标栅格全量画 (开框/换色才走):
    const color = mColor || dirColor();   // 143 枚, 选中那枚描圈
    $("#cm-icons").innerHTML = ICON_NAMES.map(s =>
      `<button type="button" class="cm-tile${s === modalIcon() ? " cur" : ""}"` +
      ` data-icon="${s}" aria-label="${s}">${catIconBySlug(s, color)}</button>`).join("");
  }

  function moveGridSel() {             // 选中圈搬运不重画栅格 (打字随选也轻)
    const grid = $("#cm-icons");
    grid.querySelectorAll(".cur").forEach(b => b.classList.remove("cur"));
    const cur = grid.querySelector(`[data-icon="${modalIcon()}"]`);
    if (cur) cur.classList.add("cur");
  }

  function paintColors() {             // 色票 12 + 默认 (当前那枚描圈)
    $("#cm-colors").innerHTML =
      `<button type="button" class="cm-cw def${mColor ? "" : " cur"}" data-color="">默认</button>` +
      SWATCHES.map(c => `<button type="button" class="cm-cw${mColor === c ? " cur" : ""}"` +
        ` style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join("");
  }

  function openModal(parent) {         // parent 空 = 新建大类; 名字框不自动聚焦
    closeOpenRow();                    // (这页没装视口医生, 不去顶 iOS 键盘几何)
    trayFor = null;
    confirmKey = null;
    modalFor = parent || null;
    mName = ""; mIcon = ""; mIconLocked = false; mColor = "";
    $("#cm-title").textContent = modalFor ? `往「${modalFor}」加小类` : "新建大类";
    $("#cm-name").value = "";
    $("#cm-err").hidden = true;
    paintGrid();
    paintColors();
    paintPreview();
    const box = $("#cat-modal");
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add("on"));   // 先铺开再加类, 过渡才走得动
  }

  function closeModal() {
    const box = $("#cat-modal");
    box.classList.remove("on");
    setTimeout(() => { box.hidden = true; }, 250);   // 收完动画再藏 (与过渡同拍)
  }

  async function submitModal() {       // 弹框提交: 回车/「添加」都走这; 失败
    const name = mName.trim();         // 亮在框里不关框 (改字即撤错)
    const err = nameError(name);
    if (err) { cmErr(err); return; }
    const parent = modalFor || "";
    const next = await mutate("/bookkeeping/api/categories/add",
      { kind, parent, name, icon: modalIcon(), color: mColor }, $("#cm-err"));
    if (next) {                        // 图标送框里生效的那枚 (预览所见 = 落库所得)
      closeModal();
      openTop = parent || name;        // 展开落点那一组, 新类别一眼看到
      render();
    }
  }

  // ---------- 行左滑删除 (记账页账目行同一副手势) ----------
  function closeOpenRow() {    // 收掉滑开的行 (行随重画没了就当没开过)
    if (openRow && openRow.isConnected)
      openRow.querySelector(".sw-body").style.transform = "";
    openRow = null;
  }
  function staleRow() {        // render() 整体重画会换掉行节点: 攥着旧节点判空
    if (openRow && !openRow.isConnected) openRow = null;
    return openRow;
  }

  function armConfirmReset(key) {       // 3 秒不点第二下, 「确认」缩回「删除」。
    setTimeout(() => {                  // 不走全量 render (会把滑开的行拍回去):
      if (confirmKey !== key) return;   // 只清旗, 钮还在 DOM 就地改回文案
      confirmKey = null;
      const btn = document.querySelector(
        `#cat-list .sw-del[data-parent="${CSS.escape(key.parent)}"]` +
        `[data-name="${CSS.escape(key.name)}"]`);
      if (btn) { btn.textContent = "删除"; btn.classList.remove("confirm"); }
    }, 3000);
  }

  // ---------- 写口 ----------
  function showMsg(text) { const m = $("#msg"); m.textContent = text; m.hidden = false; }
  function hideMsg() { $("#msg").hidden = true; }

  async function mutate(path, body, errBox) {   // 三口同型: POST 出错亮原因
    try {                                       // (errBox 给了 = 弹框提交, 亮框里)
      const r = await fetch(path, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body) });
      if (r.status === 401) { location.replace("/bookkeeping/login"); return null; }
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        const text = (data && data.detail) || `操作失败 (${r.status})`;
        if (errBox) { errBox.textContent = text; errBox.hidden = false; }
        else showMsg(text);
        return null;
      }
      const next = await r.json();
      applyTree(next);
      hideMsg();
      return next;
    } catch (_e) {
      const text = "网络不佳, 稍后再试";
      if (errBox) { errBox.textContent = text; errBox.hidden = false; }
      else showMsg(text);
      return null;
    }
  }

  function nameError(name) {           // 弹框提交的守门 (服务端还有一道)
    if (!name) return "先填类别名";
    if (name.length > 10) return "名字最长 10 个字";
    if (name.includes("/")) return "名字里不能带 / (它是大类/小类的分隔)";
    return "";
  }

  // ---------- 接线 (列表一枚委托, 行是重画出来的) ----------
  $("#cat-list").addEventListener("click", (ev) => {
    if (swClick) { swClick = false; return; }   // 刚滑完的收尾 click 不当点按
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const { act, parent, name } = btn.dataset;
    if (act === "toggle") {
      openTop = openTop === parent ? null : parent;
    } else if (act === "color") {
      trayFor = trayOpen(parent, name) ? null : { parent, name };
      confirmKey = null;
      closeOpenRow();
    } else if (act === "pick") {
      if (trayFor) mutate("/bookkeeping/api/categories/color",
        { kind, parent: trayFor.parent, name: trayFor.name, color: btn.dataset.color });
      return;                    // 调色盘开着不走重画, 换色回来自然刷新色点
    } else if (act === "del") {
      if (!confirming(parent, name)) {
        confirmKey = { parent, name };
        armConfirmReset(confirmKey);
        btn.textContent = "确认";       // 不走重画 (会把滑开的行拍回去), 就地变脸
        btn.classList.add("confirm");
      } else {
        confirmKey = null;
        closeOpenRow();
        mutate("/bookkeeping/api/categories/delete", { kind, parent, name });
      }
      return;                    // 第一击就地变脸; 第二击回树再画
    } else if (act === "add-kid") {
      openModal(parent);
      return;
    }
    render();
  });

  $("#cat-list").addEventListener("touchstart", e => {
    swClick = false;                                   // 新的一下从零起算
    const t = e.touches[0];
    const row = t.target instanceof Element && t.target.closest(".sw-wrap");
    sw = row ? { row, body: row.querySelector(".sw-body"), x0: t.clientX, y0: t.clientY,
                 base: row === staleRow() ? -SW_W : 0, cur: 0, mode: "" } : null;
  }, { passive: true });

  $("#cat-list").addEventListener("touchmove", e => {
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
        swClick = true;        // 这一下是滑不是点: 随后的 click 别当点按
    }
    sw = null;
  }
  $("#cat-list").addEventListener("touchend", swFinish);
  $("#cat-list").addEventListener("touchcancel", swFinish);

  document.addEventListener("touchstart", e => {        // 滑开的行: 点到行外任何地方收掉
    if (staleRow() && e.target instanceof Element && !e.target.closest(".sw-wrap"))
      closeOpenRow();
  }, { passive: true });

  // 弹框: 名字 (打字随选预览/撤错, 回车提交)、图标栅格、色票、关与提交
  $("#cm-name").addEventListener("input", ev => {
    mName = ev.target.value;
    $("#cm-err").hidden = true;
    if (mIconLocked) return;
    paintPreview();
    moveGridSel();
  });
  $("#cm-name").addEventListener("keydown", ev => {  // 回车 = 点「添加」
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    submitModal();
  });
  $("#cm-icons").addEventListener("click", ev => {
    const tile = ev.target.closest("[data-icon]");
    if (!tile) return;
    mIcon = tile.dataset.icon;
    mIconLocked = true;          // 手点过就锁: 打字不再抢预选
    moveGridSel();
    paintPreview();
  });
  $("#cm-colors").addEventListener("click", ev => {
    const tile = ev.target.closest("[data-color]");
    if (!tile) return;
    mColor = tile.dataset.color;
    paintColors();               // 色票描圈
    paintGrid();                 // 栅格整排换色
    paintPreview();
  });
  $("#cm-mask").addEventListener("click", closeModal);
  $("#cm-x").addEventListener("click", closeModal);
  $("#cm-ok").addEventListener("click", submitModal);
  $("#add-cat-btn").addEventListener("click", () => openModal(""));

  $("#kind-tabs").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-kind]");
    if (!btn || btn.dataset.kind === kind) return;
    kind = btn.dataset.kind;
    document.querySelectorAll("#kind-tabs button").forEach(b =>
      b.classList.toggle("on", b === btn));
    openTop = null; trayFor = null; confirmKey = null;
    closeOpenRow();
    render();
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
