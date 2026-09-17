"""数据库引擎门面 (独立仓口径): 只有账号库 (SQLite, data/users.db) 一套。

组合仓里另有 TeslaMate / 自有库两套引擎; 独立部署的听歌应用只带账号
体系, 曲库引擎在 app/music/library_database 自管。"""
from .users_engine import (dispose_users_engine, get_users_db,
                           init_users_engine, users_engine,
                           users_session_factory)

__all__ = ["dispose_users_engine", "get_users_db", "init_users_engine",
           "users_engine", "users_session_factory"]
