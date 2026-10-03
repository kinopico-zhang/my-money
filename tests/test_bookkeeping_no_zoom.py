"""全应用禁缩放测试 (1.7.0): 8 个页面 (记账/类别管理/设置/统计/更新日志/
登录/注册/账号) 双指捏合、双击、点输入框的自动放大一概掐死。三层防线:
viewport meta 的 maximum-scale/user-scalable (双击与聚焦自动放大)、body 后
第一条 no-zoom.js 拦 iOS Safari 的非标准 gesture 事件 (页面捏合不吃
touch-action, 只能拦事件本身)、各页 css 的 body touch-action: pan-y
(Chrome/Android 的捏合)。page_and_categories 顶满 200 行, 这组钉单开一份。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app"
_BOOK = _BASE / "bookkeeping" / "static"
_HOME = _BASE / "home" / "static"

PAGES = [(_BOOK / name) for name in
         ("bookkeeping.html", "categories.html", "settings.html",
          "stats.html", "changelog.html")] + \
        [(_HOME / name) for name in
         ("login.html", "register.html", "accounts.html")]


def test_no_zoom_on_every_page():
    """8 页同款: meta 掐双击/聚焦放大; no-zoom.js 是 body 后第一条脚本
    (拦在业务脚本之前), 拦的正是 iOS 捏合的那对 gesture 事件。"""
    for page in PAGES:
        html = page.read_text(encoding="utf-8")
        assert "maximum-scale=1, user-scalable=no" in html, \
            f"{page.name} 的 viewport meta 没掐缩放"
        assert '<script src="/static/no-zoom.js?v=2"></script>' in html, \
            f"{page.name} 没装 no-zoom"
        body_at = html.index("<body")             # 记账/更新日志页带数据属性
        assert html.index("<script", body_at + 1) == \
            html.index('<script src="/static/no-zoom.js?v=2"></script>'), \
            f"{page.name} 的 no-zoom 不是 body 后第一条脚本"
    js = (_HOME / "no-zoom.js").read_text(encoding="utf-8")
    assert '"gesturestart", "gesturechange"' in js   # iOS 捏合走非标准 gesture 事件
    assert "preventDefault" in js


def test_no_zoom_body_touch_action():
    """7 份页面 css 的 body 收口 pan-y (Chrome/Android 捏合); 记账主页的
    page.css 原本就有一份 (1.5.x), 不回归。行内控件自带更窄的 touch-action,
    不被 body 的收口波及。"""
    css_files = [(_BOOK / "css" / f"bookkeeping-{name}.css")
                 for name in ("categories", "settings", "stats", "changelog")] + \
                [(_HOME / "css" / f"{name}-page.css")
                 for name in ("login", "register", "accounts")]
    for css in css_files:
        assert "touch-action: pan-y;" in css.read_text(encoding="utf-8"), \
            f"{css.name} 的 body 没收口"
    page_css = (_BOOK / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    assert "touch-action: pan-y;" in page_css     # 记账主页那份不回归
