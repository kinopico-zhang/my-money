"""1.11.0/1.11.1 同步条改 transient 的钉子: ①无常驻 — 条子定在顶上盖内容,
平时收在顶沿外; ②主页下拉到头 (橡皮筋) = 手动同步口, 只认主页本体的起手;
③「已同步」后的时间改客户端本地的钟 (游标 lastSync 照旧服务器钟, 两码事);
④1.11.1 亮条只归下拉 — 进页/联网恢复/定时器全静默, 问题态 (离线/没连上)
降为 hush 弱化样式钉住, 问题解除自己收 (不闪「已同步」)。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name):
    return (_BASE / name).read_text(encoding="utf-8")


def test_sync_strip_transient_css():
    """条子改 fixed 盖内容 (不占文档流): 平时 translateY(-101%) 收在顶沿外
    (101% 连底边线一起带走), .show 滑下; z 68 压推入层 (65) 让位记一笔弹层
    (70); main 自己吃顶衬 (原先靠条子的 padding 顶着 — 条子不占流了);
    hush 弱化档: 小一号再打六折 (1.11.1 问题态专用)。"""
    css = _static("css/bookkeeping-page.css")
    assert "position: fixed; top: 0; left: 0; right: 0; z-index: 68;" in css
    assert "transform: translateY(-101%);" in css
    assert ".sync-strip.show { transform: translateY(0); }" in css
    assert "padding: calc(var(--top-clear) + 14px) 16px" in css
    assert ".sync-strip.hush { font-size: 10.5px; opacity: .62; }" in css


def test_sync_strip_quiet_unless_pulled():
    """亮条窗口只有下拉一个入口 (1.11.1): syncNow(true) 全库只此一唤 (手势
    里), 进页/联网恢复都走无参静默; 静默重试起手不 render (钉住的「没连上」
    不闪), 结果落定才在 finally 画; 问题态 hush 弱化钉住; 成功后 syncedAt
    落客户端钟并持久化 (游标照旧服务器钟); 退场闸到点先摘 .show 再重判。"""
    js = _static("bookkeeping-sync.js")
    assert js.count("syncNow(true)") == 1        # 唯一亮条入口: 下拉手势里
    assert "async function syncNow(show) {" in js
    assert "let syncShown = false;" in js and "let stripHideTimer = null;" in js
    assert 'let syncedAt = Number(loadLS("bk-synced-at", "0")) || 0;' in js
    assert "syncedAt = Date.now();" in js and 'saveLS("bk-synced-at"' in js
    assert "lastSync = data.server_now;" in js      # 游标照旧服务器钟 (两码事)
    assert 'strip.classList.remove("show");' in js  # 退场闸摘的是 .show
    assert "if (syncShown) renderSyncStrip();" in js  # 静默起手不亮「同步中…」
    assert 'if (pin && !loud) strip.classList.add("hush");' in js  # 问题态弱化
    assert "syncNow();" in _static("bookkeeping-boot.js")  # 进页静默 (1.11.1)
    assert 'addEventListener("online", () => syncNow());' in js  # 联网恢复静默
    html = _static("bookkeeping.html")
    assert "bookkeeping-sync.js?v=5" in html and "bookkeeping-boot.js?v=8" in html \
        and "css/bookkeeping-page.css?v=57" in html


def test_pull_to_sync_gesture():
    """下拉手势: 只认主页本体 (main/日历胶囊) 的起手 + 起手那刻已在顶
    (scrollY <= 0 — 页面中途滚到顶的接力不算); 拖动中过 70 即触发 (拉丝的
    同时条子滑下报「同步中…」), 一触只发一次; passive 监听 (不拦系统
    橡皮筋)。层/弹层/弹框里的起手 closest 不中, 天然不参与。"""
    js = _static("bookkeeping-sync.js")
    assert "let pullY = null;" in js and "let pullFired = false;" in js
    assert 'e.target.closest("main, #cal-bar") && window.scrollY <= 0' in js
    assert "e.touches[0].clientY - pullY > 70) { pullFired = true; syncNow(true); }" in js
    assert "{ passive: true });" in js
