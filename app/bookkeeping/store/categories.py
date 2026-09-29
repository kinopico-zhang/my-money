"""类别树: 种子数据 (挖财账本导出) 的播种与读取 (给前端弹层画两级胶囊)。"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..default_categories import DEFAULT_TAGS, EXPENSE_CATEGORIES, INCOME_CATEGORIES
from ..schemas import CategoryGroup, CategoryTree, TagSeed
from .engine import session_factory
from .models import Category


def seed_default_categories() -> None:
    """类别表为空时种入默认树 (挖财导出内容); 非空不动 —— 以库为准。"""
    with session_factory()() as session:  # pylint: disable=not-callable
        if session.execute(select(Category.id).limit(1)).scalar() is not None:
            return
        rows: list[Category] = []
        for kind, tree in (("expense", EXPENSE_CATEGORIES),
                           ("income", INCOME_CATEGORIES)):
            for top, children in tree:
                rows.append(Category(name=top, kind=kind, parent="",
                                     sort=len(rows)))
                rows.extend(Category(name=child, kind=kind, parent=top,
                                     sort=len(rows)) for child in children)
        session.add_all(rows)
        session.commit()


def category_tree(session: Session) -> CategoryTree:
    """类别树 + 标签种子 → 支出/收入各自的大类 + 子类, 按种子的 sort 保序
    (给前端弹层画两级胶囊用); 各组的「其他」兜底小类 (名以「其他」结尾 —
    挖财导来的兜底命名不一, 有「餐饮其他」也有光秃秃的「其他」) 一律沉到
    组尾: 老库种下时序号排在中间的也照沉 (种子只在空库种一次, 库里顺序
    改不动, 读取口兜底)。标签是挖财迁来的静态历史, 不进库
    (活标签长在各笔账上, 客户端自己合并)。"""
    rows = session.execute(select(Category).order_by(Category.sort, Category.id)
                           ).scalars().all()
    children: dict[str, list[str]] = {}
    for row in rows:
        if row.parent:
            children.setdefault(row.parent, []).append(row.name)
    tree = CategoryTree(expense=[], income=[],
                        tags=[TagSeed(name=n, created=c) for n, c in DEFAULT_TAGS])
    for row in rows:
        if not row.parent:
            group = CategoryGroup(name=row.name,
                                  children=sorted(children.get(row.name, []),
                                                  key=lambda n: n.endswith("其他")))
            if row.kind == "expense":
                tree.expense.append(group)
            else:
                tree.income.append(group)
    return tree
