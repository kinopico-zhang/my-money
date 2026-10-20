"""明细推入层 + 账单日历 (2.0 挖财批次 3) 的钉子: 账目瀑布流从主页整体搬进
推入层 (数据半边还在 render.js — feedGroups/feedMonths 全局共享, render()
每趟发 bk-render, 开着的层跟着重铺); 懒加载窗口从双向收成单向 (从最新日组
起头只往下展开 — 主页那套上补窗口/跳位滑屏随胶囊退役)。挖财账单明细版式:
分段 chips [全部|年|月] + ‹ › 步进器 + 三统计块 + 跨月月汇总卡 + 日组头
(收·支) + 层自带底栏 [日历|记一笔] (主 tab 栏 own-bar 让位 — 钉在 subpages)。
账单日历 (bill-cal): ‹ › 翻月 + 42 格恒高大日历 (金额给足位数) + 总结余/
日均结余; 从明细进的 (data-from=ledger) 不吃主栏垫底。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_ledger_chips_and_stepper():
    """口径 chips + 段步进器: [全部|年|月] 就地切统计口径 (all = 整本账不筛,
    year/month 配 ‹ › 步进 — 步数只往过去存, › 到当前段为止), 口径与步数
    存 localStorage (重进层口径还在, 脏档兜底); 换口径/翻段都回顶重铺 —
    滚位只在数据刷新 (bk-render) 那条路上保。"""
    js = _static("bookkeeping-ledger.js")
    assert "function renderLedgerView(target)" in js
    for pin in ('data-mode="all">全部', 'data-mode="year">年',
                'data-mode="month">月'):
        assert pin in js, f"chips 缺 {pin}"
    assert 'let st = { mode: "all", shift: 0 };' in js
    assert '"bk-ledger-v1"' in js
    # 脏档兜底: 模式只认 year/month, 步数非负 — 坏档落回全部档不炸层
    assert 'if (saved.mode === "year" || saved.mode === "month") st.mode = saved.mode;' in js
    assert "st.shift = Math.max(0, Number(saved.shift) || 0);" in js
    assert "const save = () => saveLS(\"bk-ledger-v1\", st);" in js
    assert "st.mode = btn.dataset.mode;" in js and "st.shift = 0;" in js  # 换口径从头数
    assert "const next = st.shift + (nav.classList.contains(\"lg-prev\") ? 1 : -1);" in js
    assert "if (next < 0) return;" in js          # › 到当前段为止 (报表同规矩)
    assert 'q(".lg-next").disabled = st.shift <= 0;' in js
    assert js.count("target.scrollTop = 0;") == 2     # 换口径 + 翻段都回顶
    # 口径 → 日期区间: 年档整年 / 月档整月 (含两端, all 不筛)
    assert "const base = new Date(now.getFullYear(), now.getMonth() - st.shift, 1);" in js
    assert "return [`${y}-01-01`, `${y}-12-31`];" in js
    assert "const d = new Date(y, m - 1 + delta, 1);" in js   # monthAdd: 月步进
    assert '`${d.getFullYear()}/${d.getMonth() + 1}`' in js   # 月档简写 (报表同款)


def test_ledger_stats_and_windowing():
    """三统计块 (结余/支出(N)/收入(M) — 挖财实测口径: 笔数带在标签里各数各的,
    支出(1819) 收入(86) 不合笔) + 跨月月汇总卡 (标题 10月+2026, 右侧收/结余/
    支三值) + 日组头收·支恒两值 (零也报); 金额走 lgAmt — 不带 ¥ 尾数两位,
    上百万缩 x.xx万 (挖财的分界: 结余 462855.46 全显 / 支出 184.16万)。
    懒加载单向窗口: 从最新日组起头, LG_CHUNK 一段往下展开, 哨兵 root 钉在
    层的滚动本体上, 首屏没填满接着喂; 切口径/数据刷新整列表重铺 (drawn
    归零)。行机器是 entry-sheet 的 bindEntryList (手势钉在它家)。"""
    js = _static("bookkeeping-ledger.js")
    assert "const LG_CHUNK = 12;" in js
    assert "function lgAmt(n)" in js \
        and "if (Math.abs(n) >= 1e6)" in js and "return n.toFixed(2);" in js
    assert "fmtMoney(dayIn)" not in js and "fmtMoney(t.expense)" not in js \
        and "fmtMoney(Math.abs(bal))" not in js   # 明细/日历不走 ¥ 口径
    assert "groups = st.mode === \"all\" ? feedGroups" in js \
        and ": feedGroups.filter(g => g[0] >= from && g[0] <= to);" in js
    assert "bindEntryList(listEl);" in js
    # 三统计块: 结余带正负色; 笔数分家计数 (支出只数支出, 收入只数收入)
    assert "<i>结余</i>" in js and "<i>支出(${nExp})</i>" in js \
        and "<i>收入(${nInc})</i>" in js
    assert 'if (e.kind === "income") { inc += e.amount; nInc++; }' in js
    assert 'const bal = inc - exp;' in js and 'bal < 0 ? "e" : "i"' in js
    # 月汇总卡: 跨月处垫 (月档整层一个月不垫), feedMonths 出数缺月兜零
    assert "if (st.mode !== \"month\") {" in js
    assert "const t = feedMonths.get(mon) || { expense: 0, income: 0 };" in js
    assert '<b>${+mon.slice(5, 7)}月</b><span class="yr">${+mon.slice(0, 4)}</span>' in js
    assert "收 ${lgAmt(t.income)}" in js and "支 ${lgAmt(t.expense)}" in js
    css = _static("css/bookkeeping-panes.css")
    assert ".push-pane .lg-mon .sums { margin-left: auto; display: flex; gap: 12px; }" in css
    assert ".push-pane .lg-st em {" not in css        # 笔数行退役 (计数进标签)
    assert "${+m}/${+d} 周${wd}" in js     # 日组头 10/17 周六 (挖财简写, 非月日)
    assert "收${lgAmt(dayIn)} 支${lgAmt(dayOut)}" in js
    # 单向窗口: 顶上不来 (上补机器退役 — 主页侧的退役钉在 waterfall_feed)
    assert "if (drawn >= groups.length) return;" in js
    assert "const end = Math.min(drawn + LG_CHUNK, groups.length);" in js
    assert 'listEl.insertAdjacentHTML("beforeend", html.join(""));' in js
    assert "target.getBoundingClientRect().bottom + 120" in js  # 首屏没填满接着喂
    assert "{ root: target, rootMargin: \"900px\" }" in js      # 哨兵盯层内滚位
    assert "drawn = 0;" in js and 'listEl.innerHTML = "";' in js  # 重铺归零
    assert 'q(".lg-empty").hidden = groups.length > 0;' in js
    assert "到底了 · 最早记到" in js                # 到底报最早的月份
    # 行模板: 左滑删除钮 + 行身 + 类别点 + 两行字 (类别/备注·标签 · 时间·记的人)
    assert '<button type="button" class="sw-del">删除</button>' in js
    assert 'class="amt${e.kind === "income" ? " in" : ""}"' in js \
        and '"+" : "-"}${Number(e.amount).toFixed(2)}' in js
    assert "${e.time ? e.time + \" · \" : \"\"}${esc(creatorName(e))}" in js


def test_ledger_live_refresh_and_own_bar():
    """bk-render 活刷新: render() 每趟发事件, 开着的层跟着重铺 (明细保滚位),
    层拆了 (isConnected 断) 自己清登记; 层自带底栏 [日历|记一笔] — 日历钮推
    bill-cal 挂 data-from=ledger (不吃主栏垫底), 记一笔钮开记一笔层。"""
    js = _static("bookkeeping-ledger.js")
    assert 'document.addEventListener("bk-render"' in js
    assert "for (const live of [liveLedger, liveBillCal])" in js
    assert "if (!live.pane.isConnected) { live.cleanup(); continue; }" in js
    assert "const y = target.scrollTop;" in js and "target.scrollTop = y;" in js
    assert "liveLedger = {" in js and "cleanup: () => { liveLedger = null; }" in js
    # 底栏: [日历|记一笔] (几何贴 #tab-bar 让 own-bar 接手导航语义)
    assert 'data-act="cal">' in js and 'data-act="add">' in js
    assert 'if (btn.dataset.act === "cal") {' in js
    assert 'const bcPane = pushView("bill-cal");' in js \
        and "bcPane.dataset.from = \"ledger\";" in js
    assert "openSheet(null);" in js                    # 记一笔钮 = 主页同一入口
    css = _static("css/bookkeeping-panes.css")
    lg_bar = css.split(".push-pane .lg-bar {")[1].split("}")[0]
    assert "position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;" in lg_bar
    assert "padding: 5px 8px calc(env(safe-area-inset-bottom) + 5px);" in lg_bar
    assert ".push-pane .lg-bar button.add { color: var(--accent); }" in css
    # 从明细进的账单日历: 主栏正让位给明细底栏, 再垫 --tab-h 就空一截
    assert '.push-pane[data-view="bill-cal"][data-from="ledger"] .pane-scroll {' in css
    assert "padding-bottom: calc(env(safe-area-inset-bottom) + 24px);" in css
    # 归口与让位 (push.js 侧): 明细/账单日历归首页 tab 的层级层 (右划/Esc
    # 收), renderView 分发到 ledger.js 的两个渲染函数; 栈里压着明细, 主
    # tab 栏整栏让位 (z69 压着层 65, 不藏会两副底栏叠着)
    push = _static("bookkeeping-push.js")
    assert 'ledger: "home", "bill-cal": "home"' in push \
        and 'view === "ledger") renderLedgerView(target)' in push \
        and 'view === "bill-cal") renderBillCalView(target)' in push
    assert 'bar.classList.toggle("own-bar", pushStack.some(it => it.view === "ledger"));' in push
    assert "#tab-bar.own-bar { display: none; }" in _static("css/bookkeeping-page.css")


def test_bill_calendar_view():
    """账单日历 (bill-cal, 首页月头点开的独立日历页): ‹ › 翻月 (开页回本月,
    不存本地 — 主页日历恒当前月, 翻月归这页), 大日历 42 格恒高 (头补空白/
    尾补下月灰字 — 翻月时格子数不变层不跳), 金额给足位数不缩写 (挖财大格
    装得下, 主页格子的千/万缩写不进来); 点日 = 记一笔预填该日; 底部总结余/
    日均结余 (本月按已过天数摊, 往月按整月摊); 翻月网格顺着方向滑入。"""
    js = _static("bookkeeping-ledger.js")
    assert "function renderBillCalView(target)" in js
    assert "let mon = curMonth();" in js
    assert "const delta = nav.classList.contains(\"bc-prev\") ? -1 : 1;" in js
    assert "mon = monthAdd(mon, delta);" in js and "refresh(delta);" in js
    assert '`${y}年${m}月`' in js                     # 月头标题
    # 42 格恒高: 头部空白 + 尾部下月灰字
    assert '<div class="bc-day blank"></div>' in js
    assert "for (let d = 1; d <= 42 - first - days; d++)" in js
    assert '<div class="bc-day after"><span class="d">${d}</span></div>' in js
    # 今日胶囊 + 金额: 支出裸数字 / 收入带 +, 全位数 (toFixed(2))
    assert "const today = todayStr();" in js
    assert '${date === today ? " today" : ""}' in js
    assert "${s && s.exp > 0 ? s.exp.toFixed(2) : \"\"}" in js
    assert '"+" + s.inc.toFixed(2)' in js
    assert "calAmt" not in js                         # 千/万缩写是主页小格的规矩
    # 点日 = 记一笔预填该日 (与主页日历同一入口)
    assert "openSheet(null, btn.dataset.date);" in js
    # 底部: 总结余 / 日均结余 (本月按已过天数摊 — 没过完整摊会压虚低)
    assert "<i>总结余</i>" in js and "<i>日均结余</i>" in js
    assert "const elapsed = mon === curMonth() ? new Date().getDate()" in js
    assert "const avg = bal / elapsed;" in js
    # 翻月动画: 重放式 class + reflow (连点几下每趟都演), 复用报表日历的 keyframes
    assert 'grid.classList.remove("cal-l", "cal-r");' in js
    assert "void grid.offsetWidth;" in js
    assert 'grid.classList.add(dir > 0 ? "cal-r" : "cal-l");' in js
    assert "liveBillCal = {" in js and "refresh: () => refresh(0)," in js
    css = _static("css/bookkeeping-panes.css")
    grid = css.split(".push-pane .bc-grid {")[1].split("}")[0]
    assert "grid-template-columns: repeat(7, 1fr);" in grid and "gap: 2px;" in grid
    assert ".push-pane .bc-day.today .d {" in css     # 今天 = 橘胶囊压白字
    assert ".push-pane .bc-grid.cal-l { animation: cal-in-l .26s ease; }" in css
