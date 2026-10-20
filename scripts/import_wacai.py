"""重灌导入: wacai.db (挖财全量爬取) → 生产记账库 data/bookkeeping.db。

生产在 WSL 组合仓 /home/admin/workspace/my-home (2026-10-05 自 NAS 迁来),
记账库由组合壳 MYTESLA_BOOKKEEPING_DB 指到 data/bookkeeping.db —— 路径
写死这个, 别改成子仓 data/ 下那个 (开发用)。挖财库放 data/wacai.db
(NAS /share/Public/claude-code/wacai 全量爬取后 scp 过来)。

重灌语义 (2026-10-08, 用户点名「my-money 之前的数据都删除, 重新用
wacai.db 的数据填」): entries 全表清空 (墓碑也清), 再插全量 wacai 条目
—— 库里最终只剩 wacai.db 的镜像。id = "wacai-<flow_id>" 与旧导入同
规则, 手机端按 id 合并, 同 id 重插即原地刷新, 不产生重复。类别树
只增不删: 流水用到而树里没有的类别补种上 (挖财侧新建的类别跟过来)。
(手机端自记的条目被物理删后, 没同步到墓碑的手机上会留本地残影,
下次重跑前留意; wacai 侧没删过的条目都会照爬取结果回来。)

字段口径:
- rec_type: 1=支出, 2=收入, 4=借入 (不是收支, 不导); amount 单位是分,
  负数不导 (退款性质更正笔), 零元照导; biz_time 毫秒, 记的是北京时间
  (拆成 date / time 两列)。
- 类别: 支出走 categories 表联查拼 "大类/子类" (支出树 148 节点与挖财
  API 逐一对过, 完整可信); 收入直接用流水自带的 category_name ——
  挖财收入大类是平树 (24 个无子类), 且其数字主键 (1~24) 与支出类撞号,
  爬虫 merge 时被后爬的支出行覆盖了 9 个 (公积金被顶成人情即此故),
  收入侧联查不可信, category_name 才是权威。
- created_at 取 biz_time (真实记账时刻, 存裸 UTC); updated_at 取
  flows.created_at —— 那是爬取时刻 (全库同值, 全量爬取会删库重建),
  晚于一切手机端旧状态, LWW 保证挖财真相赢过手机上的旧编辑; 比它新的
  手机编辑 (爬取之后改的) 照旧赢, 正是想要的。
- synced_at 取导入时刻: 手机端增量游标把全量新行拉下去。

用法: /home/admin/workspace/my-home/.venv/bin/python scripts/import_wacai.py [--dry-run]
"""
from __future__ import annotations

import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 仓根 (app 包在这)

from sqlalchemy import create_engine, delete, func, select   # noqa: E402 (路径自举要在 import app 前)
from sqlalchemy.orm import Session   # noqa: E402

from app.bookkeeping.store.models import Category, Entry   # noqa: E402

HOME = Path("/home/admin/workspace/my-home")     # 生产组合仓根 (壳 env 指到的库)
WACAI_DB = HOME / "data" / "wacai.db"
USERS_DB = HOME / "data" / "users.db"
BK_DB = HOME / "data" / "bookkeeping.db"   # 勿改成子仓 data/ 下那个 (开发用)

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


def category_path(cats: dict, f: sqlite3.Row) -> str:
    """支出: 子类拼 "大类/子类", 顶层大类原名单用 (与种子树同名)。
    收入: 平树, 直接用流水自带的 category_name (联查会被撞号污染)。"""
    if f["rec_type"] == 2:
        return f["category_name"] or ""
    cat = cats.get(f["category_id"])
    if cat is None:                       # 类别已在挖财侧删掉: 用流水自带名单用
        return f["category_name"] or ""
    parent = cats.get(cat["parent_id"])
    return f"{parent['name']}/{cat['name']}" if parent else cat["name"]


def ensure_categories(session: Session, rows: list[Entry]) -> list[str]:
    """流水用到的类别若不在类别树里则补种 (挖财侧新建的类别跟过来)。
    支出组合名 "大类/子类" 要大类、子类两行都在; 收入平树一行。
    返回补种的类别名 (空 = 树已覆盖)。只增不删 —— 用户在库里删过的
    类别若又被流水引用会回来, 其余的删了就删了。"""
    have = {(name, kind) for name, kind in
            session.execute(select(Category.name, Category.kind))}
    next_sort = (session.scalar(select(func.max(Category.sort))) or 0) + 1
    added: list[str] = []
    for cat, kind in sorted({(r.category, r.kind) for r in rows if r.category}):
        if "/" in cat:                    # 支出组合名: 大类、子类两行
            top, sub = cat.split("/", 1)
            pairs = [(top, ""), (sub, top)]
        else:                             # 收入平树 / 支出孤大类: 一行
            pairs = [(cat, "")]
        for name, parent in pairs:
            if (name, kind) in have:
                continue
            session.add(Category(name=name, kind=kind, parent=parent,
                                 sort=next_sort))
            next_sort += 1
            added.append(f"{name} ({'收入' if kind == 'income' else '支出'})")
            have.add((name, kind))
    return added


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
        made = local.astimezone(timezone.utc).replace(tzinfo=None)   # created_at: 记账时刻
        crawled = datetime.fromtimestamp(                   # updated_at: 爬取时刻
            f["created_at"], timezone.utc).replace(tzinfo=None)      # (库契约: 裸 UTC)
        rows.append(Entry(
            id=f"wacai-{f['id']}",
            date=local.strftime("%Y-%m-%d"), time=local.strftime("%H:%M"),
            amount=round(f["amount"] / 100, 2),
            kind="expense" if f["rec_type"] == 1 else "income",
            category=category_path(cats, f),
            tags=",".join(tags.get(f["id"], [])),
            note=f["comment"] or "",
            created_by=uuids[UID_TO_NAME[f["uid"]]],
            created_at=made, updated_by=uuids[UID_TO_NAME[f["uid"]]],
            updated_at=crawled, synced_at=now, deleted=False))
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
    print(f"  拟导入: {len(rows)} 笔 (源头 {len(flows)} 笔收支流水)")

    eng = create_engine(f"sqlite:///{BK_DB}",
                        connect_args={"check_same_thread": False, "timeout": 30})
    with Session(eng) as session:      # 服务在跑: 一次事务拿写锁, 30 秒兜底
        n_active = session.scalar(select(func.count()).select_from(Entry)
                                  .where(Entry.deleted.is_(False)))
        n_tomb = session.scalar(select(func.count()).select_from(Entry)
                                .where(Entry.deleted.is_(True)))
        print(f"  清空现库: 活跃 {n_active} 条 + 墓碑 {n_tomb} 条 (测试数据一并不留)")
        added = ensure_categories(session, rows)
        print(f"  补种类别: {added or '无'}")
        if dry:
            print("  [dry-run] 未写库")
            return
        session.execute(delete(Entry))
        session.add_all(rows)
        session.commit()
    print(f"  重灌完成: {len(rows)} 条 → {BK_DB}")


if __name__ == "__main__":
    main()
