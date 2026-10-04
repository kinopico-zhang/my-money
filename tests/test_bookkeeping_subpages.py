"""记账推入层测试 (1.8.0): 设置/统计/类别管理/更新日志从独立网页并进记账页,
从右滑入盖住主页 (my-music 二级页同款)。钉三块: 主页入口接线 (data-push)、
层机制 (滑入/滑出/右划返回)、四个视图的渲染函数 (骨架先弹, 数据后拉)。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_quick_buttons_push_layers():
    """加号上方两枚圆钮: 统计/设置推层 (1.8.0 起不再跳页), data-push 认谁推谁;
    层挂点 #push-stack 在主页骨架里, 层样式/层机制/三个视图脚本随主页一起装
    (点开零网络零编译 — 这是「先弹页面再慢慢加载数据」的终极形态)。"""
    html = _static("bookkeeping.html")
    css = _static("css/bookkeeping-page.css")
    assert 'class="quick-btn" data-push="stats"' in html and \
        'class="quick-btn" data-push="settings"' in html
    assert 'href="/bookkeeping/stats' not in html and \
        'href="/bookkeeping/settings' not in html   # 跳页入口退役
    assert 'id="fab-stack"' in html and 'id="fab"' in html
    assert '<div id="push-stack"></div>' in html
    for src in ("css/bookkeeping-panes.css?v=4",
                "bookkeeping-settings.js?v=4", "bookkeeping-stats.js?v=3",
                "bookkeeping-categories.js?v=10", "bookkeeping-push.js?v=1",
                "bookkeeping-boot.js?v=8"):
        assert f'src="/bookkeeping/static/{src}"' in html or \
            f'href="/bookkeeping/static/{src}"' in html, f"主页没装 {src}"
    boot = _static("bookkeeping-boot.js")
    assert "for (const warm" not in boot      # 1.7.4 子页预热随独立页退役
    stack = css.split("#fab-stack {")[1].split("}")[0]
    assert "position: fixed; right: 18px;" in stack and "z-index: 60;" in stack
    panes = _static("css/bookkeeping-panes.css")
    z = panes.split("#push-stack {")[1].split("}")[0]
    assert "z-index: 65;" in z   # 压得住快捷钮 (60), 让位记一笔弹层 (70): 层开着加号点不着


def test_push_layer_mechanics():
    """层机制 (bookkeeping-push.js, my-music music-push-panes 同款移植):
    translateX(100%) 藏右沿、加 .open 滑入 (.34s 缓出曲线); 右划/右拖跟手
    (指针捕获 + 拖动关过渡), 过三分之一或带甩劲收层、否则弹回; 焦点早摘 +
    420ms 后移除 DOM (键盘收稳再拆, iOS 冻布局的坑); 同页重推不重开;
    Esc 收顶层; data-push 文档级委托。"""
    js = _static("bookkeeping-push.js")
    assert "const pushStack = [];" in js
    assert "translateX(100%)" in _static("css/bookkeeping-panes.css")
    assert "transition: transform .34s cubic-bezier(.32,.72,.35,1);" in \
        _static("css/bookkeeping-panes.css")
    assert "will-change: transform;" in _static("css/bookkeeping-panes.css")
    assert "void pane.offsetWidth;" in js    # 起点落地再放滑入 (rAF 会饿死)
    assert "pane.classList.add(\"open\")" in js
    assert "setPointerCapture" in js and 'pane.style.transition = "none";' in js
    assert "dx <= width / 3 && !flick" in js and "lastT < 100 && lastX - startX > 40" in js
    assert 'ev.key !== "Escape"' in js and \
        "closePushStack(pushStack.length - 1)" in js    # Esc 收顶层
    assert '#cat-modal:not([hidden]) .cm-mask' in js    # 弹框开着: Esc 先收框
    assert "data-push" in js and "document.addEventListener(\"click\"" in js
    assert "closePushStack" in js and "pushView" in js
    assert "swallowClick" in js               # 拖层松手吞尾随 click (键鼠不误触行)
    assert 'closest("#cat-modal")' in js      # 弹框开着: 框上起手不拖层 (旧全局右划同款)
    # 类别管理行左滑与层右划分家: 行的右向让给层 (层任意位置起手都是返回)
    cats = _static("bookkeeping-categories.js")
    assert "if (dx > 12) { sw = null; return; }" in cats


def test_subpages_behind_login_and_redirect(usersdb):
    """四个退役地址仍在登录墙后: 匿名 302 回记账 scope 的登录页 (中间件),
    登录后 307 落回记账主页 — 不 404 (404 会被 immutable 长缓存记住一年)。"""
    anon = TestClient(m.app)
    for path in ("/bookkeeping/settings", "/bookkeeping/stats",
                 "/bookkeeping/categories", "/bookkeeping/changelog"):
        r = anon.get(path, follow_redirects=False)
        assert r.status_code == 302, f"{path} 未拦"
        assert "/bookkeeping/login" in r.headers["location"]
    client, _ = _user(usersdb, "记账人甲")
    r = client.get("/bookkeeping/settings", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/bookkeeping/"
    assert client.get("/bookkeeping", follow_redirects=False).status_code == 200


def test_settings_view_wiring():
    """设置视图 (renderSettingsView): 账号/版本拉接口填上, 类别管理/更新日志
    在层里再推一层 (data-push), 退出登录 POST 完回登录页; 401 自己回登录页
    (层不是页面, 登录墙拦不到它)。"""
    js = _static("bookkeeping-settings.js")
    assert "async function renderSettingsView(target)" in js
    assert '"/api/me"' in js and "changelog/api/entries" in js
    assert '"/bookkeeping/api/logout"' in js and "location.href" in js
    assert 'data-push="categories"' in js and 'data-push="changelog"' in js
    assert "status === 401" in js and '"/bookkeeping/login"' in js
    assert 'id="me-name"' in js and 'id="ver"' in js and 'id="logout"' in js
    assert "类别管理" in js and "更新日志" in js and "退出登录" in js
    css = _static("css/bookkeeping-panes.css")
    # 1.9.0 修一: iOS 给按钮吃 flex 却不块化, 行按钮得 width: 100% 才吃满
    # 卡宽 (用户报「类别管理/更新日志没填充整行」; my-music 1.8.24 同款兜底)
    assert ".push-pane button.row { width: 100%; text-align: left; }" in css
    # 1.9.0 修二: 层顶衬与 my-music 根页首段标题同一高度 (env+14, 不吃
    # --top-clear 的 96 下限 — 用户点名对齐 my-music 根页)
    assert "padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px" in css


def test_stats_view_aggregates_local_ledger():
    """统计视图 (renderStatsView): 读本地账本 (与记账页同一份 localStorage),
    按月按大类按人聚合; 墓碑不算、下月封顶在当月、大类聚合 (子类归并)、
    金额条按榜首归一; 月导航/汇总/分类榜/记账人卡的骨架都在层模板里。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert "function renderStatsView(target)" in js
    assert '"bk-entries"' in js and "e.deleted" in js and "startsWith(month)" in js
    assert 'split("/")[0]' in js and "catIcon(" in js and "curMonth()" in js
    assert "createdByName" in js          # 记账人分摊: 本地刚记的没名字标「我」
    for pin in ("m-prev", "m-next", "m-title", "sum-out", "sum-in",
                "by-cat", "by-cat-in", "by-who", "income-card"):
        assert f'id="{pin}"' in js, f"统计视图缺 {pin}"
    assert ".bar {" in css and "tabular-nums" in css and "var(--red)" in css
    assert "#by-cat-in .bar i { background: var(--green); }" in css
