"""1.6.0 类别聪明事的接线锁: 备注匹配 (自学习票权 + 钟点先验) / 格子热度排序 /
钟点预选餐段。纯逻辑在 bookkeeping-categorizer.js (node --test 直测 + c8 盖
分支); 这里钉弹层接线与装载序 — wiring 测试文件已顶行数, 拆新文件。"""
from pathlib import Path

_STATIC = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_JS = (_STATIC / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
_CAT = (_STATIC / "bookkeeping-categorizer.js").read_text(encoding="utf-8")
_HTML = (_STATIC / "bookkeeping.html").read_text(encoding="utf-8")


def test_categorizer_pure_logic_module():
    """纯逻辑红线: 不碰页面/存储/网络 (node 直测 + c8 盖分支)。自学习口径:
    词库即参数, 每次收备注时就地全量重导 (毫秒级) — 不养夜间训练任务,
    匹配全在手机端, 服务器零新增负载。"""
    for banned in ("document", "localStorage", "fetch(", "XMLHttpRequest"):
        assert banned not in _CAT, banned
    assert "RANK_WINDOW_DAYS = 90" in _CAT
    #    ↑ 90 天一个窗: 排序的频率窗与票权的新鲜窗共用这一个常数
    assert 'const w = today && String(e.date || "") >= cutoff ? 2 : 1;' in _CAT
    #    ↑ 自学习票权: 近一季双票 — 老账投错的类, 新近改对一笔即 2:1 翻案
    assert "function mealCategoryByHour(hour)" in _CAT
    assert 'return { cat: topCat(exact, prefer), how: "exact" };' in _CAT
    #    ↑ 钟点先验: 平票一伙里属意这顿饭的类别拍板
    assert ("module.exports = { normNote, buildNoteIndex, matchNoteCategory,"
            in _CAT) and "rankCategories, mealCategoryByHour }" in _CAT


def test_note_match_wiring():
    """备注收起 → 自动配类别: 只补没选的 (手选/改账带出的绝不覆盖, 钟点预选
    可被顶掉 — catHandPicked 区分); pressOn 落点闸治 iOS blur-先于-click 竞态
    (打完备注直接点格子, 回填会被 toggle 清掉 = 点了没反应); 索引每次就地重建。"""
    assert "function autoPickCat()" in _JS
    assert "matchNoteCategory(raw," in _JS
    assert "buildNoteIndex(entries, sheetKind, sheetCats(), todayStr()), whenVal.hh);" in _JS
    assert "if (sheetCat && catHandPicked) return;" in _JS
    assert "if (pressOn) return;" in _JS
    assert _JS.count("noteKbOpened = false;") == 4   # 声明 + autoPickCat 消费 + 两处程序化收起前清
    assert 'e.target.closest("#cat-tiles, #amt-cat, #cat-pick, #cp-list")' in _JS
    assert 'addEventListener("pointerup", () => { pressOn = null; }, true);' in _JS
    assert 'addEventListener("pointercancel", () => { pressOn = null; }, true);' in _JS
    assert _JS.count("catHandPicked = true;") == 2   # 格子 toggle + 树行选中都算手选
    assert "catHandPicked = !!entry;" in _JS         # 改账带出的类别当手选


def test_tiles_ranking_wiring():
    """格子排序接线: chipsHtml 消费 rankCategories 全排序切前 15 格 (5×3),
    影子页同走 chipsHtml 一副排序; 手排清单退役 (wiring 测试另钉 not in)。"""
    assert "function catOptions(kind)" in _JS
    assert "rankCategories(entries, kind, new Set(byKey.keys()), todayStr())" in _JS
    assert ".slice(0, 15)" in _JS


def test_meal_preselect_and_load_order():
    """钟点预选: 新记支出且没选类别时按拨轮钟点点亮一顿饭 (树里没那餐作罢);
    装载序: categorizer 在 amount-calculator 之后、state 之前 (先定义后消费),
    entry-sheet 版本 25→26 (内容变了必须 bump — immutable 缓存教训)。"""
    assert "mealCategoryByHour(whenVal.hh)" in _JS
    assert "if (sheetCats().has(meal)) sheetCat = meal;" in _JS
    assert 'bookkeeping-categorizer.js?v=1' in _HTML
    assert _HTML.index("amount-calculator.js?v=1") < _HTML.index("bookkeeping-categorizer.js?v=1")
    assert _HTML.index("bookkeeping-categorizer.js?v=1") < _HTML.index("bookkeeping-state.js")
    assert 'bookkeeping-entry-sheet.js?v=27' in _HTML
