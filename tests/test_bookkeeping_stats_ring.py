"""统计圆环图专钉 (renderStatsView 的 donut 部分): 分家自
test_bookkeeping_stats_view.py (200 行分家, 这是第五家) —
调色板 + 分段画法 + 折线引标几何 + 画框放大。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_stats_ring_palette_and_leader_lines():
    """1.15.0 圆环 = 7 槽分类色 + 榜外灰「其他」, pathLength 100 + dasharray 分段。
    折线引标 (用户点名「饼状图要用折线标出每个颜色类别」; 定案三条:
    起点垂直于弧 + 只弯一次 + 末段水平): 每段中角一根两段折线 — 径向短戳
    (弧中点沿半径, 戳长 [78, reach]) 接水平尾段, 弯折点还在自身射线上 →
    标签高度只能沿射线挪 (上半边往上够 / 下半边往下探), 上下界三处掐住:
    不贴环 / 不进标签列 / 不出画框; 同侧角序排开; 挤了先匀竖直射线
    (|dy|≥.95) 去对侧, 再缩档距 (16.5 → 14) 再挪环心 (居中优先) —
    直角肘柱那套整个退役。标签 = 类别名 + 占比 (与榜同一副 pctTxt 口径);
    量宽按原文 (转义串 &lt; 比真身长 3 字), 同侧线尾按列最宽者对齐成一
    竖列 (2026-10-09 用户报「小类页文字没对齐」— 名字长短不齐)。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert "STATS_RING_COLORS" in js and "STATS_OTHER_COLOR" in js  # 圆环调色板
    assert "stroke-dasharray" in js and "pathLength=\"100\"" in js  # 圆环分段画法
    assert 'class="dn-lead"' in js and 'class="dn-lbl"' in js and "text-anchor" in js \
        and "s.raw = `${s.nm} ${pctTxt(s.amt, total)}`" in js \
        and "s.lb = esc(s.raw);" in js and "txW(it.s.raw)" in js \
        and "col.right ? 329 - wMax : 11 + wMax" in js
    assert "const TOP = 10, BOT = 208, R2MIN = 78;" in js \
        and 'viewBox="0 0 340 218"' in js and "[104, 114, 94, 124, 84, 136, 82]" in js \
        and "const r2 = it.dy ? (it.b - cy) / it.dy : R2MIN;" in js
    assert "[[CX + 72.5 * it.dx, cy + 72.5 * it.dy]," in js \
        and "[CX + r2 * it.dx, it.b], [it.lx, it.b]]" in js
    assert "const place = (col, cy, gap)" in js and "solveSide(col, c)" in js \
        and "for (let gap = 16.5; gap >= 14; gap -= 0.5)" in js \
        and "Math.abs(big[i].dy) >= .95" in js and "big.splice(pick, 1)[0]" in js
    assert "const base = CX + 88" not in js and "segClear" not in js
    assert ".dn-lead { fill: none; stroke-width: 1; }" in css \
        and ".dn-lbl { fill: var(--ink-2); font-size: 11px; }" in css
    assert "width: min(100%, 440px)" in css    # 画布放大 (原 370, 配双层环几何)
