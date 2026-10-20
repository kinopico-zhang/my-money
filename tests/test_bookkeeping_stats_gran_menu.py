"""统计卡题下拉菜单测试: 2026-10-15 用户点名「左上角的大类支出可以点击,
展开下拉菜单, 可以在下拉菜单选择视图」(横滑分页随之退役)。

卡题钮化 (光杆文字 + 小尖角, m-btn 同款语感), 两张卡 (支出/收入) 的标题都
是同一状态的把手 — 菜单一枚, 点开挪进被点那张卡的卡头底下垂; 当前视图亮
蓝, 选中即切 (标题改字 + 版面整片重铺 + st.gran 落盘); 点菜单外收起。
版面单页常驻裸 id (两页 -sub 后缀族退役)。基础版面钉在
test_bookkeeping_stats_view.py (200 行分家, 这是第四家)。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_stats_gran_menu_switch():
    """卡题下拉: 单页版面 + 两把把手 + 菜单锚定/亮蓝/收起 + 切换落盘。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    # 版面单页常驻裸 id: 两张卡同一套 (-sub 后缀族/插值退役), 菜单藏粒在页尾
    assert 'id="gran-view"' in js and 'id="gran-menu"' in js \
        and 'data-g="top">大类' in js and 'data-g="sub">小类' in js \
        and "boardCards(st.gran === \"sub\" ? \"小类\" : \"大类\")" in js \
        and "${sfx}" not in js
    assert 'class="card-t gran-btn"' in js \
        and ".push-pane .gran-btn {" in css and ".push-pane .gran-menu {" in css \
        and ".push-pane .gran-view {" in css \
        and ".push-pane .card-t { padding: 13px 14px 4px; font-size: 17px;" in css
    assert "[data-view=\"stats\"] .pane-scroll {" in css \
        and "flex-direction: column; overflow: hidden;" in css \
        and "overflow-y: auto;" in css   # 版面身单滚 (层身不滚, 工具行钉住)
    # 菜单一枚: 点标题从被点那张卡头垂下 (挪进 board-h), 当前视图亮蓝; 点菜单
    # 外收起; 不做视图间滚动记忆 (标题在滚动内容里, 点得到它时人必在页顶,
    # 记了也永远是 0); 选中即切: 标题改字 + 版面重铺 + st.gran 落盘 (下次进
    # 来还在这个视图)
    assert "const granLabels = () =>" in js and "el.dataset.noun" in js \
        and "btn.closest(\".board-h\").appendChild(granMenu);" in js \
        and 'b.classList.toggle("on", b.dataset.g === st.gran));' in js \
        and 'st.gran = b.dataset.g;' in js \
        and "granLabels();\n    render();" in js \
        and "granTop" not in js \
        and '.gran-menu, .gran-btn")) return;' in js \
        and ".push-pane .gran-menu button.on { color: var(--accent); font-weight: 600; }" in css
    # 尖角翻转记开态; aria-expanded 跟着菜单走
    assert ".gran-btn.on .gran-car { transform: rotate(180deg); }" in css \
        and 'btn.setAttribute("aria-expanded", "true");' in js \
        and 'b.setAttribute("aria-expanded", "false");' in js


def test_stats_gran_pager_retired():
    """横滑分页退役: 分页器/步长/落位全拆; 触轴例外 — 10-17 断触根治反而
    全层放行 pan-x (touch-action 只裁原生滚动, 放行后横拖无原生目标可
    接管, 全归右划手势; 细钉在 swipe_gestures), stats 专属触轴规则随之退役。
    筛选弹框里的两页横滑 (flt-pager) 不在此列, 那是弹框自己的。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert "gran-pager" not in js and ".gran-pager" not in css \
        and ".gran-page" not in css \
        and "const stride = () =>" not in js and "pager.scrollLeft" not in js \
        and 'data-view="stats"] { touch-action' not in css \
        and 'id="by-cat-sub"' not in js and 'id="by-cat-in-sub"' not in js
