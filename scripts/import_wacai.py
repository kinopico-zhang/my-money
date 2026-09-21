"""一次性数据导入: wacai.db (挖财账本导出) → 生产记账库 data/bookkeeping.db。

- 归属映射: 挖财 uid 140777173 (kinopico) → 大导子, 204336705 (导砸) → 小导子
  (两个账号已在 users.db, 这里只按名字取 uuid, 不建账号)。
- rec_type: 1=支出, 2=收入, 4=借入 (不是收支, 不导); amount 单位是分;
  biz_time 毫秒, 记的是北京时间 (拆成 date / time 两列)。
- 类别映射: 子类 → "大类/子类", 顶层大类 → 大类名 —— 与库里的种子树同名
  (163 个类别的种子本就来自这份导出)。
- 条目 id = "wacai-<flow_id>": 只插不覆盖, 重跑幂等; 负数金额不导
  (库契约金额恒正, 那是退款性质的更正笔), 零元照导 (真实的零元记录)。
- synced_at 取导入时刻: 已登录的手机下次打开, 同步自动把新行全量拉下去。

用法: .venv/bin/python scripts/import_wacai.py [--dry-run]
"""
from __future__ import annotations

import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 仓根 (app 包在这)

from sqlalchemy import create_engine, select   # noqa: E402 (路径自举要在 import app 前)
from sqlalchemy.orm import Session   # noqa: E402

from app.bookkeeping.store.models import Entry   # noqa: E402

HOME = Path("/share/CACHEDEV1_DATA/Public/my-home")   # 生产仓根 (合成壳 env 指到的库)
WACAI_DB = HOME / "wacai.db"
USERS_DB = HOME / "data" / "users.db"
BK_DB = HOME / "data" / "bookkeeping.db"   # 勿改成子仓 data/ 下那个 (开发残留)

UID_TO_NAME = {140777173: "大导子", 204336705: "小导子"}   # 挖财 kinopico / 导砸
TZ = timezone(timedelta(hours=8))                        # 导出里记的都是北京时间


def load_wacai() -> tuple[dict, dict, list[sqlite3.Row]]:
    """类别表 / 流水标签 / 收支流水 (只读打开)。"""
    con = sqlite3.connect(f"file:{WACAI_DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    cats = {r["category_id"]: r for r in con.execute("SELECT * FROM categories")}
    tags: dict = defaultdict(list)
    for r in con.execute("SELECT flow_id, name FROM flow_tags"):
        tags[r["flow_id"]].append(r["name"])
    flows = list(con.execute(
        "SELECT * FROM flows WHERE rec_type IN (1, 2) ORDER BY biz_time"))
    con.close()
    return cats, tags, flows


def category_path(cats: dict, cid) -> str:
    """子类拼 "大类/子类", 顶层大类原名单用 (与种子树同名)。"""
    cat = cats.get(cid)
    if cat is None:
        return ""
    parent = cats.get(cat["parent_id"])
    return f"{parent['name']}/{cat['name']}" if parent else cat["name"]


def build_entries(cats: dict, tags: dict, flows: list[sqlite3.Row],
                  uuids: dict, stats: dict) -> list[Entry]:
    """流水 → 记账条目 (还没插库)。"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)   # synced_at: 导入时刻
    rows: list[Entry] = []
    for f in flows:
        if f["uid"] not in UID_TO_NAME:                     # 出现新记账人: 停下来人工看
            raise SystemExit(f"未映射的挖财记账人 uid={f['uid']}, 先补 UID_TO_NAME")
        if f["amount"] < 0:                                 # 退款性质更正笔, 不导
            stats["跳过: 负数金额"] += 1
            continue
        local = datetime.fromtimestamp(f["biz_time"] / 1000, TZ)
        made = datetime.fromtimestamp(f["created_at"], timezone.utc)
        made = made.replace(tzinfo=None)                    # 库里存裸 UTC (同 sync.py)
        rows.append(Entry(
            id=f"wacai-{f['id']}",
            date=local.strftime("%Y-%m-%d"), time=local.strftime("%H:%M"),
            amount=round(f["amount"] / 100, 2),
            kind="expense" if f["rec_type"] == 1 else "income",
            category=category_path(cats, f["category_id"]),
            tags=",".join(tags.get(f["id"], [])),
            note=f["comment"] or "",
            created_by=uuids[UID_TO_NAME[f["uid"]]],
            created_at=made, updated_by=uuids[UID_TO_NAME[f["uid"]]],
            updated_at=made, synced_at=now, deleted=False))
        stats[f"{UID_TO_NAME[f['uid']]} · "
              f"{'支出' if f['rec_type'] == 1 else '收入'}"] += 1
    return rows


def main() -> None:
    dry = "--dry-run" in sys.argv
    cats, tags, flows = load_wacai()
    users = sqlite3.connect(f"file:{USERS_DB}?mode=ro", uri=True)
    uuids = dict(users.execute("SELECT name, uuid FROM users"))
    users.close()
    for name in UID_TO_NAME.values():
        if name not in uuids:
            raise SystemExit(f"users.db 里没有账号「{name}」")

    stats: dict = defaultdict(int)
    rows = build_entries(cats, tags, flows, uuids, stats)
    for key, n in sorted(stats.items()):
        print(f"  {key}: {n} 笔")
    print(f"  合计拟导入: {len(rows)} 笔 (源头 {len(flows)} 笔收支流水)")

    eng = create_engine(f"sqlite:///{BK_DB}",
                        connect_args={"check_same_thread": False, "timeout": 30})
    with Session(eng) as session:      # 服务在跑: 一次事务拿写锁, 30 秒兜底
        have = {r[0] for r in session.execute(
            select(Entry.id).where(Entry.id.like("wacai-%")))}
        fresh = [r for r in rows if r.id not in have]
        print(f"  已存在 (跳过): {len(rows) - len(fresh)} 条")
        if dry:
            print("  [dry-run] 未写库")
            return
        session.add_all(fresh)
        session.commit()
    print(f"  本次插入: {len(fresh)} 条 → {BK_DB}")


if __name__ == "__main__":
    main()
