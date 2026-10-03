// bookkeeping-settings — 设置视图 (1.8.0 起住推入层, 原 settings.html 整页退役):
// 当前账号 (/api/me) 与版本号 (更新日志第一条) 拉接口填上; 类别管理/更新日志
// 在层里再推一层; 退出登录 POST 完清 cookie 回登录页。更新日志视图 (原
// changelog.html) 也住这 — 小件同箱 (渲染函数模式照 my-music 的
// music-settings-view / music-changelog-view, 渲染目标由调用方给)。
"use strict";
// 类别管理/更新日志的入口是 data-push 钮 — 推层委托在 bookkeeping-push.js。
/* exported renderChangelogView, renderSettingsView */

// ------------------------------------------------------------ 设置
async function renderSettingsView(target) {
  target.innerHTML = `
    <div class="pane-title">设置</div>
    <div class="card">
      <div class="row"><span class="lbl">当前账号</span><span class="val" id="me-name">…</span></div>
      <button type="button" class="row" data-push="categories"><span class="lbl">类别管理</span><span class="chev">›</span></button>
      <button type="button" class="row" data-push="changelog"><span class="lbl">更新日志</span><span class="chev">›</span></button>
      <div class="row"><span class="lbl">版本</span><span class="val" id="ver">…</span></div>
    </div>
    <div class="card">
      <button type="button" class="row danger" id="logout">退出登录</button>
    </div>`;
  fetch("/api/me")                      // 门厅会话接口: 菜单那行账号信息同源
    .then(r => {
      // 骨架先弹出、数据后到 (用户点名): 层不是页面, 登录墙拦不到它 —
      // 401 自己回登录页, 账号行照旧占位兜底
      if (r.status === 401) location.replace("/bookkeeping/login");
      return r.ok ? r.json() : null;
    })
    .then(me => {
      if (me && me.name && target.isConnected) target.querySelector("#me-name").textContent = me.name;
    })
    .catch(() => { /* 断网: 行内容着占位 */ });
  fetch("/bookkeeping/changelog/api/entries")   // 版本号 = 版本线第一条
    .then(r => (r.ok ? r.json() : null))
    .then(vs => {
      if (vs && vs[0] && target.isConnected) target.querySelector("#ver").textContent = vs[0].version;
    })
    .catch(() => { /* 断网: 版本行内容着占位 */ });
  target.querySelector("#logout").addEventListener("click", () => {
    fetch("/bookkeeping/api/logout", { method: "POST" })
      .catch(() => { /* 清 cookie 在服务端, 失败也照走 (cookie 可能已没了) */ })
      .finally(() => { location.href = "/bookkeeping/login"; });
  });
}

// ------------------------------------------------------------ 更新日志
// 层内视图 (原是独立页 /bookkeeping/changelog): 拉同一个条目接口铺版本卡,
// 与记账页同文档, 记账状态不动。样式在 bookkeeping-panes.css (.cl-entries)。
const KIND_CLS = { "新增": "add", "改进": "imp", "修复": "fix" };

async function renderChangelogView(target) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  target.innerHTML = '<div class="pane-title">更新日志</div>'
    + '<div class="state"><div class="spin"></div>正在读取版本历史…</div>';
  let versions = null;
  try {
    const r = await fetch("/bookkeeping/changelog/api/entries", { cache: "no-store" });
    if (r.status === 401) { location.replace("/bookkeeping/login"); return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    versions = await r.json();
  } catch (_error) {
    if (!target.isConnected) return;   // 等数据的空档层已收走
    target.innerHTML = '<div class="pane-title">更新日志</div>'
      + '<div class="state"><div>加载失败, 检查网络后重试</div>'
      + '<button type="button" class="retry-btn">重试</button></div>';
    target.querySelector(".retry-btn").addEventListener(
      "click", () => renderChangelogView(target));
    return;
  }
  if (!target.isConnected) return;
  if (!versions.length) {
    target.innerHTML = '<div class="pane-title">更新日志</div>'
      + '<div class="state">还没有版本记录</div>';
    return;
  }
  target.innerHTML = `
    <div class="pane-title">更新日志</div>
    <div class="cl-entries">
      ${versions.map((v) => `
        <div class="ver">
          <div class="v-head">
            <span class="v-badge">${esc(v.version)}</span>
            <span class="v-date">${esc(v.date)}</span>
          </div>
          <ul class="v-items">${v.items.map((it) => `
            <li><span class="k k-${KIND_CLS[it.kind] || "imp"}">${esc(it.kind)}</span>
                <span class="t">${esc(it.text)}</span></li>`).join("")}
          </ul>
        </div>`).join("")}
    </div>`;
}
