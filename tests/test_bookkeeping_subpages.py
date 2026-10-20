"""记账推入层测试 (1.8.0): 设置/统计/类别管理/更新日志从独立网页并进记账页,
从右滑入盖住主页 (my-music 二级页同款)。钉三块: 主页入口接线 (data-push)、
层机制 (滑入/滑出/右划返回)、视图的渲染函数 (骨架先弹, 数据后拉 — 统计视图
1.15.0 满员分家到 test_bookkeeping_stats_view.py)。"""
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _user

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_tab_bar_push_layers():
    """底部常驻 tab 栏 (2.0 挖财三槽中央 morph): [报表|⊕/首页|我的] 三枚主
    槽驱动推入层栈 (不跳页) — 中央槽首页态是橘 ⊕ (开记一笔), 其他 tab 态
    morph 成「首页」跳回 (栏挂 .at-home 翻面孔, CSS 管); 明细 tab 退役
    (明细内容批次 3 搬进推入页), 右下悬浮加号 fab 一并退役 (记一笔入口
    全归中央 ⊕); 层挂点 #push-stack 在主页骨架里, 层样式/层机制/视图脚本
    随主页一起装 (点开零网络零编译 — 「先弹页面再慢慢加载数据」的终极
    形态); 明细层自带底栏 (主栏 own-bar 让位 — 钉在 ledger 测试)。"""
    html = _static("bookkeeping.html")
    css = _static("css/bookkeeping-page.css")
    assert 'id="tab-bar"' in html and 'aria-label="主导航"' in html
    for tab in ("home", "stats", "mine"):
        assert f'data-tab="{tab}"' in html, f"tab 栏缺 {tab} 标签"
    assert "quick-btn" not in html and "quick-btn" not in css   # 快捷圆钮退役
    assert 'id="fab-stack"' not in html and 'id="fab"' not in html \
        and '<div id="push-stack"></div>' in html   # fab 退役 (⊕ 进中央槽), 层挂点在骨架
    assert 'href="/bookkeeping/stats' not in html and \
        'href="/bookkeeping/settings' not in html   # 跳页入口退役
    for src in ("css/bookkeeping-panes.css?v=38",
                "bookkeeping-recurring.js?v=2",
                "bookkeeping-settings.js?v=9", "bookkeeping-stats.js?v=33",
                "bookkeeping-report-shot.js?v=4", "bookkeeping-categories.js?v=11",
                "bookkeeping-tags.js?v=2", "bookkeeping-ledger.js?v=2",
                "bookkeeping-push.js?v=14", "bookkeeping-boot.js?v=10"):
        assert f'src="/bookkeeping/static/{src}"' in html or \
            f'href="/bookkeeping/static/{src}"' in html, f"主页没装 {src}"
    boot = _static("bookkeeping-boot.js")
    assert "for (const warm" not in boot      # 1.7.4 子页预热随独立页退役
    # 中央槽两副面孔: .at-home 亮橘 ⊕ (骑栏沿冒头), 否则亮「首页」回主页
    assert 'id="tab-add"' in html and 'class="tb-mid"' in html
    assert "#tab-bar.at-home .tb-home { display: none; }" in css \
        and "#tab-bar:not(.at-home) .tb-add { display: none; }" in css
    add = css.split(".tb-add {")[1].split("}")[0]
    assert "background: var(--accent);" in add and "margin-top: -18px;" in add
    tabs = css.split("#tab-bar {")[1].split("}")[0]
    assert "position: fixed" in tabs and "z-index: 69;" in tabs \
        and "max-width: 560px" in tabs       # 跟 main 同宽, 宽屏居中不摊大饼
    # 2.0 tab 字色 jz 口径: 默认 #999 激活 #333 — 橘只归中央 ⊕
    assert "#tab-bar button.on svg { color: var(--ink-1); }" in css
    panes = _static("css/bookkeeping-panes.css")
    z = panes.split("#push-stack {")[1].split("}")[0]
    assert "z-index: 65;" in z   # 层让位 tab 栏 (69): 层开着也能切 tab、记一笔
    scroll = panes.split(".push-pane .pane-scroll {")[1].split("}")[0]
    assert "var(--tab-h) + 24px" in scroll   # 层内容尾垫出 tab 栏高, 尾行不被盖
    # 2026-10-09 用户报「报表页面下面有一个黑边」: 报表层改列布局后, 80px 底
    # 衬常露一条黑带 — stats 层底衬收成 10px (分页器探到 tab 栏底下, 栏不透
    # 明盖住), 清栏高的垫底挪进页身 (.gran-view 自己的滚动垫, 滚到尾才见)
    assert "padding-bottom: 10px;" in panes \
        and "padding-bottom: calc(env(safe-area-inset-bottom) + var(--tab-h) + 18px);" in panes
    # 1.15.0 根层 (报表/我的) 内容上沿 = 全局上边界同线 (安全区+36 / 独立模式
    # 80 磨砂带底沿, my-tesla 同款 --content-top): 层级层大标题的 env+14 线
    # 不归根层用 — 标题退役后内容顶头就上, 会钻进模糊带 (2026-10-08 用户报);
    # 2.0 mine 根层 + 批次 3 明细/账单日历 (顶上无大标题, 控件就是第一行)
    # 同钉 --content-top — env+14 会让 chips 行/月头步进器钻带
    assert "--content-top: max(calc(env(safe-area-inset-top, 0px) + 36px)," in css
    assert ('.push-pane[data-view="stats"] .pane-scroll,\n'
            '.push-pane[data-view="mine"] .pane-scroll,\n'
            '.push-pane[data-view="ledger"] .pane-scroll,\n'
            '.push-pane[data-view="bill-cal"] .pane-scroll {\n'
            '  padding-top: var(--content-top);') in panes


def test_push_layer_mechanics():
    """层机制 (bookkeeping-push.js, my-music music-push-panes 同款移植):
    translateX(100%) 藏右沿、加 .open 滑入 (.34s 缓出曲线); 右划/右拖跟手
    (指针捕获 + 拖动关过渡), 过四分之一 (1.14.0 从 1/3 降门槛, 桌面版手势难
    触发) 或带甩劲收层、否则弹回; 焦点早摘 + 420ms 后移除 DOM (键盘收稳再
    拆, iOS 冻布局的坑); 同页重推不重开; 返回圆钮 1.14.0 加、1.15.0 退役
    (怎么来怎么回去: 子界面统一右滑入, 回头统一右划, 键鼠 Esc); Esc 收顶层
    (弹框开着先收框; tab 根层不归它收); data-push 文档级委托; 1.15.0 底部
    tab 栏驱动层栈 (栈顶在哪枚 tab 栏上亮谁, 切 tab 收栈/推层)。"""
    js = _static("bookkeeping-push.js")
    css = _static("css/bookkeeping-panes.css")
    assert "const pushStack = [];" in js
    assert "translateX(100%)" in css
    assert "transition: transform .34s cubic-bezier(.32,.72,.35,1);" in css
    assert "will-change: transform;" in css
    assert "void pane.offsetWidth;" in js    # 起点落地再放滑入 (rAF 会饿死)
    assert "pane.classList.add(\"open\")" in js
    assert "setPointerCapture" in js and 'pane.style.transition = "none";' in js
    assert "dx <= width / 4 && !flick" in js and "lastT < 130 && lastX - startX > 30" in js
    # 断触根治 (10-17 用户报「右划/边缘返回总被断触取消, my-music 没有」):
    # 层身触轴改放行 pan-x + 判横收 45° 一把尺 (10-09 的 63° 边缘锥是误诊
    # — 抢到的斜划全被浏览器判回竖滚, 死得更显眼); 拼图细钉在 swipe_gestures
    assert "const edge = startX <= 28;" not in js \
        and "horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy);" in js \
        and "touch-action: pan-x pan-y;" in css
    assert 'ev.key !== "Escape"' in js and \
        "closePushStack(pushStack.length - 1)" in js    # Esc 收顶层 (层级层)
    assert "TAB_OF[top.view] === top.view" in js    # 根层不归 Esc 收: 切换走 tab 栏
    assert '#cat-modal:not([hidden]) .cm-mask' in js    # 弹框开着: Esc 先收框
    assert ".bk-sheet:not([hidden]) .bs-mask" in js     # 统计的筛选/日历框同礼数
    assert "data-push" in js and "document.addEventListener(\"click\"" in js
    assert "closePushStack" in js and "pushView" in js
    assert "swallowClick" in js               # 拖层松手吞尾随 click (键鼠不误触行)
    assert 'closest("#cat-modal, .bk-sheet")' in js   # 弹框上起手不拖层 (两副框都算)
    # 1.14.0 返回圆钮, 1.15.0 退役 (用户定案「怎么来怎么回去」): 子界面统一
    # 从右滑入, 回头路统一是全局右划收回 (键鼠另有 Esc); 层里只剩滚动本体,
    # 没有钉在层顶的钮了
    assert "const root = TAB_OF[view] === view;" in js \
        and "if (!root) bindPaneSwipe(pane);" in js
    assert "pane-back" not in js and ".pane-back" not in css
    assert "innerHTML = '<div class=\"pane-scroll\"></div>'" in js
    assert 'id="pane-gap"' not in js and ".pane-gap" not in css   # 让位空档随之退役
    # 类别管理行左滑与层右划分家: 行的右向让给层 (层任意位置起手都是返回)
    cats = _static("bookkeeping-categories.js")
    assert "if (dx > 12) { sw = null; return; }" in cats
    # 1.15.0 tab 栏驱动: 类别管理/更新日志/标签/周期账归我的 tab; 下钻两层
    # (大类→小类→明细) 归报表 tab; 目标层在栈里就收到它露头 (顶上还压着
    # 嵌套层也一并收走, 层壳与滚动位置原样保住), 不在栈里先清场再推; tab 间
    # 平级跳转一律即切 — 不放「从右进入」的滑入 (那是层级语义), 滑出留给收
    # 嵌套层与手势
    assert "const TAB_OF = {" in js and 'categories: "mine"' in js \
        and '"cat-subs": "stats"' in js
    # 批次 3: 明细/账单日历归首页 tab 的层级层, own-bar 让位主栏 — 钉在
    # test_bookkeeping_ledger (那是明细层的接线家)
    assert "function topTab()" in js and "function updateTabs()" in js
    assert 'classList.toggle("on"' in js and 'getElementById("tab-bar")' in js
    assert "function switchTab(" in js and "closePushStack(idx + 1)" in js \
        and "idx !== pushStack.length - 1" in js
    assert "function pushView(view, instant)" in js \
        and 'pane.className = "push-pane" + (instant ? " snap" : "");' in js
    assert "closePushStack(0, true)" in js \
        and 'item.pane.style.display = "none";' in js
    snap = css.split(".push-pane.snap {")[1].split("}")[0]
    assert "transition: none;" in snap


def test_subpages_behind_login_and_redirect(usersdb):
    """四个退役地址仍在登录墙后: 匿名 302 回记账 scope 的登录页 (中间件),
    登录后 307 落回记账主页 — 不 404 (404 会被 immutable 长缓存记住一年)。"""
    anon = TestClient(m.app)
    for path in ("/bookkeeping/settings", "/bookkeeping/stats",
                 "/bookkeeping/categories", "/bookkeeping/changelog"):
        r = anon.get(path, follow_redirects=False)
        assert r.status_code == 302, f"{path} 未拦"
        assert "/bookkeeping/login" in r.headers["location"]
    client, _ = _user(usersdb, "记账人甲")
    r = client.get("/bookkeeping/settings", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/bookkeeping/"
    assert client.get("/bookkeeping", follow_redirects=False).status_code == 200


def test_settings_view_wiring():
    """设置视图 (renderSettingsView): 账号/版本拉接口填上, 类别管理/标签管理/
    更新日志在层里再推一层 (data-push), 退出登录 POST 完回登录页; 401 自己回
    登录页 (层不是页面, 登录墙拦不到它)。"""
    js = _static("bookkeeping-settings.js")
    assert "async function renderSettingsView(target)" in js
    assert '"/api/me"' in js and "changelog/api/entries" in js
    assert '"/bookkeeping/api/logout"' in js and "location.href" in js
    assert 'data-push="categories"' in js and 'data-push="tags"' in js \
        and 'data-push="changelog"' in js
    assert "status === 401" in js and '"/bookkeeping/login"' in js
    assert 'id="me-name"' in js and 'id="ver"' in js and 'id="logout"' in js
    assert "类别管理" in js and "标签管理" in js and "更新日志" in js and "退出登录" in js
    css = _static("css/bookkeeping-panes.css")
    # 1.9.0 修一: iOS 给按钮吃 flex 却不块化, 行按钮得 width: 100% 才吃满
    # 卡宽 (用户报「类别管理/更新日志没填充整行」; my-music 1.8.24 同款兜底)
    assert ".push-pane button.row { width: 100%; text-align: left; }" in css
    # 1.15.0 设置页大标题/返回钮/右划退役 (底部 tab 栏就是路) — 内容顶头就上;
    # 层里再推的更新日志是层级深处, 大标题照旧当路牌 (返回钮已全数退役)
    assert 'class="pane-gap"' not in js and '<div class="pane-title">设置</div>' not in js
    assert '<div class="pane-title">更新日志</div>' in js
    # 1.9.0 修二: 层顶衬与 my-music 根页首段标题同一高度 (env+14, 不吃
    # --top-clear 的 96 下限 — 用户点名对齐 my-music 根页)
    assert "padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px" in css
# 标签管理视图 (1.15.0) 的钉子在 test_bookkeeping_tags_view.py — subpages
# 顶满 200 行帽 (家规拆新文件, 别往顶上摞)
