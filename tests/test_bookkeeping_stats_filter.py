"""统计筛选树级联测试: 2026-10-15 用户点名「选了大类, 子类要自动勾上」。

大类勾 = 整类 (键在选, 名下小类行跟着亮); 摘单颗小类记 sel.excl — 大类键
不动, catHit 对掉 (光秃大类的账不误伤: category 就是大类名的笔照算);
整类在选但摘过小类时大类亮半选 (横杠), 点它一键勾满整类; 全选只落大类键。
基础筛选页钉在 test_bookkeeping_stats_view.py (200 行分家, 这是第三家)。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_stats_filter_tree_cascade():
    """大类/小类三态级联: sel.excl 模型 + 半选钮 + 一键勾满。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    # sel 三件套: excl = 大类罩着时被单摘的小类键 (弹框取消/撤回三样都得还原)
    assert "const sel = { cats: new Set(), tags: new Set(), excl: new Set() };" in js \
        and "selBackup = { cats: new Set(sel.cats), tags: new Set(sel.tags)," in js \
        and "excl: new Set(sel.excl) };" in js \
        and "sel.excl = selBackup.excl;" in js
    # catHit: 大类键命中后再对账目全路径 — 对上被摘的小类键就不算; 光秃大类
    # (category 就是大类名) 拼出的键带空尾巴, 对不上任何被摘键, 照算
    assert "const catHit = (e, k) =>" in js and 'k.includes("/", bar)' in js \
        and '!sel.excl.has(`${k}/${String(e.category || "").slice(top.length + 1)}`)' in js
    # 行显示态: 小类 = 整类罩着 (没被摘) 或自己在选; 大类 = 在选且名下没摘过;
    # 半选 = 摘过小类或散小类在选 (横杠 FT_DASH 代勾)
    assert "const FT_DASH = " in js \
        and "? (sel.cats.has(pk) && !sel.excl.has(key)) || sel.cats.has(key)" in js \
        and "const exUnder = pk => [...sel.excl].some(x => x.startsWith(`${pk}/`));" in js \
        and 'class="ft-chk${on ? " on" : some ? " some" : ""}"' in js \
        and '${some ? FT_DASH : FT_CHK}' in js \
        and ".push-pane .ft-chk.some { background: var(--accent);" in css
    # 点击: 小类在整类罩着时摘/回记 excl; 大类满选摘整类, 半选/空选勾满整类
    # (散小类键收编); 全选只落大类键, 重置三样全清
    assert 'if (sel.excl.has(k)) sel.excl.delete(k); else sel.excl.add(k);' in js \
        and "const under = [...sel.excl].some(x => x.startsWith(`${k}/`));" in js \
        and "if (sel.cats.has(k) && !under) sel.cats.delete(k);" in js \
        and 'for (const x of [...sel.cats]) if (x.startsWith(`${k}/`)) sel.cats.delete(x);' in js \
        and 'for (const g of t[kind] || []) sel.cats.add(`${kind}|${g.name}`);' in js \
        and "sel.excl.clear();" in js \
        and "sel.cats.clear(); sel.tags.clear(); sel.excl.clear();" in js
    # 勾选后整树重画 (大类小类联动), 不再原地翻钮
    assert "buildFlt();    // 勾选牵一发动全身 (大类小类联动), 重画一遍最省心" in js
