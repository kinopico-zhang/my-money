"""My Money 更新日志测试: 独立版本线 (2026-09-14 从 My Tesla 的日志拆出) +
条目接口 + 层内视图 (1.8.0 起更新日志住推入层, 不再是独立页)。"""
from pathlib import Path

from app.bookkeeping import changelog

_JS = (Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
       / "bookkeeping-settings.js").read_text(encoding="utf-8")


# ---------------------------------------------------------------- 数据
def test_versions_wellformed():
    """独立版本线从 1.0.0 起; 每版字段齐全, 文案是用户视角的一句话。"""
    vs = changelog.entries()
    assert [v.version for v in vs] == ["1.9.0", "1.8.0", "1.7.4", "1.7.3",
                                       "1.7.2", "1.7.1", "1.7.0", "1.6.2",
                                       "1.6.1", "1.6.0", "1.5.2", "1.5.1",
                                       "1.5.0", "1.4.0", "1.3.1",
                                       "1.3.0", "1.2.0", "1.1.0", "1.0.1",
                                       "1.0.0"]
    assert vs[0].date == "2026-10-04"
    kinds = {it.kind for it in vs[0].items}
    assert kinds <= {"新增", "改进", "修复"}   # 合并批次 (单功能批次不硬凑修复)
    for v in vs:
        assert v.items
        assert len(v.date) == 10 and v.date[4] == "-"
        for it in v.items:
            assert it.kind in ("新增", "改进", "修复")
            assert len(it.text) >= 4
            assert "api/" not in it.text and "http" not in it.text
    assert kinds == {"修复"} or vs[0].items[0].kind in ("新增", "改进")
    #    ↑ 批头条目是主打 (打磨批首条也是改进); 纯修复小版本 (1.6.1 图标灰压平)
    #    整批只有修复, 头条就是修复, 不硬凑改进
    assert "My Tesla" not in " ".join(it.text for v in vs for it in v.items)


# ---------------------------------------------------------------- 接口
def test_money_changelog_entries_endpoint(auth):
    """条目接口原样吐数据 (新→老), 字段形状与层内渲染器对齐。"""
    es = auth.get("/bookkeeping/changelog/api/entries").json()
    assert [e["version"] for e in es] == [v.version for v in changelog.entries()]
    for e, v in zip(es, changelog.entries()):
        assert e["date"] == v.date
        assert e["items"] == [{"kind": it.kind, "text": it.text}
                              for it in v.items]
    k0 = {i["kind"] for i in es[0]["items"]}
    assert k0 == {"修复"} or es[0]["items"][0]["kind"] in ("新增", "改进")
    #   ↑ 批头条目是主打; 纯修复小版本 (1.6.1 图标灰压平) 整批只有修复, 不硬凑改进


# ---------------------------------------------------------------- 层内视图
def test_money_changelog_view_renderer():
    """更新日志视图 (renderChangelogView, 住 bookkeeping-settings.js): 拉同一
    条目接口铺版本卡 — 页顶大标题 + 加载/失败重试态 + 版本徽标/日期/条目,
    401 回登录页; 版本卡的样式在 bookkeeping-panes.css (.cl-entries)。"""
    assert "async function renderChangelogView(target)" in _JS
    assert '"/bookkeeping/changelog/api/entries"' in _JS
    assert "status === 401" in _JS and '"/bookkeeping/login"' in _JS
    assert 'const KIND_CLS = { "新增": "add", "改进": "imp", "修复": "fix" };' in _JS
    for pin in ("pane-title", "cl-entries", "v-badge", "v-date",
                "v-items", "retry-btn", "正在读取版本历史", "还没有版本记录"):
        assert pin in _JS, f"更新日志视图缺 {pin}"
    assert "target.isConnected" in _JS       # 等数据的空档层已收走: 不写死层


def test_money_changelog_view_css():
    """版本卡样式 (panes.css, 收在 .push-pane 下不漏主页): 徽标浅蓝/日期弱字/
    三色条目徽标与退役前同款。"""
    css = (Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
           / "css" / "bookkeeping-panes.css").read_text(encoding="utf-8")
    assert ".push-pane .cl-entries .v-badge {" in css
    assert "color: #7db3f0;" in css and "k-add" in css and "k-imp" in css \
        and "k-fix" in css
    # 层内滚动器: 本体回弹保留、向外滚动链掐断 (别带主页), 横向锁死
    # (滚动条不画是 page.css 的文档级规则, 层天然继承)
    for pin in ("overflow-y: auto", "overscroll-behavior: contain",
                "overflow-x: hidden"):
        assert pin in css, f"层内滚动器缺 {pin}"


def test_money_changelog_old_url_redirects(auth):
    """退役的独立页地址: 落回记账主页 (307), 不 404 — 404 会被长缓存记住
    (地址一年 immutable 的家规把「不存在」也钉一年), 老书签/旧链接得给条活路。"""
    for path in ("/bookkeeping/changelog", "/bookkeeping/settings",
                 "/bookkeeping/stats", "/bookkeeping/categories"):
        r = auth.get(path, follow_redirects=False)
        assert r.status_code == 307, f"{path} 不是跳转: {r.status_code}"
        assert r.headers["location"] == "/bookkeeping/", path
