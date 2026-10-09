"""首启引导的缺口判定 (非 Tesla 应用变体): 只有账号一步, 恒无缺口。

三步版部署 (My Home / My Tesla) 的缺口跟着 Tesla 应用走 (数据源/高德
Key, 缺则应用门拦回 /setup); 本仓没有那两步, 管理员建完引导即完成。
与 session_api 的 missing 契约对齐, 恒返回空表。"""


def wizard_missing() -> list[str]:
    """还差的配置步 (本仓恒为空表: 引导只有账号一步)。"""
    return []
