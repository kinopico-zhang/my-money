"""1.11.0 同步条三改的钉子: ①无常驻 — 条子定在顶上盖内容, 平时收在顶沿外,
问题态 (离线/没连上) 或手动同步亮一下报完即退 (退场闸 2.6 秒); ②主页下拉
到头 (橡皮筋) = 手动同步口, 只认主页本体的起手; ③「已同步」后的时间改
客户端本地的钟 (原先打的是服务器钟, 跟手机状态栏对不上) — 游标 lastSync
照旧服务器钟 (增量按它取), 展示钟 syncedAt 各存各的。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name):
    return (_BASE / name).read_text(encoding="utf-8")


def test_sync_strip_transient_css():
    """条子改 fixed 盖内容 (不占文档流): 平时 translateY(-101%) 收在顶沿外
    (101% 连底边线一起带走), .show 滑下; z 68 压推入层 (65) 让位记一笔弹层
    (70); main 自己吃顶衬 (原先靠条子的 padding 顶着 — 条子不占流了)。"""
    css = _static("css/bookkeeping-page.css")
    assert "position: fixed; top: 0; left: 0; right: 0; z-index: 68;" in css
    assert "transform: translateY(-101%);" in css
    assert ".sync-strip.show { transform: translateY(0); }" in css
    assert "padding: calc(var(--top-clear) + 14px) 16px" in css


def test_sync_strip_transient_js():
    """亮条语义: syncNow(show) 带参才亮 (进页/恢复联网手动), 定时器静默;
    成功后 syncedAt 落客户端钟并持久化, 展示读它 (游标照旧服务器钟);
    退场闸到点先摘 .show 再重判 (期间出问题就不退 — 钉这个回调形状)。"""
    js = _static("bookkeeping-sync.js")
    assert "async function syncNow(show) {" in js
    assert "let syncShown = false;" in js and "let stripHideTimer = null;" in js
    assert 'let syncedAt = Number(loadLS("bk-synced-at", "0")) || 0;' in js
    assert "syncedAt = Date.now();" in js and 'saveLS("bk-synced-at"' in js
    assert "lastSync = data.server_now;" in js      # 游标照旧服务器钟 (两码事)
    assert 'strip.classList.remove("show");' in js  # 退场闸摘的是 .show
    assert "syncNow(true);" in _static("bookkeeping-boot.js")  # 进页亮一下
    assert 'addEventListener("online", () => syncNow(true));' in js
    html = _static("bookkeeping.html")
    assert "bookkeeping-sync.js?v=4" in html and "bookkeeping-boot.js?v=7" in html \
        and "css/bookkeeping-page.css?v=56" in html


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
