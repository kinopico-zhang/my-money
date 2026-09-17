"""My Money 独立部署的装配: 内嵌账号体系 (app/home) + 记账应用 (/bookkeeping)。

独立仓 = 从 My Home 组合仓拆出来的自足部署: clone 下来建 .venv 与
.env (至少 AUTH_PASS, 见 .env.example), ./run.sh 即起。My Home 组合
部署时本模块不参与 —— 外层加载 app/bookkeeping 子包直接挂
/bookkeeping, 账号体系用组合仓自己的门厅层 (同一枚会话 cookie)。

数据: 记账库 SQLite (data/bookkeeping.db) + 账号库 (data/users.db)。
鉴权: 登录后签 HMAC 签名的会话 cookie (默认 90 天), 未登录页面跳
/bookkeeping/login (scope 内, 全屏 App 不弹回浏览器露地址栏), API 回
401; 中间件在 app/home/middleware。
"""
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from . import account_store, config, database
from .bookkeeping import store as bookkeeping_store
from .bookkeeping import webapp as bookkeeping_webapp
from .home import STATIC_DIR as HOME_STATIC_DIR
from .home import accounts_api, middleware as home_middleware
from .home import pages as home_pages, session_api
from .models import UsersBase


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """启动: 账号库建表 + 首启种管理员 + 记账库建表迁移与类别种子;
    关闭: 释放连接池。"""
    database.init_users_engine()
    UsersBase.metadata.create_all(database.users_engine())
    if config.AUTH_PASS:
        with database.users_session_factory()() as users:  # pylint: disable=not-callable
            account_store.ensure_admin(users, config.AUTH_USER, config.AUTH_PASS)
    else:
        print("AUTH_PASS 未设置: 首启不种管理员 —— 在 .env 里设 AUTH_PASS 后重启",
              file=sys.stderr)
    bookkeeping_store.init_engine()      # 记账库 (独立文件, 独立应用)
    bookkeeping_store.create_all()
    bookkeeping_store.migrate_columns()           # 旧库补 time/tags 列 (幂等)
    bookkeeping_store.seed_default_categories()   # 类别树 (空库才种)
    yield
    database.dispose_users_engine()
    bookkeeping_store.dispose_engine()


app = FastAPI(title="My Money", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048)   # 接口 JSON 压缩
app.middleware("http")(home_middleware.auth_middleware)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(
        _: Request, exc: SQLAlchemyError) -> JSONResponse:
    """数据库异常统一 503 (挂载的子应用各自处理, 这里兜账号接口的)。"""
    return JSONResponse({"detail": f"数据库查询失败: {exc}"}, status_code=503)


# 账号体系 (门厅共享层的独立仓副本): 登录/注册页面 + 会话接口 + 账号管理
app.include_router(home_pages.router)
app.include_router(session_api.api)
app.include_router(accounts_api.accounts)
app.mount("/static", StaticFiles(directory=HOME_STATIC_DIR), name="home-static")
# 记账应用本体: 路由与页面都在 bookkeeping 包 (URL 前缀与组合部署一致)
app.mount("/bookkeeping", bookkeeping_webapp.bk_app)
