"""环境变量配置 (见 .env.example), 集中读取避免散落各处。

独立仓口径: 记账库引擎 (data/bookkeeping.db) 住在 app/bookkeeping/store
自管 (env MYTESLA_BOOKKEEPING_DB 可指别处); 这里只有账号体系要落的
路径。密码不设默认值 —— 仓库公开, 不带默认口令, 首启种子管理员只认
.env 里设过的 AUTH_PASS。

My Home 组合部署时, 外层把 MYHOME_USERS_DB / MYHOME_SECRET_FILE 指到
共享的 data/users.db 与 .session_secret (同一份账号库 + 同一枚会话
签名密钥, cookie 三应用通用)。
"""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent


def _sqlite_url(value: str) -> str:
    """env 值 → SQLAlchemy URL: 裸路径当仓内 SQLite 文件 (相对仓根),
    带协议 (sqlite:///…) 的原样 —— .env 里两种写法都认。"""
    if "://" in value:
        return value
    path = Path(value)
    if not path.is_absolute():
        path = PROJECT_DIR / path
    return f"sqlite:///{path}"

# 时间: 账号创建时间等对外输出本地时间 (默认北京时间)
LOCAL_TZ = ZoneInfo(os.environ.get("TZ_NAME", "Asia/Shanghai"))

# 鉴权 (env 可覆盖; AUTH_PASS 不设默认值, 首启不种管理员)
AUTH_USER = os.environ.get("AUTH_USER", "admin")
AUTH_PASS = os.environ.get("AUTH_PASS", "")
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "90"))
SECRET_FILE = Path(os.environ.get("MYHOME_SECRET_FILE")
                   or PROJECT_DIR / ".session_secret")

# 登录限速: 单 IP 连续失败 5 次锁定 60 秒
LOGIN_MAX_FAILS = 5
LOGIN_LOCK_S = 60

# 账号库 (SQLite, 与业务库分开的独立文件): 用户 + 注册邀请
USERS_DB_URL = _sqlite_url(
    os.environ.get("MYHOME_USERS_DB")
    or str(PROJECT_DIR / "data" / "users.db"))
