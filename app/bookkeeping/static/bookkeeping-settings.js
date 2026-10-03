// bookkeeping-settings — 设置页脚本: 当前账号 (/api/me) 与版本号 (更新日志第一条)
// 拉接口填上; 退出登录 POST 完清 cookie 回登录页。纯小件, 不碰账本数据。
"use strict";

(() => {
  const $ = s => document.querySelector(s);

  fetch("/api/me")                      // 门厅会话接口: 菜单那行账号信息同源
    .then(r => {
      // 页面骨架带版本号进了长缓存 (2026-10-03 秒开批), 会话过期时登录墙
      // 拦不到它 — 401 自己回登录页, 账号行照旧占位兜底
      if (r.status === 401) location.href = "/bookkeeping/login";
      return r.ok ? r.json() : null;
    })
    .then(me => { if (me && me.name) $("#me-name").textContent = me.name; })
    .catch(() => { /* 断网: 行内容着占位 */ });

  fetch("/bookkeeping/changelog/api/entries")   // 版本号 = 版本线第一条
    .then(r => (r.ok ? r.json() : null))
    .then(vs => { if (vs && vs[0]) $("#ver").textContent = vs[0].version; })
    .catch(() => { /* 断网: 版本行内容着占位 */ });

  $("#logout").addEventListener("click", () => {
    fetch("/bookkeeping/api/logout", { method: "POST" })
      .catch(() => { /* 清 cookie 在服务端, 失败也照走 (cookie 可能已没了) */ })
      .finally(() => { location.href = "/bookkeeping/login"; });
  });
})();
