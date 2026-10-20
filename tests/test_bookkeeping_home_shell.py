"""2.0 挖财复刻批次 1 (底座换血) 的钉子: 首页蓝渐变封面 (填 iOS 27 顶带) +
快捷行 + 底栏三槽中央 morph 的橘 ⊕。封面数字/预算条由 renderCover 现算
(feedMonths 当月口径), 预算读 localStorage bk-budget-v1 (设置输入批次 4 落);
快捷行明细/日历过渡期滚页内锚点 (批次 3 换推入页), 周期账已推层。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name):
    return (_BASE / name).read_text(encoding="utf-8")


def test_home_cover_skeleton():
    """封面骨架 (挖财首页同款): 本月支出大数字 + 收入/结余行 + 月预算条
    (设了才亮, 超支翻红); 铺到 y=0 填系统磨砂带 — 顶衬钉在 --top-clear 下,
    蓝渐变在黑带下成「深蓝状态栏」观感 (ios27-pwa-top-blur 对策)。"""
    html = _static("bookkeeping.html")
    css = _static("css/bookkeeping-page.css")
    assert '<section class="cover" id="cover">' in html
    for pid in ("cov-expense", "cov-income", "cov-balance", "cov-budget",
                "cb-fill", "cb-used", "cb-total"):
        assert f'id="{pid}"' in html, f"封面缺 {pid}"
    assert 'class="quick-row" id="quick-row"' in html
    for q in ("ledger", "calendar", "cyc"):
        assert f'data-q="{q}"' in html, f"快捷行缺 {q} 格"
    cover = css.split(".cover {")[1].split("}")[0]
    assert "margin: 0 -16px;" in cover   # 负边距破 main 侧衬, 渐变全出血
    assert "linear-gradient(180deg, var(--cover-1), var(--cover-2));" in cover
    assert "padding: calc(var(--top-clear) + 8px) 16px 34px;" in cover
    main = css.split("main {")[1].split("}")[0]
    assert "padding: 0 16px" in main    # main 不再垫顶: 顶衬归封面 (带由蓝底填)
    # 预算条: 白 26% 底槽 + 白芯, 超支翻红警示 (挖财封面同款语义)
    assert "background: rgba(255,255,255,.26);" in css \
        and ".cov-budget.over .cb-track i { background: var(--red); }" in css
    # 快捷行三格骑在封面下沿 (负 margin 压上), 白卡软影是封面蓝投下来的
    assert "margin: -22px 0 12px;" in css.split(".quick-row {")[1].split("}")[0]
    assert "box-shadow: 0 4px 14px rgba(105,140,200,.18);" in css


def test_render_cover_and_quick_row_wiring():
    """封面数字现算 (renderCover, render 每趟带着画): feedMonths 当月口径,
    结余 = 收-支 (负数带负号); 预算条读 bk-budget-v1, 超支挂 .over + 槽宽
    封顶 100%; 快捷行周期账推层, 明细/日历滚页内锚点 — 直落不演 smooth
    (全应用程序动画一副弹簧, 系统 smooth 全撤, calendar_collapse 钉)。"""
    render = _static("bookkeeping-render.js")
    assert "function renderCover()" in render and "renderCover();" in render
    assert "feedMonths.get(curMonth())" in render
    assert 'localStorage.getItem("bk-budget-v1"' in render
    assert 'box.classList.toggle("over", st.expense > budget);' in render
    assert 'Math.min(st.expense / budget, 1) * 100 + "%";' in render  # 槽宽封顶
    assert 'if (cell.dataset.q === "cyc") { pushView("cyc"); return; }' in render
    assert ".scrollIntoView();" in render and '"smooth"' not in render
    # ⊕ 接线在 entry-sheet (原 #fab 的活): 中央钮开记一笔
    sheet = _static("bookkeeping-entry-sheet.js")
    assert '$("#tab-add")' in sheet and "openSheet(null)" in sheet
    assert '$("#fab")' not in sheet   # fab 退役, 老挂点不回潮
