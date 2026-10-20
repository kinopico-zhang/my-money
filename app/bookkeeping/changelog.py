"""My Money 更新日志数据: 每个版本 = 一批改动的合并, 文案站在使用者视角。

不逐提交记版本 (一个版本可以同时含多个修复和多个功能); 版本号 x.y.z ——
x 大改版 · y 新功能 · z 问题修复, 新批次加在最上面 (新→老)。
记账应用自己的版本线 (2026-09-14 起与 My Tesla 的更新日志各自独立)。
1.6.0 之前的批次按纪元归档进 pre_1_6.json (早年为 200 行模块上限分过
changelog_early / changelog_versions_1_4_to_1_5 两段 .py), 1.6.0 起每版
一个 json。2026-10-08 数据/代码分离: 批次文案全部转成 changelog_data/
目录下的 .json (纯数据, 文案一字未动), 本文件只留装载逻辑 —— 全局按版本
号降序拼装; 新批次 = 目录里加一个 json, 代码零改动 (拆文件的规矩对数据
文件退役, 与 My Tesla 相同的规矩也到此对齐)。"""
import json
from pathlib import Path
from typing import Final

from ..schemas import ChangelogItem, ChangelogVersion

_DATA_DIR = Path(__file__).parent / "changelog_data"


def _vkey(version: str) -> tuple[int, ...]:
    """「1.15.10」→ (1, 15, 10), 版本号降序的排序键。"""
    return tuple(int(p) for p in version.split("."))


def _load_all() -> list[ChangelogVersion]:
    """读 changelog_data/*.json (每版一个 json, 归档文件装多批, 文件内新→老),
    全局按版本号降序 —— 与分段时代 changelog.py 的拼接顺序一致
    (test_changelog 钉着 27 版全表)。键名手写取值, json 里写错键当场
    KeyError, 不静默吞。"""
    out: list[ChangelogVersion] = []
    for f in sorted(_DATA_DIR.glob("*.json")):
        for raw in json.loads(f.read_text(encoding="utf-8")):
            out.append(ChangelogVersion(
                version=raw["version"], date=raw["date"],
                items=[ChangelogItem(kind=i["kind"], text=i["text"])
                       for i in raw["items"]]))
    out.sort(key=lambda v: _vkey(v.version), reverse=True)
    return out


VERSIONS: Final[list[ChangelogVersion]] = _load_all()


def entries() -> list[ChangelogVersion]:
    """全部版本, 新→老。"""
    return VERSIONS
