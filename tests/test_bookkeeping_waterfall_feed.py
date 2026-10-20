"""记账账目瀑布流测试 (2.0 批次 3 起住明细推入层): 所有月份一条往下滚的长列表
(单向懒加载 — 层从最新的日组起头只往下展开), 主页日历恒当前月 (点日 = 记一笔
预填该日, 月头点开账单日历推入层)。拆自 test_bookkeeping_page_and_categories.py
(200 行上限满了); 顶部胶囊/收拢状态机/左右划翻月三户 (test_bookkeeping_calendar_
bubble/collapse/nav.py) 随胶囊机器批次 3 退役一起拆除; 胶囊退役后双向窗口
(往上补/跳位滑屏) 没有存在的前提, 单向化随搬家落定。"""
from pathlib import Path


def test_bookkeeping_ledger_waterfall_feed():
    """瀑布流 (批次 3 搬进 bookkeeping-ledger.js): 懒加载单向 — 层从最新的
    日组起头往下展开 (drawLess/feed-top 哨兵/跳位滑屏/scrollBy 坐标补偿全
    退役); 数据半边留在 render.js (buildFeed/feedSignature 算出 feedGroups/
    feedMonths 供封面/日历/明细层共用), render() 每趟发 bk-render, 层开着
    跟着重铺 (层里自保滚位 — 记一笔/删一笔/同步完开着不用关)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    panes_css = (base / "css" / "bookkeeping-panes.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    ledger = (base / "bookkeeping-ledger.js").read_text(encoding="utf-8")
    merge = (base / "bookkeeping-merge.js").read_text(encoding="utf-8")
    state = (base / "bookkeeping-state.js").read_text(encoding="utf-8")
    # 主页不再有列表 (整条搬明细层): 列表骨架/哨兵/空态全退役
    for gone in ("feed-top", "entry-list", "feed-more", "list-empty",
                 "feed-end", "cal-bar"):
        assert f'id="{gone}"' not in html
    assert "function visibleEntries(entries) {" in merge
    #    ↑ 只挑未删除 (1.x 立的形状不变); 瀑布流全月份不带筛选参数
    assert "visibleEntries(entries)" in render
    assert "bk-month" not in state and "bk-person" not in state
    #    ↑ 月份/记账人偏好不再存 localStorage (账全排一条流, 谁记的写在每笔上)
    # 数据半边在 render.js: 签名去抖 + 月度小计 (封面/日历月头/明细层月卡共用)
    assert "function feedSignature()" in render and "function buildFeed()" in render
    assert "let feedGroups" in render and "let feedMonths" in render
    assert 'document.dispatchEvent(new CustomEvent("bk-render"));' in render
    assert "drawMore" not in render and "drawLess" not in render   # 窗口机器搬走了
    # 明细层: 单向懒加载 — 步长/哨兵/观察器盯层内滚位/展开只追加不重画
    assert "const LG_CHUNK = 12;" in ledger and "function drawMore()" in ledger
    assert "drawLess" not in ledger and "feedStart" not in ledger
    assert "new IntersectionObserver" in ledger and 'rootMargin: "900px"' in ledger
    assert "root: target" in ledger     # root 钉在层滚动本体 (观察层内滚位, 不是页面)
    assert "insertAdjacentHTML" in ledger
    assert "bindEntryList(listEl);" in ledger    # 行机器 (entry-sheet) 铺层现绑
    # bk-render 跟着重铺: 层拆了懒判 isConnected, 数据刷新保滚位
    assert "liveLedger" in ledger and "!live.pane.isConnected" in ledger
    assert "target.scrollTop = y;" in ledger
    # 口径: chips [全部|年|月] + ‹ › 步进器 (只往过去存, 报表同规矩)
    assert 'data-mode="all"' in ledger and 'data-mode="year"' in ledger \
        and 'data-mode="month"' in ledger
    assert "loadLS(\"bk-ledger-v1\", null)" in ledger and "saveLS(\"bk-ledger-v1\"" in ledger
    assert "q(\".lg-next\").disabled = st.shift <= 0;" in ledger
    # 日组行模板 (两行统一: 类别 + 备注/标签灰字跟排 / 几点·谁记的)
    assert 'e.category.split("/").pop()' in ledger
    assert 'small || "未分类"' in ledger
    assert 'bits.push("#" + esc(t))' in ledger
    assert '` <span class="sub">${bits.join(" ")}</span>`' in ledger
    assert 'e.time ? e.time + " · " : ""' in ledger and "creatorName(e)" in ledger
    assert '<div class="l3">' not in ledger and ".l3" not in panes_css   # 三行退役
    # 日组头收·支恒两值都报 (挖财明细头, 零也报), 金额走 lgAmt (不带 ¥);
    # 全部/年档跨月处垫月汇总卡
    assert "收${lgAmt(dayIn)} 支${lgAmt(dayOut)}" in ledger
    assert 'class="lg-mon"' in ledger
    # 行样式随迁 panes.css (收进 .push-pane 下), 主页 page.css 不再有列表规则
    assert ".push-pane .day-group {" in panes_css
    assert ".push-pane .entries {" in panes_css and ".push-pane .entry .l1 {" in panes_css
    assert ".day-group {" not in page_css and ".entry .l1 {" not in page_css
    assert ".ci { color: var(--cc); }" in page_css   # 图标基脸是全局件, 留主页文件
    assert ".push-pane .lg-more { height: 44px; }" in panes_css  # 底部哨兵有高度
    # 滚动条全程不画 (my-music 同款): 能滚只是不显示
    assert "scrollbar-width: none;" in page_css \
        and "::-webkit-scrollbar { display: none; }" in page_css


def test_bookkeeping_calendar_home():
    """主页日历 (批次 3: 恒当前月 — ‹ › 翻月/左右划/顶部胶囊全退役, 想看别的
    月走月头进账单日历推入层); 点日 = 记一笔预填该日 (快捷记账主入口),
    日子个个能点 (没账的日子也能记); 今天橘胶囊压白字。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    assert 'id="cal-card"' in html and 'id="cal-grid"' in html
    assert 'id="cal-prev"' not in html and 'id="cal-next"' not in html   # ‹ › 退役
    # 月头整行是按钮 (点开账单日历推入层), 小箭头提示可点
    assert '<button type="button" class="cal-title" id="cal-title"' in html
    assert 'pushView("bill-cal")' in render and 'class="cal-caret"' in render
    # 恒当前月: 渲染只认 curMonth(), 翻月状态 (calMon/shiftCal) 退役
    assert "function renderCalendar(" in render and "function calAmt(" in render
    assert "curMonth()" in render and "calMon" not in render
    assert "shiftCal" not in render and "calGlide" not in render
    # 日子个个能点 (2.0 挖财交互: 点 = 记一笔预填该日), 不留死格子
    assert '<button type="button" class="${cls}" data-date="${date}">${inner}</button>' in render \
        and '${inner}</div>' not in render
    assert 'if (btn) openSheet(null, btn.dataset.date);' in render
    #    ↑ openSheet 借自 entry-sheet (全局)
    assert "万" in render and "todayStr()" in render      # 紧凑金额 + 今天标
    # 六行恒高: 天数不够的月份尾部补下月的日子 (灰字不可点), 补足 42 格
    assert "for (let d = 1; d <= 42 - first - days; d++)" in render
    assert '<div class="cal-day after"><span class="d">${d}</span></div>' in render
    assert ".cal-day.after { color: var(--ink-3); justify-content: flex-start; }" in page_css
    assert "grid-template-columns: repeat(7, 1fr);" in page_css
    assert "height: 12px; line-height: 12px;" in page_css   # 槽位行高双钉 (整列对得齐)
    assert ".cal-day.today .d { background: var(--accent); color: var(--accent-ink);" in page_css
    # 顶带规矩 (iOS 27 磨砂带): 全局上边界/独立模式 80 下限在; 胶囊卡线退役
    assert "--top-floor: 80px;" in page_css
    assert "--top-clear: max(calc(env(safe-area-inset-top, 0px) + 7px)," in page_css
    assert "padding: var(--top-clear) 14px 7px;" in page_css   # 同步条垫高走上边界
    assert "--cal-top:" not in page_css and "--cal-floor:" not in page_css
    assert "#cal-bar {" not in page_css and "#cal-bar." not in page_css   # 胶囊规则退役 (注记除外)
    # 快捷行: 明细/日历/周期账全走推入层 (scrollIntoView 过渡期锚点跳退役)
    assert 'pushView(cell.dataset.q === "ledger" ? "ledger"' in render
    assert "scrollIntoView" not in render


def test_bookkeeping_row_swipe_delete():
    """账目行左滑删除 (1.4.0; 批次 3 起机器绑在明细层的列表容器上 —
    bindEntryList, 铺层现绑层拆跟拆): 行身 (.sw-body) 垫在删除钮上滑开
    (一次只开一行; 竖滚意图还给页面, 横滑 preventDefault 钉住页面), 松手
    过半开没过半收; 点删除钮不直接删 — 先弹 iOS 式警示框 (写着这笔的类别
    与金额, 取消/点遮罩都收), 点「删除」才真删 (与记一笔里删同一套墓碑
    同步); 滑开的行点行身/滚列表/点到行外都自己收; 滑完的收尾点击当场
    吃掉 (不顺着误触点开行)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    js = (base / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
    ledger = (base / "bookkeeping-ledger.js").read_text(encoding="utf-8")
    panes_css = (base / "css" / "bookkeeping-panes.css").read_text(encoding="utf-8")
    # 行结构: 删除钮垫在行身身后右侧, 行身单独一层滑 (圆角裁住别露角);
    # 模板在 ledger, 样式在 panes (随瀑布流搬家)
    assert '<button type="button" class="sw-del">删除</button>' in ledger \
        and '<div class="sw-body">' in ledger
    assert ".push-pane .entry .sw-del {" in panes_css \
        and "width: 72px;" in panes_css.split(".push-pane .entry .sw-del {")[1].split("}")[0]
    assert "const SW_W = 72;" in js          # 钮宽 js/css 同一枚数
    assert "transition: transform .25s ease;" in panes_css   # 通用 .sw-body 基础
    assert "overflow: hidden;" in panes_css.split(".push-pane .entries {")[1].split("}")[0]
    assert ".push-pane .entry:not(.dragging) .sw-body:active::after" in panes_css
    #    ↑ 压暗是盖在行身上的 ::after 层 (通用基脸) — 行身底色不能换半透明
    # 机器 = bindEntryList (绑传进来的容器, 手势状态全局单份: 一次只开一行)
    assert "function bindEntryList(el) {" in js
    assert 'el.addEventListener("touchstart"' in js and 'el.addEventListener("click"' in js
    assert '$("#entry-list")' not in js      # 固定容器绑定退役 (主页没列表了)
    # 手势: 竖滚让给页面 (滑开的行顺手收), 横滑钉住页面; 松手过半开没过半收
    assert "Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)" in js
    assert "Math.abs(dx) > 12" in js         # 12 起才当滑 (点按的手指微晃不开门)
    assert '"touchmove"' in js and "{ passive: false }" in js and "e.preventDefault()" in js
    assert "sw.cur < -SW_W / 2" in js
    # 二次确认: 警示框节点 html 里都有, js 全接上 (选择器×html 交叉对账);
    # 框留在页面层 (z 85) — 压推入层 (65), 明细层里删照样够得着
    assert 'id="del-confirm"' in html and 'id="dc-msg"' in html \
        and 'id="dc-cancel"' in html and 'id="dc-ok"' in html and 'id="dc-mask"' in html
    assert "function askDelEntry(" in js and "function askDelRow(" in js \
        and "function closeDelConfirm()" in js
    assert '$("#dc-ok").addEventListener("click"' in js \
        and '$("#dc-mask").addEventListener("click"' in js
    # 删除路径全应用唯一 (1.10.0): 只剩确认框一处落墓碑
    assert js.count("prev.deleted = true;") == 1
    assert "askDelEntry(prev);" in js and \
        'if (!$("#sheet").hidden) closeSheet();' in js
    # 滑完的收尾点击吃掉
    assert "if (swClick) { swClick = false; return; }" in js
