"""类别管理接口: 设置页「类别管理」用 — 给类别挑图标色, 增删类别。

树本体 (种子/读取) 在 store/categories.py, 读口在 webapp 的
/api/categories; 这里只开写路径。三个口都回整棵新树 —— 客户端就地
换上, 少一个来回。删有守卫: 挂着小类的大类先删小类; 有账在用的
(含墓碑 — 别的设备还捏着活副本) 不给删。"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import account_store, database
from ..models import User
from . import store
from .schemas import (CategoryAddIn, CategoryColorIn, CategoryDeleteIn,
                   CategoryTree, CategoryUpdateIn)
from .store import Category, Entry, category_tree

admin = APIRouter(prefix="/api/categories")


def _require_user(request: Request, users: Session) -> User:
    """已登录账号, 否则 401 (同 webapp 那枚 — 拆文件防环引, 各留一份)。"""
    user = account_store.user_for_cookie(request.cookies.get("auth", ""), users)
    if user is None:
        raise HTTPException(401, "未登录")
    return user


def _find(session: Session, kind: str, parent: str, name: str) -> Category | None:
    """按 (树, 大类, 名字) 定位一行类别。"""
    return session.execute(select(Category).where(
        Category.kind == kind, Category.parent == parent,
        Category.name == name)).scalar_one_or_none()


@admin.post("/color", response_model=CategoryTree)
def set_category_color(body: CategoryColorIn, request: Request,
                       users: Session = Depends(database.get_users_db),
                       bk: Session = Depends(store.get_db)
                       ) -> CategoryTree:
    """给一个类别挑图标色 (color 空 = 恢复方向色), 回新树。"""
    _require_user(request, users)
    row = _find(bk, body.kind, body.parent, body.name)
    if row is None:
        raise HTTPException(404, "类别不存在")
    row.color = body.color or None
    bk.commit()
    return category_tree(bk)


@admin.post("/add", response_model=CategoryTree)
def add_category(body: CategoryAddIn, request: Request,
                 users: Session = Depends(database.get_users_db),
                 bk: Session = Depends(store.get_db)
                 ) -> CategoryTree:
    """加一个类别 (parent 空 = 新建大类), 排同层末尾; 1.7.0 起弹框连图标/
    颜色一起挑好带进来 (空 = 各自的兜底), 回新树。"""
    _require_user(request, users)
    name = body.name.strip()
    if not name or len(name) > 10 or "/" in name:
        raise HTTPException(400, "名字要 1-10 个字, 不能带 /")
    if body.parent and _find(bk, body.kind, "", body.parent) is None:
        raise HTTPException(404, "大类不存在")
    if len(f"{body.parent}/{name}" if body.parent else name) > 20:
        raise HTTPException(400, "名字太长 (带大类不超过 20 字)")
    if _find(bk, body.kind, body.parent, name) is not None:
        raise HTTPException(400, "这个名字已经有了")
    last = bk.execute(select(func.max(Category.sort))).scalar_one() or 0
    bk.add(Category(name=name, kind=body.kind, parent=body.parent, sort=last + 1,
                    icon=body.icon or None, color=body.color or None))
    bk.commit()
    return category_tree(bk)


@admin.post("/update", response_model=CategoryTree)
def update_category(body: CategoryUpdateIn, request: Request,
                    users: Session = Depends(database.get_users_db),
                    bk: Session = Depends(store.get_db)
                    ) -> CategoryTree:
    """改一个小类: 名字/图标/颜色一起 (1.9.0 点行开框), 回新树。改名把
    账上的组合名一并迁移 (含墓碑 —— 删过的账也吊在类别上), 且要顶
    synced_at: 增量下发按它取游标, 不顶这笔就永远不会再下发, 别的
    设备上名字吊在旧类别上; updated_at 一概不动 —— 客户端下行合并
    平局归服务器, 不动它改名照样落地, 动了反而会跟慢钟手机的离线
    改动打 LWW 架 (改完几分钟内的编辑会被吞)。"""
    _require_user(request, users)
    if not body.parent:
        raise HTTPException(400, "这版先只支持改小类 (大类牵着一整组, 改名得整组迁)")
    row = _find(bk, body.kind, body.parent, body.name)
    if row is None:
        raise HTTPException(404, "类别不存在")
    new_name = body.new_name.strip()
    if not new_name or len(new_name) > 10 or "/" in new_name:
        raise HTTPException(400, "名字要 1-10 个字, 不能带 /")
    if len(f"{body.parent}/{new_name}") > 20:
        raise HTTPException(400, "名字太长 (带大类不超过 20 字)")
    if new_name != body.name:
        if _find(bk, body.kind, body.parent, new_name) is not None:
            raise HTTPException(400, "这个名字已经有了")
        old_path = f"{body.parent}/{body.name}"
        new_path = f"{body.parent}/{new_name}"
        now = datetime.utcnow()
        for entry in bk.execute(select(Entry).where(
                Entry.kind == body.kind, Entry.category == old_path)).scalars():
            entry.category = new_path
            entry.synced_at = now
        row.name = new_name
    row.icon = body.icon or None
    row.color = body.color or None
    bk.commit()
    return category_tree(bk)


@admin.post("/delete", response_model=CategoryTree)
def delete_category(body: CategoryDeleteIn, request: Request,
                    users: Session = Depends(database.get_users_db),
                    bk: Session = Depends(store.get_db)
                    ) -> CategoryTree:
    """删一个类别; 挂着小类/有账在用会被拒 (400 带原因), 回新树。"""
    _require_user(request, users)
    row = _find(bk, body.kind, body.parent, body.name)
    if row is None:
        raise HTTPException(404, "类别不存在")
    path = f"{body.parent}/{body.name}" if body.parent else body.name
    kids = bk.execute(select(func.count()).select_from(Category).where(
        Category.kind == body.kind, Category.parent == body.name)).scalar_one()
    if kids:
        raise HTTPException(400, "还有小类挂在下面, 先把小类删完")
    used = bk.execute(select(func.count()).select_from(Entry).where(or_(
        Entry.category == path,
        *([] if body.parent else [Entry.category.like(f"{path}/%")])
    ))).scalar_one()          # 含墓碑: 别的设备还捏着活副本, 删了会吊空
    if used:
        raise HTTPException(400, f"还有 {used} 笔账在用这个类别, 删不了")
    bk.delete(row)
    bk.commit()
    return category_tree(bk)
