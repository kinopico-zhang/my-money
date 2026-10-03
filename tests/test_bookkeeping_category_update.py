"""小类编辑测试 (1.9.0): 点小类行开框改名字/图标/颜色。接口守卫 + 改名迁账
(含墓碑, 按 kind 圈定) + 增量下游标顶账 (synced_at 顶, updated_at 不动 —
下行合并平局归服务器, 改名照样落地还不跟离线改动打 LWW 架) + 客户端
开框/提交/行身点按的接线钉子。admin 测试文件顶满 200 行, 编辑批收在这。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _entry, _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_UPDATE = "/bookkeeping/api/categories/update"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def _post(client, path, body):
    return client.post(path, json=body)


def test_update_requires_login(usersdb):
    """编辑口也在登录墙后: 匿名一律 401。"""
    anon = TestClient(m.app)
    r = _post(anon, _UPDATE, {"kind": "expense", "parent": "餐饮",
                              "name": "早餐", "new_name": "早饭"})
    assert r.status_code == 401


def test_update_rename_migrates_entries(usersdb):
    """改名: 树换新名, 图标/颜色跟着落; 账上的组合名 (含墓碑) 跟着迁且顶
    synced_at —— 增量下发把迁移带给各设备 (不顶就永远不再下发); 裸大类名
    的账不归这次改名管; updated_at 原样 (不动它才不跟任何一端的离线
    改动打架)。只改图标颜色 (new_name == name) 时不迁账, 一行都不重发。"""
    client, _ = _user(usersdb, "记账人甲")
    first = client.post("/bookkeeping/api/sync", json={"entries": [
        _entry("ren-live-1", "2026-09-01T10:00:00", category="餐饮/早餐"),
        _entry("ren-tomb-2", "2026-09-01T11:00:00", category="餐饮/早餐", deleted=True),
        _entry("ren-bare-3", "2026-09-01T12:00:00", category="餐饮"),
    ]})
    assert first.status_code == 200, first.text
    cursor = first.json()["server_now"]
    r = _post(client, _UPDATE, {"kind": "expense", "parent": "餐饮",
                                "name": "早餐", "new_name": "早饭",
                                "icon": "juice", "color": "#4dbf90"})
    assert r.status_code == 200, r.text
    tree = r.json()
    kids = next(g for g in tree["expense"] if g["name"] == "餐饮")["children"]
    assert "早饭" in kids and "早餐" not in kids
    assert tree["icons"]["餐饮/早饭"] == "juice"        # 图标/颜色跟着小类落
    assert tree["colors"]["餐饮/早饭"] == "#4dbf90"
    delta = client.post("/bookkeeping/api/sync", json={
        "entries": [], "last_sync": cursor}).json()
    by_id = {e["id"]: e for e in delta["entries"]}
    assert by_id["ren-live-1"]["category"] == "餐饮/早饭"  # 活账迁了 (顶了游标才再下发)
    assert by_id["ren-tomb-2"]["category"] == "餐饮/早饭"  # 墓碑也迁 (别的设备还捏着)
    assert by_id["ren-live-1"]["updated_at"].startswith("2026-09-01T10:00:00")  # 版本时间原样 (带 Z 后缀)
    assert "ren-bare-3" not in by_id                    # 裸大类名的账不归这回管
    cursor2 = delta["server_now"]
    plain = _post(client, _UPDATE, {"kind": "expense", "parent": "餐饮",
                                    "name": "早饭", "new_name": "早饭",
                                    "icon": "", "color": ""})
    assert plain.status_code == 200, plain.text
    assert "餐饮/早饭" not in plain.json()["icons"]     # 空串 = 撤自选
    again = client.post("/bookkeeping/api/sync", json={
        "entries": [], "last_sync": cursor2}).json()
    assert again["entries"] == []                       # 没迁账: 一行都不重发


def test_update_rename_respects_kind(usersdb):
    """收支两树同路径的小类互不牵连: 改支出树里的, 收入树同名的不动
    (账面迁移按 kind 圈定 —— 组合名只是字符串, 两树可以各有一个「对碰/甲」)。"""
    client, _ = _user(usersdb, "记账人甲")
    for kind in ("expense", "income"):
        top = _post(client, "/bookkeeping/api/categories/add",
                    {"kind": kind, "parent": "", "name": "对碰"})
        assert top.status_code == 200, top.text
        kid = _post(client, "/bookkeeping/api/categories/add",
                    {"kind": kind, "parent": "对碰", "name": "甲"})
        assert kid.status_code == 200, kid.text
    sync = client.post("/bookkeeping/api/sync", json={"entries": [
        _entry("kind-x-1", "2026-09-02T10:00:00", category="对碰/甲"),
        _entry("kind-x-2", "2026-09-02T11:00:00", kind="income",
               category="对碰/甲"),
    ]})
    assert sync.status_code == 200, sync.text
    r = _post(client, _UPDATE, {"kind": "expense", "parent": "对碰",
                                "name": "甲", "new_name": "乙"})
    assert r.status_code == 200, r.text
    delta = client.post("/bookkeeping/api/sync", json={
        "entries": [], "last_sync": sync.json()["server_now"]}).json()
    by_id = {e["id"]: e for e in delta["entries"]}
    assert by_id["kind-x-1"]["category"] == "对碰/乙"   # 支出侧迁了
    assert "kind-x-2" not in by_id                       # 收入侧同名不牵连


def test_update_guards(usersdb):
    """守卫: 只收小类 (大类牵一整组)、类别得在、重名拒、名字带 / 拒、
    路径超 20 字拒; 形状 (icon 大写 / color 非 #rrggbb) 在模型层 422。"""
    client, _ = _user(usersdb, "记账人甲")
    for body, why in (
            ({"kind": "expense", "parent": "", "name": "餐饮", "new_name": "吃饭"},
             "大类这版不改"),
            ({"kind": "expense", "parent": "餐饮", "name": "没有的", "new_name": "随"},
             "类别得在"),
            ({"kind": "expense", "parent": "餐饮", "name": "早餐", "new_name": "夜宵"},
             "重名拒"),
            ({"kind": "expense", "parent": "餐饮", "name": "早餐", "new_name": "带/杠"},
             "名字带 /")):
        r = _post(client, _UPDATE, body)
        assert r.status_code in (400, 404), f"{why} 没拦: {r.text}"
        assert r.json()["detail"]
    for body in ({"kind": "expense", "parent": "餐饮", "name": "早餐",
                  "new_name": "早饭", "icon": "Juice"},
                 {"kind": "expense", "parent": "餐饮", "name": "早餐",
                  "new_name": "早饭", "color": "red"}):
        assert _post(client, _UPDATE, body).status_code == 422    # 模型层形状守卫
    for body in ({"kind": "expense", "parent": "", "name": "十个字的大类名字啊哈"},
                 {"kind": "expense", "parent": "十个字的大类名字啊哈",
                  "name": "十字的小类名字啊啊"}):
        assert _post(client, "/bookkeeping/api/categories/add",
                     body).status_code == 200                     # 造 10+1+10 的深路径
    over = _post(client, _UPDATE, {"kind": "expense", "parent": "十个字的大类名字啊哈",
                                   "name": "十字的小类名字啊啊",
                                   "new_name": "新新的十字小类名字啊"})
    assert over.status_code == 400 and "不超过 20 字" in over.json()["detail"]


def test_update_js_wiring():
    """客户端接线: 点小类行身 (sw-body) 开同一枚新建弹框, 名字/图标/颜色
    先铺现状 (开局锁图标 —— 当前的可能是手挑的); 提交按编辑/新建分走
    update/add 两口; 删除条露着时点行身是收条不是开框; 版本钉随批 bump。"""
    js = _static("bookkeeping-categories.js")
    assert 'data-act="edit"' in js and 'aria-label="编辑 ${esc(name)}"' in js
    assert "openModal(parent, name);" in js            # 行身点按进编辑
    assert "wrap === staleRow()" in js                 # 删除条露着: 收条不开框
    assert 'let mEditName = "";' in js
    assert "编辑「${mEditName}」" in js
    assert '$("#cm-ok").textContent = mEditName ? "保存" : "添加";' in js
    assert "mIcon = mEditName ? iconSlugFor(`${parent}/${mEditName}`) : \"\";" in js
    assert 'mColor = mEditName ? ownColor(parent, mEditName) : "";' in js
    assert '"/bookkeeping/api/categories/update"' in js
    assert "{ kind, parent, name: mEditName, new_name: name," in js
    html = _static("bookkeeping.html")
    assert "bookkeeping-categories.js?v=7" in html     # 编辑批: 内容定稿后 bump
    assert "css/bookkeeping-panes.css?v=2" in html     # 行宽兜底 + 标题顶衬同批
