// bookkeeping-categories — 类别管理视图 (1.8.0 起住推入层, 原 categories.html
// 整页退役): 拉类别树渲染两级列表 (大类手风琴 + 小类缩进, 与「选类别」弹层
// 同一副长相), 每行带色点 (点开脚下调色盘, 即点即存)。三个写口 (改色/添加/
// 删除) 都回整棵新树, 就地换上; 树同时落 localStorage (bk-categories-v2 —
// 与记账页同一份缓存, 那边开局/刷新就能吃到新色)。断网只能看不能改 (写口
// 要打服务端)。添加与删除的口 (1.7.0): 添加进弹框 — 名字/图标/颜色一次选齐
// (「＋ 新建大类」与大类列表尾「＋ 添加小类」都进这框, 打字自动预选贴切
// 图标); 删除走行左滑 (记账页账目行同款手势) — 滑开露红条, 两击确认。
// 1.9.0 点小类行身开同一框编辑 (名字/图标/颜色, 提交走 update 口, 改名由
// 服务端把账面上的组合名一并迁走)。1.10.0 大类左划的动作条多一枚「编辑」
// (小类的编辑口在行身点按, 不占条), 开的是同一枚框 — 大类改名服务端整组迁。
// 1.11.0 图标栅格扩到 550 枚按意义分 19 组 (ICON_GROUPS 分节铺小标),
// 选中态照记账页磁贴 (圆底反白), 换掉蓝描圈。
// 元素查找全收在 target 里 (my-music 的教训: 层滑出还挂着 DOM 的空档,
// 全局找会抓错层); 渲染目标由调用方给。
"use strict";
/* global catIcon, catIconBySlug, setCatColors, CATEGORY_ICONS, CAT_ICONS,
          ICON_GROUPS, ICON_HINTS, FALLBACK_ICON */
/* exported renderCategoriesView */

function renderCategoriesView(target) {
  const $ = s => target.querySelector(s);
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

  // 弹框状态: modalFor 是往哪个大类里加 (null = 新建大类; 大类编辑时也是
  // null — 编辑对象由 mEditName 认); mEditName 非空 = 改那个类别 (1.9.0
  // 小类点行开框 / 1.10.0 大类动作条), 提交走 update 口; mIconLocked 后
  // 打字不再抢预选 (手点图标 = 定了; 编辑开局也锁 —— 当前的可能是手挑的);
  // mColor 空 = 默认跟收支方向走
  let modalFor = null;
  let mEditName = "";
  let mName = "";
  let mIcon = "";
  let mIconLocked = false;
  let mColor = "";

  // 行左滑状态 (记账页账目行同一副手势)
  const SW_W = 72;           // 单枚动作钮宽 (与 css .sw-act 的 width 一致;
                             // 行开多宽看条里有几枚 — 小类 72 / 大类 144)
  const swW = row => {       // 行宽 = 身后动作条实宽 (渲染时机不同也能拿准)
    const acts = row.querySelector(".sw-acts");
    return acts ? acts.offsetWidth : SW_W;
  };
  let openRow = null;        // 当前滑开的行 (一次只开一行)
  let sw = null;             // 进行中的滑动: { row, body, x0, y0, base, cur, w, mode }
  let swClick = false;       // 刚滑完的收尾 click 别当成点按

  target.innerHTML = `
    <div class="pane-title">类别管理</div>
    <div class="kind-tabs" id="kind-tabs">
      <button type="button" data-kind="expense" class="on">支出</button>
      <button type="button" data-kind="income">收入</button>
    </div>
    <div class="msg" id="msg" hidden></div>
    <div class="card">
      <!-- 顶上这条专职新建大类; 加小类的口在每个大类展开的列表尾 (＋ 添加小类) -->
      <button type="button" class="add-bar" id="add-cat-btn">＋ 新建大类</button>
    </div>
    <div class="card" id="cat-list"></div>
    <div class="state" id="loading"><div class="spin"></div>正在读取类别…</div>
    <div class="state" id="load-error" hidden>
      <div>加载失败, 检查网络后重试</div>
      <button type="button" class="retry-btn" id="retry">重试</button>
    </div>
    <!-- 类别弹框 (1.7.0 新建 / 1.9.0 编辑同一枚): 「＋ 新建大类」与大类列表尾
         「＋ 添加小类」进它新建, 点小类行身进它编辑 (标题/按钮文案随入口换)。
         hidden + .on 双段过渡, 样式 cm-* 一套在 bookkeeping-panes.css -->
    <div id="cat-modal" hidden>
      <div class="cm-mask" id="cm-mask"></div>
      <div class="cm-panel" role="dialog" aria-modal="true" aria-label="新建类别">
        <div class="cm-head"><span id="cm-title">新建大类</span>
          <button type="button" class="cm-x" id="cm-x" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>
        </div>
        <div class="cm-prev">
          <span class="cm-prev-ic" id="cm-icon" aria-hidden="true"></span>
          <input type="text" id="cm-name" maxlength="10" placeholder="类别名字 (1-10 个字)" autocomplete="off" aria-label="类别名字">
        </div>
        <div class="cm-label">图标</div>
        <div class="cm-icons" id="cm-icons"></div>
        <div class="cm-label">颜色</div>
        <div class="cm-colors" id="cm-colors"></div>
        <div class="cm-err" id="cm-err" hidden></div>
        <button type="button" class="cm-ok" id="cm-ok">添加</button>
      </div>
    </div>`;

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
    catch (_e) { /* 私隐模式/盘满: 只影响别页用旧缓存, 本层不受影响 */ }
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
  function swActs(parent, name, withEdit) {  // 行身后的动作条 (左滑才见):
    const conf = confirming(parent, name);   // 删除两击确认 (第一击后就地变脸)
    return `<div class="sw-acts">` +
      (withEdit              // 大类条: 编辑+删除两枚 (1.10.0); 小类条只删除 —
        ? `<button type="button" class="sw-act edit" data-act="edit-top"` +  // 小类的编辑口
          ` data-parent="${esc(parent)}" data-name="${esc(name)}">编辑</button>` : "") +  // 在行身点按
      `<button type="button" class="sw-act del${conf ? " confirm" : ""}"` +
      ` data-act="del" data-parent="${esc(parent)}" data-name="${esc(name)}"` +
      ` aria-label="删除">${conf ? "确认" : "删除"}</button></div>`;
  }

  function kidRow(parent, name) {
    const key = `${parent}/${name}`;
    return `<div class="kid sw-wrap">` +
      swActs(parent, name, false) +
      // 行身可点 (1.9.0): 点一下开编辑框; 色点仍是快改色的口 (closest 先
      // 摸到它自己的 data-act, 不会落进行身这枚)
      `<div class="sw-body" data-act="edit" data-parent="${esc(parent)}"` +
      ` data-name="${esc(name)}" role="button" aria-label="编辑 ${esc(name)}">` +
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
      swActs("", g.name, true) +
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

  function paintGrid() {               // 图标栅格按组全量画 (开框/换色才走):
    const color = mColor || dirColor();   // 550 枚分 19 节, 选中那枚磁贴反白
    $("#cm-icons").innerHTML = ICON_GROUPS.map(g =>
      `<div class="cm-group"><div class="cm-glabel">${g.label}</div>` +
      `<div class="cm-gicons">` + g.icons.map(s =>
        `<button type="button" class="cm-tile${s === modalIcon() ? " cur" : ""}"` +
        ` data-icon="${s}" aria-label="${s}">${catIconBySlug(s, color)}</button>`).join("") +
      `</div></div>`).join("");
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

  function openModal(parent, editName) {  // parent 空 = 新建大类; editName 给了
    closeOpenRow();                       // = 编辑那个小类 (名字/图标/颜色
    trayFor = null;                       // 先铺现状, 所见 = 所得; 名字框都
    confirmKey = null;                    // 不自动聚焦 — 不去顶 iOS 键盘几何)
    modalFor = parent || null;
    mEditName = editName || "";
    mName = mEditName;
    // 图标按行上生效的那枚预填: 小类认全名, 大类认裸名 (1.10.0)
    mIcon = mEditName
      ? iconSlugFor(parent ? `${parent}/${mEditName}` : mEditName)
      : "";
    mIconLocked = !!mEditName;   // 编辑开局锁当前图标: 可能是手挑的, 名字预选不许抢跑
    mColor = mEditName ? ownColor(parent, mEditName) : "";
    $("#cm-title").textContent = mEditName ? `编辑「${mEditName}」`
      : (modalFor ? `往「${modalFor}」加小类` : "新建大类");
    $(".cm-panel").setAttribute("aria-label",
      mEditName ? "编辑类别" : "新建类别");
    $("#cm-name").value = mName;
    $("#cm-ok").textContent = mEditName ? "保存" : "添加";
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

  async function submitModal() {       // 弹框提交: 回车/「添加·保存」都走这;
    const name = mName.trim();         // 失败亮在框里不关框 (改字即撤错)
    const err = nameError(name);
    if (err) { cmErr(err); return; }
    const parent = modalFor || "";
    const next = mEditName
      ? await mutate("/bookkeeping/api/categories/update",
        { kind, parent, name: mEditName, new_name: name,
          icon: modalIcon(), color: mColor }, $("#cm-err"))
      : await mutate("/bookkeeping/api/categories/add",
        { kind, parent, name, icon: modalIcon(), color: mColor }, $("#cm-err"));
    if (next) {                        // 图标送框里生效的那枚 (预览所见 = 落库所得)
      closeModal();
      openTop = parent || name;        // 展开落点那一组, 改动一眼看到
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
      const btn = target.querySelector(
        `#cat-list .sw-act.del[data-parent="${CSS.escape(key.parent)}"]` +
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
    } else if (act === "edit") {
      // 删除条露着时点行身: 这一下当收条 (把滑开的状态收回去), 不开框
      const wrap = btn.closest(".sw-wrap");
      if (wrap && wrap === staleRow()) { closeOpenRow(); return; }
      openModal(parent, name);
      return;
    } else if (act === "edit-top") {
      // 大类动作条上的编辑 (1.10.0): 条露着才点得到, 开框顺手收条;
      // 大类的 parent 是空串, 编辑模式由名字认 (与小类同一枚框)
      closeOpenRow();
      openModal("", name);
      return;
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
                 base: row === staleRow() ? -swW(row) : 0, cur: 0, w: swW(row),
                 mode: "" } : null;
  }, { passive: true });

  $("#cat-list").addEventListener("touchmove", e => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if (!sw.mode) {            // 先辨意图: 竖着滚还给页面, 横着才接
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        sw = null; closeOpenRow(); return;             // 滚列表: 滑开的行顺手收掉
      }
      if (dx > 12) { sw = null; return; }   // 右向 = 推入层的右划返回 (层任意位置
                                            // 起手都归它, 不只左缘), 行不抢
      if (dx < -12) {                  // 12 起才当滑 (点按的手指微晃不开门)
        sw.mode = "swipe"; sw.row.classList.add("dragging");
        if (openRow && openRow !== sw.row) closeOpenRow();
      } else return;
    }
    e.preventDefault();        // 横滑钉住页面 (别同时纵滚)
    let x = sw.base + dx;
    if (x > 0) x *= .25;                               // 右侧橡皮筋 (不许拉出行外)
    if (x < -sw.w) x = -sw.w + (x + sw.w) * .25;       // 开到底再拉: 阻尼 (条几枚开多宽)
    sw.cur = x;
    sw.body.style.transform = `translateX(${x}px)`;
  }, { passive: false });

  function swFinish(e) {       // 松手: 过半开, 没过半收 (带弹簧回弹)
    if (!sw) return;
    if (sw.mode === "swipe") {
      const open = sw.cur < -sw.w / 2;
      sw.row.classList.remove("dragging");
      sw.body.style.transform = open ? `translateX(${-sw.w}px)` : "";
      openRow = open ? sw.row : null;
      if (Math.abs(e.changedTouches[0].clientX - sw.x0) > 10)
        swClick = true;        // 这一下是滑不是点: 随后的 click 别当点按
    }
    sw = null;
  }
  $("#cat-list").addEventListener("touchend", swFinish);
  $("#cat-list").addEventListener("touchcancel", swFinish);

  target.addEventListener("touchstart", e => {    // 滑开的行: 点到行外任何地方收掉
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
    target.querySelectorAll("#kind-tabs button").forEach(b =>
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
}
