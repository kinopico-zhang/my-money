"""记账页 2.0 挖财亮色换装 (复刻挖财记账 v13.1.6) 的主题锁: 拆自
test_bookkeeping_page_and_categories.py, 1.5.0 曾是暗色锁, 2.0 翻亮。"""
from pathlib import Path

_CSS = Path(__file__).parent.parent / "app" / "bookkeeping" / "static" / "css"


def test_bookkeeping_light_theme_palette():
    """页面级 :root 副本是手工同步的, 主题身份 (light 声明 + 挖财灰底白卡 +
    橘强调) 逐份点名 — 漏改就有的页还停在暗色 (1.8.0 起唯一副本在 page.css:
    四个子页并进推入层, 层随主文档吃同一份 :root); 顺手把暗色时代的字面量
    钉死为零 (再冒头就是漏网的硬编码; 深色键盘面 --pad-* 与同步条深色
    toast 是有意保留的深色件, 不在此列; 类别色票/报表海报在 js 里不归这管)。"""
    with_root = ["bookkeeping-page.css"]
    for name in with_root:
        text = (_CSS / name).read_text(encoding="utf-8")
        assert "color-scheme: light" in text, name
        assert "--bg: #F6F6F6;" in text, name          # jz_background_color
        assert "--surface: #FFF;" in text, name      # jz_list_bg_color
        assert "--ink-1: #333;" in text, name        # jz_major_text
        assert "--hairline: #ECECEC;" in text, name     # jz_divider_color
        assert "--accent: #FF7A40;" in text, name       # jz_theme_red (挖财橘)
        assert "--green: #32B572;" in text, name        # 挖财收入绿
        assert "--red: #DE4A3F;" in text, name          # 挖财支出红
        assert "--cover-1: #7699D7;" in text, name      # 封面蓝渐变 (像素实测)
        assert "--cover-2: #698CC8;" in text, name
    for path in sorted(_CSS.glob("*.css")):
        text = path.read_text(encoding="utf-8")
        for lit in ("#1c1c1e", "#2c2c2e", "#3a3a3c", "#3987e5", "235,235,245",
                    "#e5666a", "#5fd47f"):
            assert lit not in text, f"{path.name}: {lit}"
