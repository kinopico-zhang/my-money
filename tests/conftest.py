"""pytest 共享 fixtures: SQLite 测试库 (免真实数据库) + 全局状态隔离。

独立仓口径: 账号库 + 记账库两套引擎; 每个用例一个独立的 SQLite 文件库,
用真实 ORM 种子数据跑真实 SQL; 引擎由 isolate 注入, TestClient 不触发
lifespan, 不会碰真实记账库。
"""
import hashlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# sys.path 注入必须先于 app 导入 (import 位置告警属预期, 按需豁免)
from app import account_store, authentication, config, database  # pylint: disable=wrong-import-position
from app.bookkeeping import store as bookkeeping_store  # pylint: disable=wrong-import-position
from app.bookkeeping.store import EntryBase  # pylint: disable=wrong-import-position
from app.models import UsersBase  # pylint: disable=wrong-import-position
import app.main as m  # pylint: disable=wrong-import-position

# 测试口径的账密 (isolate 里种进账号库, auth 夹具与个别用例按它登录;
# 生产首启种管理员读 .env 的 AUTH_PASS, 测试不依赖环境)
TEST_USER = "admin"
TEST_PASS = "unit-test-pass"


@pytest.fixture(autouse=True)
def isolate(tmp_path, monkeypatch):
    """每个用例独立: 账号库 / 记账库 / 会话密钥 / 登录限速互不串扰。"""
    database.init_users_engine(f"sqlite:///{tmp_path / 'users.db'}")
    UsersBase.metadata.create_all(database.users_engine())
    # 记账库 (独立文件, 独立应用): 建表 + 类别树种子
    bookkeeping_store.init_engine(f"sqlite:///{tmp_path / 'bookkeeping.db'}")
    EntryBase.metadata.create_all(bookkeeping_store.engine())
    bookkeeping_store.seed_default_categories()
    # 管理员种子 (生产在 lifespan 里做, TestClient 不触发 lifespan);
    # config 上的账密同步换成测试口径 (个别用例按 config.AUTH_* 登录)
    monkeypatch.setattr(config, "AUTH_USER", TEST_USER)
    monkeypatch.setattr(config, "AUTH_PASS", TEST_PASS)
    with database.users_session_factory()() as users:  # pylint: disable=not-callable
        account_store.ensure_admin(users, TEST_USER, TEST_PASS)
    secret = b"unit-test-secret-0123456789abcdef"
    secret_file = tmp_path / "secret"
    secret_file.write_bytes(secret)
    monkeypatch.setattr(config, "SECRET_FILE", secret_file)
    # 测试直接替换内部密钥持有者 (与生产同构, 走真实签名路径)
    monkeypatch.setattr(authentication, "_secret",  # pylint: disable=protected-access
                        authentication._SecretHolder(  # pylint: disable=protected-access
                            hashlib.sha256(secret).digest()))
    monkeypatch.setattr(authentication, "_legacy_secret",  # pylint: disable=protected-access
                        authentication._SecretHolder(  # pylint: disable=protected-access
                            authentication._compute_legacy_secret(secret)))  # pylint: disable=protected-access
    monkeypatch.setattr(authentication, "_login_fails", {})
    yield
    database.dispose_users_engine()
    bookkeeping_store.dispose_engine()


@pytest.fixture()
def client():
    """未登录的 client (不触发 lifespan, 引擎由 isolate 注入的 SQLite)。"""
    return TestClient(m.app)


@pytest.fixture()
def auth(client):  # pylint: disable=redefined-outer-name
    """已登录的 client (正确账密, 走真实签名 cookie)。"""
    r = client.post("/api/login",
                    json={"user": TEST_USER, "password": TEST_PASS})
    assert r.status_code == 200
    return client


@pytest.fixture()
def usersdb():
    """直连账号库的会话 (种子用户 / 邀请 / 回读断言)。"""
    with database.users_session_factory()() as session:  # pylint: disable=not-callable
        yield session


@pytest.fixture()
def bkdb():
    """直连记账库的会话 (种子账目 / 回读断言)。"""
    with bookkeeping_store.session_factory()() as session:  # pylint: disable=not-callable
        yield session
