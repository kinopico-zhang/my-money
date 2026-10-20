"""周期账接口 (1.15.0): 记一笔弹层立规则 + 设置页清单/删除。

规则本体与落账在 store/recurring.py; 这里只开读写路径。删除是墓碑 —
已落的账留着 (不想要的到清单里删规则, 落过的单笔照常左滑删)。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import account_store, database
from ..models import User
from . import store
from .store import Recurring
from .store.recurring import RecurringIn, RecurringOut

admin = APIRouter(prefix="/api/recurring")


def _require_user(request: Request, users: Session) -> User:
    """已登录账号, 否则 401 (同 webapp 那枚 — 拆文件防环引, 各留一份)。"""
    user = account_store.user_for_cookie(request.cookies.get("auth", ""), users)
    if user is None:
        raise HTTPException(401, "未登录")
    return user


def _out(row: Recurring) -> RecurringOut:
    """规则行 → 下发形状 (清单/立规则同一副)。"""
    return RecurringOut(
        id=row.id, amount=row.amount, kind=row.kind, category=row.category,
        tags=row.tags.split(",") if row.tags else [], note=row.note,
        cycle=row.cycle, post_day=row.post_day, post_month=row.post_month,
        post_time=row.post_time, start_date=row.start_date,
        end_date=row.end_date, anchor_date=row.anchor_date,
        next_date=row.next_date)


@admin.get("", response_model=list[RecurringOut])
def list_recurring(request: Request,
                   users: Session = Depends(database.get_users_db),
                   bk: Session = Depends(store.get_db)) -> list[RecurringOut]:
    """在册的周期账 (设置页清单): 带着下一笔日期, 到点才见账。"""
    _require_user(request, users)
    return [_out(rule) for rule in store.list_rules(bk)]


@admin.post("", response_model=RecurringOut)
def create_recurring(body: RecurringIn, request: Request,
                     users: Session = Depends(database.get_users_db),
                     bk: Session = Depends(store.get_db)) -> RecurringOut:
    """立一条周期账 (记一笔顺手立的): 首账就是手工记的那笔, 服务端从
    下一个匹配的日子起落账 (同步时顺路)。"""
    user = _require_user(request, users)
    return _out(store.create_rule(bk, user.uuid, body))


@admin.delete("/{rule_id}")
def delete_recurring(rule_id: str, request: Request,
                     users: Session = Depends(database.get_users_db),
                     bk: Session = Depends(store.get_db)) -> dict[str, bool]:
    """删一条周期账 (墓碑): 已落的账留着, 之后不再生成。"""
    _require_user(request, users)
    if not store.delete_rule(bk, rule_id):
        raise HTTPException(404, "没有这条周期账")
    return {"ok": True}
