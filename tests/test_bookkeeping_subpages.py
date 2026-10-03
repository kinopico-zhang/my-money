"""记账子页测试: 主页快捷钮 (统计/设置) 与两个子页面 (路由/接线)。
两个子页都是纯静态页 + 小脚本: 数据侧统计页只读本地账本, 设置页只拉账号/版本。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_HOME = Path(__file__).parent.parent / "app" / "home" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_quick_buttons_on_main_page():
    """加号上方两枚圆钮: 统计/设置 (页面级导航纯链接, 白井圆钮坐深蓝灰图形)。
    悬浮位收成一竖排 (#fab-stack 定位, #fab 只管自己的脸)。"""
    html = _static("bookkeeping.html")
    css = _static("css/bookkeeping-page.css")
    assert 'href="/bookkeeping/stats?v=1"' in html and \
        'href="/bookkeeping/settings?v=1"' in html
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
    assert 'href="/bookkeeping/changelog?v=1"' in s.text and 'id="logout"' in s.text
    assert 'href="/bookkeeping/categories?v=1"' in s.text
    t = client.get("/bookkeeping/stats")
    assert t.status_code == 200, t.text
    for pin in ("m-prev", "m-next", "m-title", "sum-out", "sum-in",
                "by-cat", "by-cat-in", "by-who", "income-card"):
        assert f'id="{pin}"' in t.text, f"统计页缺 {pin}"
    assert "/bookkeeping/static/category-icons.js" in t.text   # 分类行图标复用类别图标库
    # 1.7.3 子页 HTML 也版本化: 带 ?v= 的一年 immutable (手机点开即画, 不再
    # 先等服务器点头), 不带的照旧 ETag 重校验; 挂载点无斜杠地址直出
    # (start_url/门厅链接/登录回跳指的都是它, 原先 307 跳斜杠版白付一跳)
    assert s.headers["cache-control"] == "no-cache"
    for path in ("/bookkeeping/settings?v=1", "/bookkeeping/stats?v=1",
                 "/bookkeeping/changelog?v=1", "/bookkeeping/categories?v=1"):
        assert client.get(path).headers["cache-control"] == \
            "public, max-age=31536000, immutable", path
    assert client.get("/bookkeeping", follow_redirects=False).status_code == 200


def test_back_swipe_everywhere():
    """1.7.1 全局右划返回: 返回钮退役 (设置/统计/类别管理三页撤掉), 四个子页
    (含更新日志) 都装 back-swipe.js 且 body 带 data-back 目标; 手势与类别列表
    的行左滑互不抢 (行滑那头认左缘起手右划让位), 弹框开着不返回。"""
    js = (_HOME / "back-swipe.js").read_text(encoding="utf-8")
    assert "document.body.dataset.back" in js and "location.href = target" in js
    assert "touchcancel" in js and "passive: false" in js
    assert 'closest("#cat-modal")' in js               # 弹框开着不返回
    for page, back in (("settings", "/bookkeeping/"), ("stats", "/bookkeeping/"),
                       ("changelog", "/bookkeeping/")):
        html = _static(f"{page}.html")
        assert f'data-back="{back}"' in html, f"{page} 没给返回目标"
        assert '<script src="/static/back-swipe.js?v=2"></script>' in html, page
        assert 'class="back"' not in html, f"{page} 返回钮没撤干净"
    cats = _static("categories.html")
    assert 'data-back="/bookkeeping/settings?v=1"' in cats and \
           '<script src="/static/back-swipe.js?v=2"></script>' in cats
    assert 'class="back"' not in cats                   # 类别管理返回的是设置页
    rows = _static("bookkeeping-categories.js")
    assert "sw.x0 < 24 && dx > 12" in rows              # 左缘右划让位给返回, 行不抢


def test_versioned_static_cache_control():
    """静态缓存头: 带 ?v= 的回一年 immutable (?v= 家规配套 — 2026-10-03
    设置/统计页点开慢的主修, 手机公网翻页不再逐个重拉资产); 不带的
    (manifest/图标这类没法换 URL 的) 照旧 ETag 协商, 改了能及时生效。"""
    client = TestClient(m.app)
    versioned = client.get("/bookkeeping/static/category-icons.js?v=17")
    assert versioned.status_code == 200
    assert versioned.headers["cache-control"] == \
        "public, max-age=31536000, immutable"
    plain = client.get("/bookkeeping/static/category-icons.js")
    assert plain.status_code == 200
    assert "immutable" not in plain.headers.get("cache-control", "")


def test_settings_js_wiring():
    """设置页脚本: 账号/版本拉接口填上, 退出登录 POST 完回登录页。"""
    js = _static("bookkeeping-settings.js")
    assert '"/api/me"' in js and "changelog/api/entries" in js
    assert '"/bookkeeping/api/logout"' in js and "location.href" in js
    # 1.7.3: 页面骨架进长缓存后登录墙拦不到它 — 会话过期 (401) 自己回登录页
    assert "status === 401" in js and '"/bookkeeping/login"' in js
    assert '<script src="/bookkeeping/static/bookkeeping-settings.js?v=3">' \
        in _static("settings.html")


def test_stats_js_aggregates_local_ledger():
    """统计页脚本: 读本地账本 (与记账页同一份 localStorage), 按月按大类按人聚合;
    墓碑不算、下月封顶在当月、大类聚合 (子类归并)、金额条按榜首归一。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-stats.css")
    assert '"bk-entries"' in js and "e.deleted" in js and "startsWith(month)" in js
    assert 'split("/")[0]' in js and "catIcon(" in js and "curMonth()" in js
    assert "createdByName" in js          # 记账人分摊: 本地刚记的没名字标「我」
    assert ".bar {" in css and "tabular-nums" in css and "var(--red)" in css


def test_subpage_warmup_lists():
    """1.7.4 子页预热: 主页就绪顺手把设置/统计两页的骨架+样式+脚本取进
    HTTP 缓存 (?v= 一年 immutable, 往后本地命中), 设置页再预热类别管理/
    更新日志 —— 连头一回点开也不用等网络。预热地址必须与目标页的实际
    引用同版本: 漂移了就是预热了个没人要的旧地址, 白忙。"""
    boot = _static("bookkeeping-boot.js")
    for url in ("/bookkeeping/settings?v=1", "/bookkeeping/stats?v=1",
                "/bookkeeping/static/bookkeeping-settings.js?v=3",
                "/bookkeeping/static/bookkeeping-stats.js?v=2",
                "/bookkeeping/static/css/bookkeeping-settings.css?v=4",
                "/bookkeeping/static/css/bookkeeping-stats.css?v=5",
                "/static/back-swipe.js?v=2"):
        assert f'"{url}"' in boot, f"主页预热缺 {url}"
    sjs = _static("bookkeeping-settings.js")
    for url in ("/bookkeeping/categories?v=1", "/bookkeeping/changelog?v=1",
                "/bookkeeping/static/bookkeeping-categories.js?v=5",
                "/bookkeeping/static/css/bookkeeping-categories.css?v=6",
                "/bookkeeping/static/css/bookkeeping-changelog.css?v=15",
                "/static/menu-user.js?v=2", "/static/changelog-page.js?v=1"):
        assert f'"{url}"' in sjs, f"设置页预热缺 {url}"
    # 版本对账: 预热列表里的静态地址, 目标页面里得有同串引用
    for url, page in (("/bookkeeping/static/bookkeeping-settings.js?v=3",
                       "settings.html"),
                      ("/bookkeeping/static/css/bookkeeping-settings.css?v=4",
                       "settings.html"),
                      ("/bookkeeping/static/bookkeeping-stats.js?v=2",
                       "stats.html"),
                      ("/bookkeeping/static/css/bookkeeping-stats.css?v=5",
                       "stats.html"),
                      ("/bookkeeping/static/bookkeeping-categories.js?v=5",
                       "categories.html"),
                      ("/bookkeeping/static/css/bookkeeping-categories.css?v=6",
                       "categories.html"),
                      ("/bookkeeping/static/css/bookkeeping-changelog.css?v=15",
                       "changelog.html"),
                      ("/static/menu-user.js?v=2", "changelog.html"),
                      ("/static/changelog-page.js?v=1", "changelog.html"),
                      ("/static/back-swipe.js?v=2", "settings.html")):
        assert f'"{url}"' in _static(page), f"{page} 实际引用与预热不同步: {url}"
