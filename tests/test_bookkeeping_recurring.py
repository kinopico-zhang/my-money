"""周期账测试 (1.15.0, 10-14 用户点名「添加账目的时候, 提供一个按钮, 点开
可以把这个账目设置成周期帐, 展开周期帐的设置界面 — 开始时间/结束时间/
重复周期/入账日期/入账时间」): 规则立在服务端 (recurring 表, 接口模型住
store/recurring.py — schemas.py 按 200 行硬上限装不下第二摊), 同步时
materialize 到点落账 (不起后台线程 — 客户端每分钟的同步就是发令枪,
歇过的日子下次同步一并补齐)。首账 = 手工记的那笔 (anchor 只往后生成,
不重发); 生成账 id 是 "{rule_id}:{date}" 确定性组合; 月/年的 31 号在
短月自动收月底; 删规则是墓碑 (已落的账留着)。"""
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

import app.main as m
from app.bookkeeping import store
from app.bookkeeping.store import recurring as rec
from tests.bookkeeping_sync_helpers import _entry, _sync, _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _rule(**kw):
    """一条上传形状的周期账规则 (缺省: 每月 1 号, 首账/开始都是 2026-10-14)。"""
    return {"amount": 3000, "kind": "expense", "category": "住房/房租",
            "tags": ["房租"], "note": "", "cycle": "monthly", "post_day": 1,
            "post_month": 1, "post_time": "",
            "start_date": "2026-10-14", "end_date": "",
            "anchor_date": "2026-10-14", **kw}


def _ids(bkdb):
    return [e.id for e in bkdb.execute(select(store.Entry)).scalars()]


def test_occurrence_math():
    """落账日推算 (店里的纯函数): on_or_after 起 (含) 第一个匹配日; weekly
    周几对上 (周日=0); monthly/yearly 几号对上, 短月自动收月底 (2 月没有
    31 号落 28, 闰年 29; 年账 2 月 29 在平年落 28); daily 天天落。"""
    assert rec._next_match("daily", 0, 1, date(2026, 10, 14)) == "2026-10-14"
    # 2026-10-14 是周三: weekly 对上当天 (含起算), 周四是转天, 周日跳到 10-18
    assert rec._next_match("weekly", 3, 1, date(2026, 10, 14)) == "2026-10-14"
    assert rec._next_match("weekly", 4, 1, date(2026, 10, 14)) == "2026-10-15"
    assert rec._next_match("weekly", 0, 1, date(2026, 10, 14)) == "2026-10-18"
    # 短月收月底: 31 号的月账 2 月没有就落月末 (平年 28 / 闰年 29)
    assert rec._next_match("monthly", 31, 1, date(2026, 2, 1)) == "2026-02-28"
    assert rec._next_match("monthly", 31, 1, date(2028, 2, 1)) == "2028-02-29"
    assert rec._next_match("yearly", 29, 2, date(2026, 3, 1)) == "2027-02-28"
    assert rec._next_match("yearly", 25, 12, date(2026, 10, 14)) == "2026-12-25"


def test_create_rule_anchor_and_window(bkdb):
    """立规则: 首账 (anchor) 是手工记的那笔 — 生成的从 anchor 之后起;
    开始更晚从开始起; 结束线拦在第一笔之前直接收摊 (next_date 空)。"""
    rule = store.create_rule(bkdb, "u1", rec.RecurringIn(**_rule()))
    assert rule.next_date == "2026-11-01"          # anchor 10-14 之后的每月 1 号
    rule2 = store.create_rule(bkdb, "u1", rec.RecurringIn(**_rule(
        amount=10, cycle="daily", post_day=0,
        start_date="2026-11-20", end_date="2026-11-25")))
    assert rule2.next_date == "2026-11-20"         # 开始晚于首账: 从开始那天起
    rule3 = store.create_rule(bkdb, "u1", rec.RecurringIn(**_rule(
        amount=10, cycle="weekly", post_day=3,     # 周三: 首笔 10-21, 结束拦在 10-20
        end_date="2026-10-20")))
    assert rule3.next_date == ""                   # 出了结束线: 收摊


def test_materialize_due_and_idempotent(bkdb):
    """落账: 入账时刻到了才算到点; 落过的不再落 (确定性 id + 游标前挪);
    anchor 那天自己不落 (首账是手工记的那笔); 墓碑规则不落。"""
    rule = store.create_rule(bkdb, "u1", rec.RecurringIn(**_rule(
        amount=25, category="餐饮/早餐", tags=["早餐"], cycle="daily",
        post_day=0, post_time="09:00",
        start_date="2026-10-10", end_date="", anchor_date="2026-10-10")))
    rec.materialize(bkdb, now=datetime(2026, 10, 12, 8, 0))
    ids = _ids(bkdb)
    assert f"{rule.id}:2026-10-11" in ids          # 11 号 09:00 已到点
    assert f"{rule.id}:2026-10-12" not in ids      # 12 号 09:00 还没到 (现在 08:00)
    assert f"{rule.id}:2026-10-10" not in ids      # anchor 那天: 手工那笔顶着
    first = bkdb.get(store.Entry, f"{rule.id}:2026-10-11")
    assert (first.date, first.time, first.amount, first.category) == \
        ("2026-10-11", "09:00", 25, "餐饮/早餐")
    assert first.tags == "早餐" and first.created_by == "u1"
    rec.materialize(bkdb, now=datetime(2026, 10, 12, 10, 0))
    ids = _ids(bkdb)
    assert ids.count(f"{rule.id}:2026-10-11") == 1   # 补过的不再补
    assert f"{rule.id}:2026-10-12" in ids            # 这回 12 号到点了
    store.delete_rule(bkdb, rule.id)
    rec.materialize(bkdb, now=datetime(2026, 10, 20, 10, 0))
    assert f"{rule.id}:2026-10-13" not in _ids(bkdb)  # 墓碑: 之后不再生成


def test_recurring_api_and_sync(usersdb, bkdb):
    """接口 + 同步顺路落账: 立规则 (POST) / 清单 (GET, 带下一笔) / 删
    (DELETE 墓碑); 同步把到点的生成账随增量下发, 生成账能改 (LWW) 改完
    不重发; 401 拦匿名。"""
    client, _ = _user(usersdb, "记账人甲")
    r = client.post("/bookkeeping/api/recurring", json=_rule(
        start_date="2026-09-01", anchor_date="2026-09-01"))
    assert r.status_code == 200, r.text
    rule = r.json()
    assert rule["next_date"] == "2026-10-01"       # 9-01 手工那笔, 下一笔 10-01
    lst = client.get("/bookkeeping/api/recurring").json()
    assert [x["id"] for x in lst] == [rule["id"]]
    # 首同步 (全量): 到点的 10-01 那笔已落并下发 (记账人名字照常解析)
    data = _sync(client)
    got = {e["id"]: e for e in data["entries"]}
    assert f"{rule['id']}:2026-10-01" in got
    gen = got[f"{rule['id']}:2026-10-01"]
    assert (gen["category"], gen["amount"], gen["time"]) == ("住房/房租", 3000, "")
    assert gen["created_by_name"] == "记账人甲"
    # 再同步: 游标已过, 不重发
    data2 = _sync(client, last_sync=data["server_now"])
    assert not [e for e in data2["entries"] if e["id"].startswith(rule["id"])]
    # 生成账改一笔 (LWW): 版本时间取下发那版 +1 秒, 必新得过服务端那版
    later = (datetime.fromisoformat(gen["updated_at"])
             + timedelta(seconds=1)).isoformat()
    _sync(client, entries=[_entry(
        f"{rule['id']}:2026-10-01", later,
        date="2026-10-01", category="住房/房租", amount=3100)])
    edited = bkdb.get(store.Entry, f"{rule['id']}:2026-10-01")
    assert edited is not None and edited.amount == 3100
    # 删规则 (墓碑): 清单空了, 已落的账还在
    assert client.delete(f"/bookkeeping/api/recurring/{rule['id']}").status_code == 200
    assert client.get("/bookkeeping/api/recurring").json() == []
    assert client.delete(f"/bookkeeping/api/recurring/{rule['id']}").status_code == 404
    data3 = _sync(client, last_sync=None)
    assert f"{rule['id']}:2026-10-01" in {e["id"] for e in data3["entries"]}
    # 匿名 401 (中间件墙)
    assert TestClient(m.app).get("/bookkeeping/api/recurring").status_code == 401


def test_recurring_validation(usersdb):
    """校验: weekly 的入账日 0-6 / monthly·yearly 1-31 / yearly 月 1-12;
    入账时刻 HH:MM; 结束不早于首账; 金额恒正。"""
    client, _ = _user(usersdb, "记账人甲")
    bad = [
        _rule(cycle="weekly", post_day=7),                    # 周几越界
        _rule(cycle="monthly", post_day=0),                   # 几号越界
        _rule(cycle="yearly", post_month=13, post_day=15),    # 月越界
        _rule(post_time="25:00"),                             # 时刻形状不对
        _rule(end_date="2026-10-01"),                         # 结束早于首账
        _rule(amount=0),                                      # 金额要恒正
        _rule(start_date="2026/10/14"),                       # 日期形状不对
    ]
    for body in bad:
        assert client.post("/bookkeeping/api/recurring",
                           json=body).status_code == 422, body


def test_recurring_js_wiring():
    """前端接线: 记一笔弹层的「周期」牌 (新记才亮, hidden 防 display:flex 盖
    掉) 点开周期设置层 — 重复周期/入账日期 (随周期换面孔)/入账时刻/开始·
    结束 (结束空 = 不限, 拨轮借 when-pick 的 date/time 两副面孔); 完成 =
    存账 + submitCycle 规则上服务端 (断网排队 bk-cyc-queue, 同步成功
    flushCycleQueue 补交); 开层回零挂 openSheet、关层收面板挂 closeSheet;
    设置页「周期账」清单 data-push="cyc" → push.js 注册 renderCycView。"""
    html = (_BASE / "bookkeeping.html").read_text(encoding="utf-8")
    sheet = (_BASE / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
    rec_js = (_BASE / "bookkeeping-recurring.js").read_text(encoding="utf-8")
    pad = (_BASE / "bookkeeping-amount-pad.js").read_text(encoding="utf-8")
    sync_js = (_BASE / "bookkeeping-sync.js").read_text(encoding="utf-8")
    settings_js = (_BASE / "bookkeeping-settings.js").read_text(encoding="utf-8")
    push_js = (_BASE / "bookkeeping-push.js").read_text(encoding="utf-8")
    css = (_BASE / "css" / "bookkeeping-entry-sheet.css").read_text(encoding="utf-8")
    panes = (_BASE / "css" / "bookkeeping-panes.css").read_text(encoding="utf-8")
    # 弹层: 第三枚胶囊牌 + 设置层骨架 + 脚本随主页装
    assert 'id="cyc-btn"' in html and 'id="cyc-pick"' in html \
        and 'id="cyp-body"' in html
    assert 'bookkeeping-recurring.js?v=2' in html
    # 拨轮两副面孔 + 开层回零/关层收面板
    assert "function openWhenPick(mode, sink)" in sheet \
        and "pick.dataset.mode = mode" in sheet
    assert "resetCyclePanel(entry);" in sheet and "closeCycPick();" in sheet
    assert 'openWhenPick("time"' in rec_js and 'openWhenPick("date"' in rec_js
    assert 'openWhenPick("entry")' in sheet
    # hidden 被 .field 的 display:flex 盖掉 → css 补刀 (cat-ghost 同款教训)
    assert ".row2 .field[hidden] { display: none; }" in css
    assert '#when-pick[data-mode="date"]' in css \
        and '#when-pick[data-mode="time"]' in css
    assert "#when-pick { z-index: 85; }" in css   # 借调的拨轮要盖过周期设置层 (同 80, DOM 在后)
    # 设为周期账/取消周期 + 结束早过开始不收 + 排队补交
    assert "设为周期账" in rec_js and "取消周期" in rec_js
    assert "结束日期不能早于开始日期" in rec_js
    assert '"bk-cyc-queue"' in rec_js and "function flushCycleQueue()" in rec_js
    # 存账/同步挂点
    assert "submitCycle(entry);" in pad and "flushCycleQueue();" in sync_js
    # 设置入口 + 层注册 + 清单样式
    assert 'data-push="cyc"' in settings_js
    assert 'cyc: "mine"' in push_js \
        and 'view === "cyc") renderCycView(target)' in push_js
    assert "cy-rules-row" in rec_js and ".push-pane .cy-rules-row" in panes
    assert "确认删除" in rec_js and "两道闸" in rec_js
