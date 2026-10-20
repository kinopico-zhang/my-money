// bookkeeping-tags — 标签管理 (1.15.0, 10-10 用户点名「设置页面新增一个标签
// 管理页面, 可以添加修改标签」): 设置页里再推一层。标签没有服务端的家 —
// 平时都长在账上 (e.tags) 外加挖财种子 (catTree.tags), 手动添的先记进本地
// 字典 bk-tags-v1 (还没上账也在册, 记一笔选标签时就能挑到)。榜 = 字典 +
// 账上在用 + 种子三路并一, 按字符顺序排 (用户点名 — 与筛选的标签页同一把
// 尺); 行尾跟着几笔在用。改名是真改: 字典、种子、账上每一笔的标签数组全
// 换新名 (走脏名单照常上行), 不止改个显示名。数据/工具函数全是 state.js
// 的全局 (entries/dirty/persist/parseTags), 渲染真身只此一家。
"use strict";
/* global catTree, dirty, entries, esc, loadLS, parseTags, persist, render,
          saveLS, scheduleSync */
/* exported renderTagsView */

// 全量标签榜: [[名字, 在用笔数]] — 字典/种子里没上账的计数 0, 账上用的计
// 实际笔数; 同名并一路 (账上的计数为准)。排序 = 默认字符序 (不是拼音序)
function tagList() {
  const m = new Map();
  const add = (name, n) => { if (name && !m.has(name)) m.set(name, n); };
  for (const t of loadLS("bk-tags-v1", []))          // 手动添的 (串数组)
    add(typeof t === "string" ? t : t && t.name, 0);
  for (const t of (catTree && catTree.tags) || [])   // 挖财种子 (旧缓存还是串数组, 兼一手)
    add(typeof t === "string" ? t : t && t.name, 0);
  for (const e of entries) {
    if (e.deleted) continue;
    for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
  }
  return [...m].sort().reverse();   // 字典倒序 (10-10 用户改口径), 与筛选标签页同一把尺
}

function renderTagsView(target) {
  let editing = null;   // 正在改名的行 (旧名): 行内换成输入框, ✓ 落 ✕ 撤

  function paint() {
    const rows = tagList().map(([name, n]) => name === editing
      ? `<div class="tg-row edit">` +
        `<input id="tg-input" maxlength="12" value="${esc(name)}" autocomplete="off">` +
        `<button type="button" class="tg-ok" aria-label="保存">✓</button>` +
        `<button type="button" class="tg-no" aria-label="取消">✕</button></div>`
      : `<button type="button" class="tg-row" data-k="${esc(name)}">` +
        `<span class="tg-name">#${esc(name)}</span>` +
        `<span class="tg-n">${n ? `${n} 笔` : "还没用过"}</span>` +
        `<span class="tg-pen">改名</span></button>`).join("");
    target.innerHTML = `
      <div class="pane-title">标签管理</div>
      <div class="card">
        <div class="tg-add">
          <input id="tg-new" maxlength="12" placeholder="打一个新标签" autocomplete="off">
          <button type="button" id="tg-add-btn">添加</button>
        </div>
        <div class="tg-msg" id="tg-msg" hidden></div>
        <div id="tg-rows">${rows || '<div class="empty">还没有标签 — 顶上添一个, 或记账时打一个</div>'}</div>
      </div>`;
    if (editing) {                 // 改名行自动聚焦选全 (点行就是奔着改来的)
      const inp = target.querySelector("#tg-input");
      inp.focus();
      inp.select();
    }
  }

  function say(text) {             // 校验不过的轻提示 (输入不收, 停在哪行还亮哪行)
    const m = target.querySelector("#tg-msg");
    m.textContent = text;
    m.hidden = false;
  }

  function addTag() {
    const [t] = parseTags(target.querySelector("#tg-new").value);   // 与记账同一副清洗
    if (!t) return;
    if (tagList().some(([n]) => n === t)) { say(`已经有「${t}」这个标签了`); return; }
    const d = loadLS("bk-tags-v1", []).filter(x => typeof x === "string");
    d.push(t);
    saveLS("bk-tags-v1", d);
    paint();
  }

  function rename(oldName) {
    const [t] = parseTags(target.querySelector("#tg-input").value);
    if (!t) { say("名字不能是空的"); return; }
    if (t !== oldName && tagList().some(([n]) => n === t)) {
      say(`已经有「${t}」这个标签了`);
      return;
    }
    saveLS("bk-tags-v1", loadLS("bk-tags-v1", [])
      .map(x => x === oldName ? t : x));                            // ① 字典换名
    const seeds = (catTree && catTree.tags) || [];                  // ② 种子里的旧名换新名
    if (catTree && seeds.some(s => (typeof s === "string" ? s : s.name) === oldName)) {
      catTree.tags = seeds.map(s =>
        (typeof s === "string" ? s : s.name) === oldName
          ? (typeof s === "string" ? t : { ...s, name: t }) : s);
      saveLS("bk-categories-v2", catTree);
    }
    for (const e of entries) {                 // ③ 账上每一笔的标签跟着换 (脏名单上行)
      const ts = Array.isArray(e.tags) ? e.tags : null;
      if (!ts || !ts.includes(oldName)) continue;
      e.tags = ts.map(x => x === oldName ? t : x);
      dirty.add(e.id);
    }
    persist();
    scheduleSync();
    editing = null;
    paint();
    render();                                  // 主页账目行上的标签也换 (记一笔存完同一副)
  }

  target.addEventListener("click", ev => {
    const b = ev.target instanceof Element && ev.target.closest("button");
    if (b && b.id === "tg-add-btn") { addTag(); return; }
    if (b && b.classList.contains("tg-ok")) { rename(editing); return; }
    if (b && b.classList.contains("tg-no")) { editing = null; paint(); return; }
    const row = ev.target instanceof Element && ev.target.closest(".tg-row[data-k]");
    if (row) { editing = row.dataset.k; paint(); }   // 点行 = 行内改名
  });
  target.addEventListener("keydown", ev => {         // 回车 = 落 (添加口/改名行都认)
    if (ev.key !== "Enter") return;
    const id = ev.target instanceof Element && ev.target.id;
    if (id === "tg-new") addTag();
    else if (id === "tg-input") rename(editing);
  });
  paint();
}
