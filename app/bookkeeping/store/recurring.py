"""周期账 (1.15.0): 规则表 + 到点落账 + 读写口。

记一笔时顺手立一条规则 (接口模型 RecurringIn/RecurringOut 也住这 —
金额/类别/标签那截公共体从 schemas.py 的 _EntryCore/_EntryOutCore 继承,
周期账自己的字段才在这); 账本行不预生成: 同步时 materialize 顺路把到点
的落进 entries —— 不起后台线程, 客户端每分钟的同步就是发令枪, 服务器
歇过的日子下次同步一并补齐 (生成 id 是确定性组合 "{rule_id}:{date}",
补过的不再补)。

occurrence 语义: 手工记的那笔是首账 (anchor_date), 之后每个匹配设定的
日子落一笔 —— 日子 > anchor 且 >= start 且 (end 空 | <= end)。入账日
在短月自动收月底 (2 月没有 31 号就落 28/29, 不跳月); 入账时刻到了才算
到点 (空 = 当天零点)。删规则是墓碑: 已落的账留着, 之后不再生成。"""
import calendar
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..schemas import _EntryCore, _EntryOutCore
from .models import Entry, Recurring

_SCAN_DAYS = 400   # 找下一笔最多往后扫的天数 (任何周期 366 天内必有匹配)
_BATCH = 400       # 单次同步单条规则最多补的笔数 (歇久了分批补, 不一次灌爆)


class RecurringIn(_EntryCore):
    """周期账规则上传: anchor_date 是手工记下的那笔首账 (只往后生成),
    入账日期随周期各表各的 (weekly 0-6 周日起 / monthly·yearly 1-31,
    yearly 另带月 1-12), end_date 空 = 不限。金额/类别/标签与账目同一副
    规矩 (公共体 _EntryCore)。"""

    cycle: Literal["daily", "weekly", "monthly", "yearly"]
    post_day: int = 0        # weekly: 周几 0-6 (周日=0); 月·年: 几号 1-31
    post_month: int = 1      # yearly: 几月 1-12
    post_time: str = Field(
        default="", pattern=r"^$|^([01][0-9]|2[0-3]):[0-5][0-9]$")   # 入账时刻
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(default="", pattern=r"^$|^\d{4}-\d{2}-\d{2}$")
    anchor_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")

    @model_validator(mode="after")
    def check_cycle_fields(self) -> "RecurringIn":
        """入账日期/月随周期各归各位; 结束不早于首账 (首账自己就是一笔)。"""
        if self.cycle == "weekly" and not 0 <= self.post_day <= 6:
            raise ValueError("每周的入账日要 0-6 (周日=0)")
        if self.cycle in ("monthly", "yearly") and not 1 <= self.post_day <= 31:
            raise ValueError("入账日要 1-31")
        if self.cycle == "yearly" and not 1 <= self.post_month <= 12:
            raise ValueError("每年的入账月要 1-12")
        if self.end_date and self.end_date < self.anchor_date:
            raise ValueError("结束日期不能早于首账日期")
        return self


class RecurringOut(_EntryOutCore):
    """周期账下发 (设置页清单): 规则本体 + 下一笔日期 (空 = 已收摊)。"""

    id: str
    cycle: str
    post_day: int
    post_month: int
    post_time: str
    start_date: str
    end_date: str
    anchor_date: str
    next_date: str


def _matches(cycle: str, post_day: int, post_month: int, day: date) -> bool:
    """这一天落不落账: daily 天天落; weekly 周几对上 (周日=0); monthly/
    yearly 几号对上 — 短月自动收月底 (2 月没有 31 号就落 28/29)。"""
    if cycle == "daily":
        return True
    if cycle == "weekly":
        return day.isoweekday() % 7 == post_day
    mlen = calendar.monthrange(day.year, day.month)[1]
    if cycle == "monthly":
        return day.day == min(post_day, mlen)
    return day.month == post_month and day.day == min(post_day, mlen)


def _next_match(cycle: str, post_day: int, post_month: int,
                on_or_after: date) -> str:
    """on_or_after 起 (含) 第一个落账日; 任何周期 366 天内必有匹配。"""
    day = on_or_after
    for _ in range(_SCAN_DAYS):
        if _matches(cycle, post_day, post_month, day):
            return day.strftime("%Y-%m-%d")
        day += timedelta(days=1)
    return ""        # 历法上到不了 (兜底)


def _parse_day(text: str) -> date:
    return datetime.strptime(text, "%Y-%m-%d").date()


def _due_at(next_date: str, post_time: str) -> datetime:
    """next_date 这一笔的到点时刻 (入账时刻到了才算到点, 空 = 当天零点)。"""
    due = datetime.strptime(next_date, "%Y-%m-%d")
    if post_time:
        hour, minute = post_time.split(":")
        return due.replace(hour=int(hour), minute=int(minute))
    return due


def create_rule(session: Session, user_uuid: str, req: RecurringIn) -> Recurring:
    """立一条规则: 首账 (anchor) 是手工记的那笔, 生成的从 anchor 之后起
    (start 更晚则从 start 起); next_date 先探好, 出了结束线直接收摊。"""
    begin = max(_parse_day(req.anchor_date) + timedelta(days=1),
                _parse_day(req.start_date))
    nxt = _next_match(req.cycle, req.post_day, req.post_month, begin)
    if req.end_date and nxt > req.end_date:
        nxt = ""
    rule = Recurring(
        id=uuid.uuid4().hex, amount=round(req.amount, 2), kind=req.kind,
        category=req.category, tags=",".join(req.tags), note=req.note,
        cycle=req.cycle, post_day=req.post_day, post_month=req.post_month,
        post_time=req.post_time, start_date=req.start_date,
        end_date=req.end_date, anchor_date=req.anchor_date, next_date=nxt,
        created_by=user_uuid, created_at=datetime.utcnow(), deleted=False)
    session.add(rule)
    session.commit()
    return rule


def list_rules(session: Session) -> list[Recurring]:
    """在册的规则 (墓碑不算), 新立的在前。"""
    return list(session.execute(
        select(Recurring).where(Recurring.deleted.is_(False))
        .order_by(Recurring.created_at.desc())).scalars())


def delete_rule(session: Session, rule_id: str) -> bool:
    """删一条规则 (墓碑): 已落的账留着, 之后不再生成。"""
    rule = session.get(Recurring, rule_id)
    if rule is None or rule.deleted:
        return False
    rule.deleted = True
    session.commit()
    return True


def _advance(rule: Recurring, cur: str) -> str:
    """cur 之后的下一个落账日; 出了结束线 (或历法上再无匹配) 收摊空串。"""
    nxt = _next_match(rule.cycle, rule.post_day, rule.post_month,
                      _parse_day(cur) + timedelta(days=1))
    if rule.end_date and nxt > rule.end_date:
        return ""
    return nxt


def materialize(session: Session, now: datetime | None = None) -> None:
    """把到点的周期账落进账本 (同步时顺路调用): next_date 到点 (日 + 入账
    时刻 <= now) 就生成一笔确定性 id 的账, 游标前挪; 单条规则单次最多补
    _BATCH 笔, 没补完的下次同步接着来。"""
    now = now or datetime.utcnow()
    for rule in list_rules(session):
        made = 0
        while rule.next_date and made < _BATCH:
            if _due_at(rule.next_date, rule.post_time) > now:
                break
            if session.get(Entry, f"{rule.id}:{rule.next_date}") is None:
                session.add(Entry(
                    id=f"{rule.id}:{rule.next_date}", date=rule.next_date,
                    time=rule.post_time, amount=rule.amount, kind=rule.kind,
                    category=rule.category, tags=rule.tags, note=rule.note,
                    deleted=False, created_by=rule.created_by, created_at=now,
                    updated_by=rule.created_by, updated_at=now, synced_at=now))
                made += 1
            rule.next_date = _advance(rule, rule.next_date)
    session.commit()
