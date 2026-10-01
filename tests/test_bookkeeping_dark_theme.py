"""记账五页暗色换装 (1.5.0, my-music 同款) 的主题锁: 拆自
test_bookkeeping_page_and_categories.py (那边行数顶到 pylint 上限)。"""
from pathlib import Path

_CSS = Path(__file__).parent.parent / "app" / "bookkeeping" / "static" / "css"


def test_bookkeeping_dark_theme_palette():
    """五份页面级 :root 副本是手工同步的, 主题身份 (dark 声明 + 纯黑壳 + 蓝强调)
    逐份点名 — 漏改一份就有的页还停在浅色; 顺手把旧浅色时代的字面量钉死为零
    (再冒头就是漏网的硬编码, 类别色票在 js 里不归这管)。"""
    with_root = ["bookkeeping-page.css", "bookkeeping-changelog.css",
                 "bookkeeping-categories.css", "bookkeeping-stats.css",
                 "bookkeeping-settings.css"]
    for name in with_root:
        text = (_CSS / name).read_text(encoding="utf-8")
        assert "color-scheme: dark" in text, name
        assert "--bg: #000;" in text, name
        assert "--accent: #3987e5;" in text, name
    for path in sorted(_CSS.glob("*.css")):
        text = path.read_text(encoding="utf-8")
        for lit in ("#d9e6f8", "#bfd7fb", "#ddfb1e", "23,30,42", "31,49,71"):
            assert lit not in text, f"{path.name}: {lit}"
