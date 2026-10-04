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


def test_add_category_with_icon_and_color(usersdb):
    """加类别带自选图标/颜色 (1.7.0 弹框): 落库, 树的 icons/colors 表收录
    (大类短名/小类全名); 不带 = 默认不进表; 形状不对 (icon 大写、color 非 #rrggbb) 422。"""
    client, _ = _user(usersdb, "记账人甲")
    top = _post(client, "/bookkeeping/api/categories/add",
                {"kind": "expense", "parent": "", "name": "下午茶",
                 "icon": "juice", "color": "#8a5fc9"})
    assert top.status_code == 200, top.text
    assert top.json()["icons"]["下午茶"] == "juice" and top.json()["colors"]["下午茶"] == "#8a5fc9"
    kid = _post(client, "/bookkeeping/api/categories/add",
                {"kind": "expense", "parent": "餐饮", "name": "宵夜加餐",
                 "icon": "barbecue", "color": "#4dbf90"})
    assert kid.status_code == 200 and kid.json()["icons"]["餐饮/宵夜加餐"] == "barbecue"  # 小类全名
    plain = _post(client, "/bookkeeping/api/categories/add",
                  {"kind": "expense", "parent": "", "name": "素面朝天"})
    assert plain.status_code == 200, plain.text
    assert "素面朝天" not in plain.json()["icons"]       # 不带 = 默认, 不进表
    for body in ({"kind": "expense", "parent": "", "name": "大写图标", "icon": "Juice"},
                 {"kind": "expense", "parent": "", "name": "错的颜色", "color": "red"}):
        r = _post(client, "/bookkeeping/api/categories/add", body)
        assert r.status_code == 422, r.text              # 形状守卫在模型层


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


def test_category_view_and_entries(usersdb):
    """类别管理视图 (1.8.0 起住推入层): 页签/添加钮/列表/加载态与新建弹框
    (cm-*) 全在层模板里; 老地址 307 落回主页。1.7.0 起添加进弹框 (「＋ 新建
    大类」与大类组尾「＋ 添加小类」都进它)。"""
    anon = TestClient(m.app)
    assert anon.get("/bookkeeping/categories", follow_redirects=False).status_code == 302
    client, _ = _user(usersdb, "记账人甲")
    r = client.get("/bookkeeping/categories", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/bookkeeping/"
    js = _static("bookkeeping-categories.js")
    assert "function renderCategoriesView(target)" in js
    for pin in ("kind-tabs", "msg", "add-cat-btn", "cat-list", "loading", "load-error",
                "retry", "cat-modal", "cm-title", "cm-name", "cm-icon", "cm-icons",
                "cm-colors", "cm-err", "cm-ok", "cm-mask"):
        assert f'id="{pin}"' in js, f"类别管理视图缺 {pin}"
    assert 'placeholder="类别名字 (1-10 个字)"' in js   # 名字在弹框里 (1.7.0)
    assert "add-parent" not in js             # 「加在哪」下拉退役: 口挪进组尾
    settings = _static("bookkeeping-settings.js")
    assert 'data-push="categories"' in settings and "类别管理" in settings  # 设置视图里再推一层


def test_categories_js_wiring():
    """管理视图脚本: 三个写口 + 拉树灌色表, 树落 localStorage 与记账页同一份;
    新建走弹框, 删除走行左滑 (两击确认), 错误亮 detail; 元素查找收在 target
    里 (层滑出还挂 DOM 的空档不抓错层), 图标色表跨页接线都在。"""
    js = _static("bookkeeping-categories.js")
    assert '"/bookkeeping/api/categories", { cache: "no-store" }' in js
    for ep in ('/bookkeeping/api/categories/color', "/bookkeeping/api/categories/add",
               "/bookkeeping/api/categories/delete"):
        assert ep in js, f"缺写口 {ep}"
    assert 'localStorage.setItem("bk-categories-v2"' in js   # 与记账页同一份缓存
    assert "setCatColors(" in js and "catIcon(" in js
    assert "target.querySelector" in js and "document.querySelector" not in js
    assert "SWATCHES" in js and "默认" in js
    assert "data.detail" in js                             # 服务端的人话原因直出
    # 1.7.0 弹框 (两口都进它: 顶栏新建大类 + 大类组尾添加小类)
    assert 'data-act="add-kid"' in js and "modalFor" in js and "openModal" in js
    assert "fillParentSelect" not in js and "add-parent" not in js
    assert "addKidFor" not in js and "submitKid" not in js  # 就地输入行退役
    assert js.count("nameError(") == 2     # 定义 + 弹框提交口 (守门在提交)
    assert 'ev.key !== "Enter"' in js and "mName = ev.target.value" in js  # 回车=添加; 名字随打换预览
    assert "mIconLocked" in js and 'icon: modalIcon(), color: mColor' in js  # 手选锁定; 所见=落库
    assert "catIconBySlug" in js and "ICON_GROUPS" in js and "ICON_HINTS" in js  # 1.11.0 栅格分节
    assert '往「${modalFor}」加小类' in js  # 组尾进框带父类 (标题换)
    # 1.7.0 行左滑删除 (记账页账目行同一副手势): 滑开露红条, 两击确认
    assert "const SW_W = 72" in js and "swClick" in js and "closeOpenRow" in js
    assert 'closest(".sw-wrap")' in js and "passive: false" in js
    assert "armConfirmReset" in js and '"确认" : "删除"' in js  # 两击确认
    assert 'touchstart' in js and "touchcancel" in js
    assert "if (dx > 12) { sw = null; return; }" in js  # 右向让层的右划返回 (任意起手位)
    icons = _static("category-icons.js")
    assert "function setCatColors" in icons and "const CAT_COLORS = new Map()" in icons
    assert "const CAT_ICONS = new Map()" in icons   # 1.7.0: 自选图标同树灌入
    assert 'CAT_COLORS.get(key) || CAT_COLORS.get(key.split("/")[0])' in icons  # 小类落大类
    assert "CAT_ICONS.get(key) || CATEGORY_ICONS[key]" in icons  # 自选排在名字映射前
    assert "function catIconBySlug" in icons and \
           "const ICON_NAMES = Object.keys(ICON_BODIES)" in icons
    assert "setCatColors(tree);" in _static("bookkeeping-sync.js")      # 拉到树就灌色
    assert "setCatColors(catTree);" in _static("bookkeeping-boot.js")   # 开局缓存树先带色
    assert 'setCatColors(loadLS("bk-categories-v2"' in _static("bookkeeping-stats.js")
    html = _static("bookkeeping.html")      # 图标库/同步/开局脚本只随主页装 (层视图同吃)
    assert "category-icons.js?v=18" in html and \
           "bookkeeping-sync.js?v=5" in html and "bookkeeping-boot.js?v=8" in html
    css = _static("css/bookkeeping-panes.css")
    assert "pointer-events: none" in css   # 1.7.1: 压暗层不挡点击 (1.7.0 丢了这句, 点大类点不动)
