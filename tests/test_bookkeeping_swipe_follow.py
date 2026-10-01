"""记一笔类别横划跟手 + 类别图标色暗底适配 (1.5.1) 的锁: 拆新文件 —
test_bookkeeping_page_and_categories 已顶 200 行硬上限。
2026-10-02 用户报两件: 「支出和收入类别左右滑动有抖动, 而且不跟手」+
「图标的颜色没有适配暗黑风格界面」。"""
from pathlib import Path

_STATIC = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_JS = (_STATIC / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
_SHEET_CSS = (_STATIC / "css" / "bookkeeping-entry-sheet.css").read_text(
    encoding="utf-8")


def test_swipe_follows_finger():
    """跟手三件套: 定轴门槛 30→10px (原死区 = 整程落后手指一指节才起跟);
    拖动元素上合成层 (逐帧 translateX 不再主线程重绘 — 抖动的主源);
    对面页影子由 fillChips 预建 (原先定轴那一刻 innerHTML 十几枚 SVG,
    卡一帧 = 起步一顿), 显隐走 hidden 而非建/撤。落定滑翔: 换页时真页
    顺划向退出与影子刚性首尾相接 (反向飞会在收尾把旧页戳进弹层左缘
    18px padding 条 — overflow 只裁到 padding 盒)。"""
    assert "Math.abs(dx) > 10" in _JS and "Math.abs(dx) > 30" not in _JS
    assert "will-change: transform" in _SHEET_CSS    # .cat-tiles 一处声明,
    #   影子页同用该类跟着吃到 (display:grid 会盖掉 hidden, css 补一条规则)
    assert ".cat-ghost[hidden] { display: none; }" in _SHEET_CSS
    assert "catGhost.innerHTML = chipsHtml(" in _JS  # fillChips 里预建对面页
    assert "g.innerHTML = chipsHtml(" not in _JS     # 定轴现建的老路不许回潮
    assert "sheet.appendChild(g)" not in _JS
    assert "catGhost.hidden = false" in _JS          # 定轴显形 (摆位先行)
    assert "hidden = true" in _JS                    # 松手/中断只藏不撤
    assert 'tiles.style.transition = "none";' in _JS  # 定轴置一次, 不逐帧重写
    assert "go ? d.dir * d.w : 0" in _JS       # 换页滑翔: 真页顺划向退出, 与
    #   影子同速同向全程首尾相接; 原先反向飞, 收尾把旧页右缘戳进弹层左缘
    #   padding 条 (2026-10-02 用户报「收入类别的左边短暂出现部分支出类别」)
    assert "go ? -d.dir * d.w" not in _JS      # 反向退出的老路 (影子弹回侧的
    #   `go ? 0 : -d.dir * d.w` 是它自己的, 不相干)


def test_category_icon_colors_dark():
    """图标色暗底适配: 方向线稿色三份 :root 副本 (page/categories/stats)
    一起提亮 —— 1.5.0 的粉彩档坐 #2c2c2e 暗井发灰; 选中填色的深一档
    (中明度黑白通吃) 与圆井底不动; 色票盘 12 枚整批换暗底档 (库里自选色
    列全空, 换值无迁移)。"""
    for name in ("bookkeeping-page.css", "bookkeeping-categories.css",
                 "bookkeeping-stats.css"):
        css = (_STATIC / "css" / name).read_text(encoding="utf-8")
        assert "--icon-red: #e5666a;" in css, name
        assert "--icon-green: #5fd47f;" in css, name
        assert "--icon-red: #d18f8f;" not in css, name    # 粉彩档不许回潮
        assert "--icon-green: #7fb5a3;" not in css, name
    page_css = (_STATIC / "css" / "bookkeeping-page.css").read_text(
        encoding="utf-8")
    assert "--icon-red-deep: #b87474;" in page_css   # 选中填色档: 中明度不换
    assert "--icon-tint: #2c2c2e;" in page_css       # 圆井底: 控件静止档不换
    cats_js = (_STATIC / "bookkeeping-categories.js").read_text(encoding="utf-8")
    for hexc in ("#e5696e", "#e88a55", "#d9b04c", "#b3bd5a", "#4dbf90",
                 "#57bdd1", "#79a8ec", "#95a0f2", "#b897e8", "#e687ad",
                 "#b59a7e", "#9aa7b9"):
        assert hexc in cats_js, f"色票 {hexc} 没上暗底档"
    for old in ("#d64953", "#cf6b32", "#b58a1f", "#8a9a27", "#18906a",
                "#1b8e9c", "#3a7cc8", "#5a6fd6", "#8a5fc9", "#c9527f",
                "#8a6b4f", "#64707f"):
        assert old not in cats_js, f"浅色档色票 {old} 回潮了"
