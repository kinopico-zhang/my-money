"""标签管理视图测试 (1.15.0): 挖财 2.0 复刻批次 3 把这节从 subpages 拆出
(subpages 顶满 200 行帽 — 家规拆新文件, 别往顶上摞)。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_tags_management_view():
    """标签管理 (1.15.0, 10-10 用户点名「设置页面新增一个标签管理页面, 可以
    添加修改标签」): 全量榜 = 本地字典 (手动添的, 还没上账也在册) + 账上在用
    + 挖财种子, 按字典倒序排 (与筛选的标签页同一把尺); 行内改名是真改 —
    字典/种子/账上每一笔的标签数组全换新名, 走脏名单照常上行; 记一笔的
    标签选择列表同吃字典 (添了就能挑到)。"""
    js = _static("bookkeeping-tags.js")
    sheet = _static("bookkeeping-entry-sheet.js")
    push = _static("bookkeeping-push.js")
    assert "function renderTagsView(target)" in js
    assert '"bk-tags-v1"' in js and "function tagList()" in js \
        and "return [...m].sort().reverse();" in js   # 字典倒序 (10-10 用户改口径)
    assert '<div class="pane-title">标签管理</div>' in js and 'id="tg-new"' in js \
        and "名字不能是空的" in js and "已经有「" in js   # 同记账一副清洗 + 查重
    # 改名三步落账: 字典 → 种子 (catTree.tags 兼串/对象) → 账上每笔 e.tags
    assert "dirty.add(e.id);" in js and "persist();" in js \
        and "scheduleSync();" in js and "\n    render();" in js   # 主页账目行跟着换
    assert '"bk-tags-v1"' in sheet           # 记一笔的选择列表同吃字典
    assert 'tags: "mine"' in push and 'view === "tags") renderTagsView(target)' in push
