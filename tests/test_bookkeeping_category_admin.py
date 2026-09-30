"""类别管理测试: 设置页「类别管理」— 挑图标色 / 增删类别的接口守卫,
与管理页 + 各页色表接线的静态钉子。三个写口都回整棵新树 (客户端就地换)。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _entry, _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def _post(client, path, body):
    return client.post(path, json=body)


def test_category_admin_requires_login(usersdb):
    """三个写口都在登录墙后: 匿名一律 401 (改色也摸不到)。"""
    anon = TestClient(m.app)
    for path in ("/bookkeeping/api/categories/color",
                 "/bookkeeping/api/categories/add",
                 "/bookkeeping/api/categories/delete"):
        r = _post(anon, path, {"kind": "expense", "parent": "", "name": "餐饮"})
        assert r.status_code == 401, f"{path} 未拦"


def test_color_set_reset_and_shape(usersdb):
    """改色: 大类/小类各挑一色, 树的 colors 表全名收录; 空串撤掉自选;
    形状不是 #rrggbb 的一律拒 (422)。"""
    client, _ = _user(usersdb, "记账人甲")
    top = _post(client, "/bookkeeping/api/categories/color",
                {"kind": "expense", "parent": "", "name": "餐饮", "color": "#1b8e9c"})
    assert top.status_code == 200, top.text
    kid = _post(client, "/bookkeeping/api/categories/color",
                {"kind": "expense", "parent": "餐饮", "name": "早餐", "color": "#8a5fc9"})
    assert kid.status_code == 200, kid.text
    tree = client.get("/bookkeeping/api/categories").json()
    assert tree["colors"]["餐饮"] == "#1b8e9c"        # 大类按短名收
    assert tree["colors"]["餐饮/早餐"] == "#8a5fc9"    # 小类按全名收
    reset = _post(client, "/bookkeeping/api/categories/color",
                  {"kind": "expense", "parent": "", "name": "餐饮", "color": ""})
    assert reset.status_code == 200
    assert "餐饮" not in reset.json()["colors"]       # 撤自选 = 表里除名
    bad = _post(client, "/bookkeeping/api/categories/color",
                {"kind": "expense", "parent": "", "name": "餐饮", "color": "red"})
    assert bad.status_code == 422                      # 形状守卫在模型层
    miss = _post(client, "/bookkeeping/api/categories/color",
                 {"kind": "expense", "parent": "", "name": "不存在的", "color": "#111111"})
    assert miss.status_code == 404


def test_add_category_and_guards(usersdb):
    """加类别: 大类/小类都加得上 (小类排同层末尾); 重名、带 /、名字超 10 字、
    大类不存在、路径超 20 字都拒, 各带一句人话原因。"""
    client, _ = _user(usersdb, "记账人甲")
    kid = _post(client, "/bookkeeping/api/categories/add",
                {"kind": "expense", "parent": "餐饮", "name": "下午茶"})
    assert kid.status_code == 200, kid.text
    rtxn = next(g for g in kid.json()["expense"] if g["name"] == "餐饮")
    assert "下午茶" in rtxn["children"]        # 加进去了 (「其他」兜底恒排末位)
    top = _post(client, "/bookkeeping/api/categories/add",
                {"kind": "income", "parent": "", "name": "意外之财"})
    assert top.status_code == 200
    assert any(g["name"] == "意外之财" for g in top.json()["income"])
    for body, why in (
            ({"kind": "expense", "parent": "餐饮", "name": "早餐"}, "重名"),
            ({"kind": "expense", "parent": "", "name": "带/杠"}, "名字带 /"),
            ({"kind": "expense", "parent": "", "name": "一二三四五六七八九十一"}, "名字超 10 字")):
        r = _post(client, "/bookkeeping/api/categories/add", body)
        assert r.status_code in (400, 422), f"{why} 没拦: {r.text}"
        assert r.json()["detail"]
    gone = _post(client, "/bookkeeping/api/categories/add",
                 {"kind": "expense", "parent": "没有这大类", "name": "哪都行"})
    assert gone.status_code == 404                      # 归属得先存在
    _post(client, "/bookkeeping/api/categories/add",
          {"kind": "expense", "parent": "", "name": "十个字的大类名字啊哈"})
    over = _post(client, "/bookkeeping/api/categories/add",
                 {"kind": "expense", "parent": "十个字的大类名字啊哈",
                  "name": "小类名字也要满十字啊"})       # 10+1+10 = 21 字
    assert over.status_code == 400 and "不超过 20 字" in over.json()["detail"]


def test_delete_category_guards(usersdb):
    """删类别: 挂着小类的大类拒; 有账在用 (含墓碑) 拒并报笔数;
    干净的小类/自建大类删得掉, 树里跟着没了。"""
    client, _ = _user(usersdb, "记账人甲")
    has_kids = _post(client, "/bookkeeping/api/categories/delete",
                     {"kind": "expense", "parent": "", "name": "餐饮"})
    assert has_kids.status_code == 400 and "小类" in has_kids.json()["detail"]
    sync = client.post("/bookkeeping/api/sync", json={"entries": [
        _entry("del-guard-1", "2026-09-01T10:00:00", category="餐饮/早餐"),
        _entry("del-guard-2", "2026-09-01T11:00:00", category="餐饮/夜宵", deleted=True),
    ]})
    assert sync.status_code == 200, sync.text
    in_use = _post(client, "/bookkeeping/api/categories/delete",
                   {"kind": "expense", "parent": "餐饮", "name": "早餐"})
    assert in_use.status_code == 400 and "1 笔账" in in_use.json()["detail"]
    tomb = _post(client, "/bookkeeping/api/categories/delete",
                 {"kind": "expense", "parent": "餐饮", "name": "夜宵"})
    assert tomb.status_code == 400                     # 墓碑也算在用 (别机捏着活副本)
    _post(client, "/bookkeeping/api/categories/add",
          {"kind": "expense", "parent": "", "name": "试用大类"})
    clean = _post(client, "/bookkeeping/api/categories/delete",
                  {"kind": "expense", "parent": "", "name": "试用大类"})
    assert clean.status_code == 200
    assert not any(g["name"] == "试用大类" for g in clean.json()["expense"])


def test_category_page_and_links(usersdb):
    """管理页在登录墙后 + 页面骨架 (页签/添加行/列表/加载态) 与设置页入口。"""
    anon = TestClient(m.app)
    assert anon.get("/bookkeeping/categories", follow_redirects=False).status_code == 302
    client, _ = _user(usersdb, "记账人甲")
    page = client.get("/bookkeeping/categories")
    assert page.status_code == 200, page.text
    html = page.text
    for pin in ("kind-tabs", "msg", "add-parent", "add-name", "add-btn",
                "cat-list", "loading", "load-error", "retry"):
        assert f'id="{pin}"' in html, f"管理页缺 {pin}"
    assert 'href="/bookkeeping/settings"' in html       # 返回设置页
    settings = _static("settings.html")
    assert 'href="/bookkeeping/categories"' in settings and "类别管理" in settings


def test_categories_js_wiring():
    """管理页脚本: 三个写口 + 拉树灌色表, 树落 localStorage 与记账页同一份;
    删除两击确认、色票即点即存、错误亮 detail。图标色表跨页接线都在。"""
    js = _static("bookkeeping-categories.js")
    assert '"/bookkeeping/api/categories", { cache: "no-store" }' in js
    for ep in ('/bookkeeping/api/categories/color', "/bookkeeping/api/categories/add",
               "/bookkeeping/api/categories/delete"):
        assert ep in js, f"缺写口 {ep}"
    assert 'localStorage.setItem("bk-categories-v2"' in js   # 与记账页同一份缓存
    assert "setCatColors(" in js and "catIcon(" in js
    assert 'armConfirmReset' in js and '"确认" : "✕"' in js  # 两击确认
    assert "SWATCHES" in js and "默认" in js
    assert "data.detail" in js                             # 服务端的人话原因直出
    icons = _static("category-icons.js")
    assert "function setCatColors" in icons and "const CAT_COLORS = new Map()" in icons
    assert 'CAT_COLORS.get(key) || CAT_COLORS.get(key.split("/")[0])' in icons  # 小类落大类
    sync = _static("bookkeeping-sync.js")
    assert "setCatColors(tree);" in sync                   # 拉到树就灌色
    boot = _static("bookkeeping-boot.js")
    assert "setCatColors(catTree);" in boot                # 开局缓存树先带色
    stats = _static("bookkeeping-stats.js")
    assert 'setCatColors(loadLS("bk-categories-v2"' in stats  # 统计页吃缓存树
    html = _static("bookkeeping.html")
    assert "category-icons.js?v=15" in html and "bookkeeping-sync.js?v=3" in html \
        and "bookkeeping-boot.js?v=4" in html              # 改了内容的都进新缓存
    assert "category-icons.js?v=15" in _static("stats.html")
