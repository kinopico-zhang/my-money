"""类别管理接口: 设置页「类别管理」用 — 给类别挑图标色, 增删类别。

树本体 (种子/读取) 在 store/categories.py, 读口在 webapp 的
/api/categories; 这里只开写路径。三个口都回整棵新树 —— 客户端就地
换上, 少一个来回。删有守卫: 挂着小类的大类先删小类; 有账在用的
(含墓碑 — 别的设备还捏着活副本) 不给删。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import account_store, database
from ..models import User
from . import store
from .schemas import (CategoryAddIn, CategoryColorIn, CategoryDeleteIn,
                   CategoryTree)
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
    """加一个类别 (parent 空 = 新建大类), 排同层末尾, 回新树。"""
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
    bk.add(Category(name=name, kind=body.kind, parent=body.parent, sort=last + 1))
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
