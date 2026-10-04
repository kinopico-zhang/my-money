"""1.11.0 图标栅格扩容的钉子: 550 枚按意义分 19 组 (ICON_GROUPS 分节表 —
弹框按组铺小标 + 小栅格, 不分节翻不动); 选中态照记账页磁贴 (圆底灌深版
自选色、图形翻白, 蓝描圈退役)。数据完整性是主钉: 组里的图标 = ICON_BODIES
的键 (一枚不多一枚不落, 组间不重), 名字映射与词典指到的 slug 都真实存在
(大文件手拼, 错一枚就是选不中的死格)。"""
import re
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_JS = (_BASE / "category-icons.js").read_text(encoding="utf-8")
_BODIES = re.findall(r'^  "([a-z0-9-]+)": ', _JS, re.M)


def test_groups_cover_bodies_exactly():
    """分节表 ↔ 本体库对账: 19 组标签打头 (餐饮美食), 组里图标 550 枚、组间
    不重、与 ICON_BODIES 键严格相等 (键序即组序 — ICON_NAMES 派生于它)。"""
    block = _JS.split("const ICON_GROUPS = [", 1)[1].split("\n];", 1)[0]
    labels = re.findall(r'label: "([^"]+)"', block)
    slugs = re.findall(r'"([a-z0-9-]+)"', block)   # 标签是中文, 不进这个网
    assert len(labels) == 19 and labels[0] == "餐饮美食"
    assert len(slugs) == len(set(slugs)) == 550       # 组间不重, 全量
    assert set(slugs) == set(_BODIES)                # 与本体键一枚不差
    assert len(_BODIES) == 550


def test_mappings_point_at_real_slugs():
    """名字映射 (CATEGORY_ICONS, 单引号值) 与打字词典 (ICON_HINTS, 双引号值)
    指到的每一枚都得在 ICON_BODIES 里 — 错一枚就是栅格里选不中的死格。"""
    for target in re.findall(r": '([a-z0-9-]+)',", _JS):
        assert target in _BODIES, f"名字映射指到不存在的图标: {target}"
    for target in re.findall(r': "([a-z0-9-]+)",', _JS):
        assert target in _BODIES, f"词典指到不存在的图标: {target}"
    assert '"咖啡": "coffee-machine"' in _JS and '"狗": "dog"' in _JS


def test_mapping_tastes_pinned_to_the_map():
    """映射口味的禁词钉在映射段内 (不从 js_wiring 挪过来就顶破那头的语句帽):
    1.11.0 图标库扩容后 car-battery/shrimp 是栅格里的正经图标, 全量 not in
    拼串会误伤同名不同物 — 撞过三回的家规, 禁词钉段不钉壳。"""
    cat_map = _JS.split("const CATEGORY_ICONS = {", 1)[1].split("\n};", 1)[0]
    assert '"交通/充电": \'bolt-one\'' in cat_map and "car-battery" not in cat_map  # 充电: 插头图形
    assert '"虾饺": \'cat\'' in cat_map and "shrimp" not in cat_map   # 虾饺是只猫 (家里的猫咪)


def test_grouped_grid_and_tile_selection():
    """弹框栅格按组渲染 (cm-group 小标 + cm-gicons 小栅格, .cm-icons 只当
    滚动层); 选中态照记账页磁贴 (用户点名): --sel 灌深版自选色、图形翻白,
    蓝描圈退役; 打字搬运选中 (moveGridSel) 不重画栅格 — 分节后依旧。"""
    js = (_BASE / "bookkeeping-categories.js").read_text(encoding="utf-8")
    assert "ICON_GROUPS.map" in js and "cm-glabel" in js and "cm-gicons" in js
    assert "ICON_NAMES" not in js        # 平铺栅格退役, 取材走分节表
    assert "moveGridSel" in js
    css = (_BASE / "css" / "bookkeeping-panes.css").read_text(encoding="utf-8")
    assert ".push-pane .cm-glabel {" in css and ".push-pane .cm-gicons {" in css
    assert "grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));" in css
    assert ".push-pane .cm-tile.cur .ci {" in css
    assert "--sel: color-mix(in srgb, var(--cc) 72%, #000);" in css
    assert ".cm-tile.cur { outline:" not in css    # 蓝描圈退役
    html = (_BASE / "bookkeeping.html").read_text(encoding="utf-8")
    assert "category-icons.js?v=18" in html \
        and "bookkeeping-categories.js?v=10" in html \
        and "css/bookkeeping-panes.css?v=4" in html
