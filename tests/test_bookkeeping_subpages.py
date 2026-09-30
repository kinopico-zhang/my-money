"""记账子页测试: 主页快捷钮 (统计/设置) 与两个子页面 (路由/接线)。
两个子页都是纯静态页 + 小脚本: 数据侧统计页只读本地账本, 设置页只拉账号/版本。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_quick_buttons_on_main_page():
    """加号上方两枚圆钮: 统计/设置 (页面级导航纯链接, 白井圆钮坐深蓝灰图形)。
    悬浮位收成一竖排 (#fab-stack 定位, #fab 只管自己的脸)。"""
    html = _static("bookkeeping.html")
    css = _static("css/bookkeeping-page.css")
    assert 'href="/bookkeeping/stats"' in html and 'href="/bookkeeping/settings"' in html
    assert 'id="fab-stack"' in html and 'id="fab"' in html and 'class="quick-btn"' in html
    stack = css.split("#fab-stack {")[1].split("}")[0]
    assert "position: fixed; right: 18px;" in stack and "z-index: 60;" in stack
    assert ".quick-btn {" in css and "#fab {" in css
    #    ↑ #fab 不再自带定位 (搬给竖排容器), 快捷钮与加号同一竖排出同一条 CSS
    fab = css.split("#fab {")[1].split("}")[0]
    assert "position: fixed" not in fab and "var(--accent)" in fab


def test_subpages_require_login(usersdb):
    """两个子页都在登录墙后: 匿名 302 回记账 scope 的登录页。"""
    anon = TestClient(m.app)
    for path in ("/bookkeeping/settings", "/bookkeeping/stats"):
        r = anon.get(path, follow_redirects=False)
        assert r.status_code == 302, f"{path} 未拦"
        assert "/bookkeeping/login" in r.headers["location"]


def test_subpages_serve(usersdb):
    """登录后两个子页 200: 设置页 (账号/版本/更新日志/退出), 统计页 (月导航/总账/分类/按人)。"""
    client, _ = _user(usersdb, "记账人甲")
    s = client.get("/bookkeeping/settings")
    assert s.status_code == 200, s.text
    assert 'id="me-name"' in s.text and 'id="ver"' in s.text
    assert 'href="/bookkeeping/changelog"' in s.text and 'id="logout"' in s.text
    t = client.get("/bookkeeping/stats")
    assert t.status_code == 200, t.text
    for pin in ("m-prev", "m-next", "m-title", "sum-out", "sum-in",
                "by-cat", "by-cat-in", "by-who", "income-card"):
        assert f'id="{pin}"' in t.text, f"统计页缺 {pin}"
    assert "/bookkeeping/static/category-icons.js" in t.text   # 分类行图标复用类别图标库


def test_settings_js_wiring():
    """设置页脚本: 账号/版本拉接口填上, 退出登录 POST 完回登录页。"""
    js = _static("bookkeeping-settings.js")
    assert '"/api/me"' in js and "changelog/api/entries" in js
    assert '"/bookkeeping/api/logout"' in js and "location.href" in js


def test_stats_js_aggregates_local_ledger():
    """统计页脚本: 读本地账本 (与记账页同一份 localStorage), 按月按大类按人聚合;
    墓碑不算、下月封顶在当月、大类聚合 (子类归并)、金额条按榜首归一。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-stats.css")
    assert '"bk-entries"' in js and "e.deleted" in js and "startsWith(month)" in js
    assert 'split("/")[0]' in js and "catIcon(" in js and "curMonth()" in js
    assert "createdByName" in js          # 记账人分摊: 本地刚记的没名字标「我」
    assert ".bar {" in css and "tabular-nums" in css and "var(--red)" in css
