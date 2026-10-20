"""统计视图测试 (renderStatsView): 读本地账本 (与记账页同一份 localStorage)
聚合出报表; 1.15.0 条形榜改版 + 横滑分页把 subpages 顶满 200 行, 分家到这;
圆环图专钉再分家 test_bookkeeping_stats_ring.py (第五家)。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_stats_view_aggregates_local_ledger():
    """统计视图 (renderStatsView): 墓碑不算、金额条按榜首归一; 1.14.0 大改 —
    时间范围 + 筛选 (类别/标签多维多选, 维度内 OR 维度间 AND)、
    大类/小类两档; 1.15.0 版面 = 圆环图 (专钉分家 stats_ring, 第五家) +
    条形榜 (条子吃圆环同色, 小类页平铺) + 时间范围弹层 (五枚定步数, ‹范围›
    步进器合一, 草稿制, 确定 才生效; 日历跟手划月) + 筛选两页 (类别/标签
    横滑切换, 标签字典倒序, 成员退役) + 柱行下钻两层 (明细行可编辑, 主页
    同一副浮层) + 日期 2026/10 简写 + 类别树筛选; 范围与档位记 localStorage,
    筛选即兴不落盘。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert "function renderStatsView(target)" in js
    assert '"bk-entries"' in js and "e.deleted" in js
    assert 'split("/")[0]' in js and "catIcon(" in js and "curMonth()" in js
    assert "createdByName" in js          # 明细行报记账人: 本地刚记的没名字标「我」
    for pin in ("m-btn", "m-title", "rg-seg", "rs-nav", "rs-title",
                "flt-seg", "flt-pager", "stats-tools", "flt-btn", "flt-n", "shot-btn", "out-donut",
                "in-donut", "by-cat", "by-cat-in", "income-card", "flt-sheet", "cal-sheet",
                "rc-grid", "rc-track", "rc-ok", "dr-rows"):
        assert f'id="{pin}' in js, f"统计视图缺 {pin}"   # 前缀匹配: 版面 id 走 ${sfx} 插值 (两页各一套)
    assert '"bk-stats-v1"' in js and "saveLS" in js     # 范围/档位落盘
    assert "pane-gap" not in js and ".pane-gap" not in css   # 1.15.0 让位档退役
    assert "matchFilters" in js and "data-dim" not in js   # 成员/标签芯片退役 (复选行当家)
    assert ".bar {" in css and "tabular-nums" in css
    # 1.15.0 条形榜改版: 色跟实体走 — 条子吃圆环同色 (前 7 名槽色, 榜外灰
    # 「其他」); 行内三行两列: 上 类别…金额 / 中 整条 / 下 笔数…占比
    assert 'style="width:${w.toFixed(1)}%;background:${color};animation-delay:' in js
    assert "i < 7 ? STATS_RING_COLORS[i] : STATS_OTHER_COLOR" in js
    assert 'class="cat-bot"' in js and '<span class="ring"' not in js
    assert ".ring" not in css and ".bar-line" not in css and ".cat-name" not in css
    assert "background: var(--red); transition" not in css and "#by-cat-in .bar i" not in css
    # 1.15.0 小类页去大类分组 (用户点名「没有层级关系」): 组头/缩进退役,
    # 与大类页同一张平榜 — 只是 keyFn 取全路径
    assert "grp-blk" not in js and "grp-h" not in js and "grp-nm" not in js
    assert ".grp-h" not in css and ".grp-sub" not in css and ".cat-row.sub" not in css
    # 1.15.0 圆环图专钉 (调色板/分段画法/折线引标几何/画框放大) 分家在
    # test_bookkeeping_stats_ring.py (200 行分家, 第五家)
    # 1.15.0 大类/小类切换收进卡题下拉 (10-15 用户点名, 横滑分页退役) — 菜单
    # 交互/版面单页化的钉分家在 test_bookkeeping_stats_gran_menu.py (200 行
    # 分家, 第四家); 此处只钉版面身的列布局骨架
    assert "[data-view=\"stats\"] .pane-scroll {" in css \
        and "flex-direction: column; overflow: hidden;" in css \
        and "overflow-y: auto;" in css   # 版面身单滚 (层身不滚, 工具行钉住)
    # 10-19 用户点名「报表的标题放在最上面, 但是不要进入浏览器的模糊区
    # 域」: 大标题钉在层壳最上 (版面身才滚), 顶衬清零 — 文字直接落在
    # --content-top 那条线上 (浏览器 = 安全区+36 / 独立模式 = 80 带底沿,
    # 同日标定尺实测后从 96 收上来), 怎么换形态也不越带
    assert '<div class="pane-title">报表</div>' in js \
        and '.push-pane[data-view="stats"] .pane-title { padding-top: 0; }' in css
    # 10-19 iOS 27 顶栏模糊带, 九轮消解战收官认带: 系统合成层页面够不着
    # (实画黑条/clip:text 无痕条/JS 开合模拟/meta/manifest 全屏/滚动抖动
    # 全败; MacRumors 2489325 实锤 = 正式版回归 bug, status bar meta
    # beta 2 起被无视, 等 OS 补丁)。正解 = 内容钉在 --content-top 带外
    # (上面那条断言); 罩层/侧板/静态靶机械全拆, 只留防回魂断言
    html = _static("bookkeeping.html")
    page = _static("css/bookkeeping-page.css")
    boot = _static("bookkeeping-boot.js")
    assert "glass-anchor" not in html and "glass-anchor" not in page   # 静态靶退役
    assert "blur-cover" not in page and "blur-panel" not in page \
        and "blur-cover" not in boot and "blur-panel" not in boot      # JS 机械已拆
    assert ".push-pane .bk-sheet {" in css and ".push-pane .rc-grid {" in css
    # 1.15.0 范围控件定案 (10-09 收口, 10-10 五收): 五枚定步数, ‹范围› 步进器合一
    # (‹› 按档平移, 全部收起, 自定义兼职翻月); 日历左右划翻月+下头报年月; 草稿制
    assert "最早一笔 ~ 最后一笔" in js \
        and 'if (st.mode === "custom" && !st.custom) st.mode = "month";' in js
    for m, lb in (("all", "全部"), ("year", "年"), ("quarter", "季"), ("month", "月"), ("week", "周")):
        assert f'data-mode="{m}">{lb}' in js
    assert "function openRange()" in js and "let dr = null;" in js and "syncRangeUI()" in js \
        and "dr.mode = b.dataset.mode;" in js and "[cal.a, cal.b] = r;" in js \
        and "function calJump(" in js and 'grid.classList.add(later ? "cal-r" : "cal-l");' in js \
        and "st.mode = dr.mode;" in js and "hideSheet(calSheet)" in js
    assert "rc-hint" not in js and "选开始日期" not in js and "选结束日期" not in js   # 提示行退役 (10-11)
    assert "就是自定义区间" not in js and "`${dSlash(r[0])} - ${dSlash(r[1])}`" in js
    assert "i < 42; i++" in js and "Math.abs(dx) < 10" in js and "calSwallow" in js \
        and '<div class="rc-month-bg" aria-hidden="true">${y}/${pad(m)}</div>' in js   # 恒6行+跟手划月+水印
    assert ".push-pane .rc-month-bg {" in css and "gap: 2px; touch-action: pan-y; }" in css
    assert "STATS_SHIFTABLE" in js and "dr.shift += 1;" in js and "rangeFollow(" in js   # 档步合一
    assert "rc-title" not in js and "rc-prev" not in js and "rc-next" not in js \
        and "rc-range" not in js   # 月导航/独立范围行退役 — 步进器就是范围显示
    assert 'data-mode="custom">' not in js and "m-prev" not in js and "shiftRange" not in js \
        and "y365" not in js and "STATS_WIN" not in js and 'id="range-chips"' not in js \
        and ".range-chips" not in css and "renderWho" not in js and "sel.who" not in js \
        and "by-who" not in js   # 自定义档/旧箭头/滚动窗/记账人统计与筛选全退役
    assert "gran-seg" not in js and "syncGran" not in js \
        and ".gran-seg" not in css   # 10-10 药丸开关试了一天又撤; 10-15 横滑也退役
                                  # (切换收进卡题下拉) — 药丸开关别回魂
    assert ".push-pane .bk-sheet .rg-seg button { flex: 1; padding: 6px 0; }" in css \
        and "@keyframes cal-in-l" in css and "@keyframes cal-in-r" in css \
        and ".rg-more" not in css and ".rc-range" not in css and ".who-row" not in css \
        and ".push-pane .rs-nav" in css and ".push-pane .rs-nav .m-title" in css \
        and ".push-pane .bk-sheet .flt-seg button { flex: 1; padding: 6px 0; }" in css
    # 1.15.0 金额给足位数 (用户点名「不要xx万」): 与记账页同一副 toFixed(2);
    # 环心合计长了自动降字号 (.sm/.xs)
    assert "const fmt = n => n.toFixed(2);" in js and "n >= 10000" not in js
    assert ".push-pane .dn-total.sm { font-size: 13px; }" in css \
        and ".push-pane .dn-total.xs { font-size: 10.5px; }" in css
    # 1.15.0 柱行下钻两层 (用户点名「大类的柱状图点进去可以看小类明细, 继续
    # 点击可以看到具体明细, 小类柱状图点击可以看具体明细」): 大类柱行 →
    # 小类明细层 (cat-subs, 同一副条形行), 小类行 → 具体明细层 (cat-entries,
    # 与主页账目同一副 .entry 行样式 — 2026-10-09 起点行可编辑: 行带 data-id,
    # 点开主页同一副记账浮层 openSheet); 口径与报表同源 (currentRows — 筛选/
    # 范围一并继承); 没有小类的大类直达明细。层级深处的大标题当路牌
    # (push.js 两枚视图名入册 TAB_OF, 高亮归报表)
    assert "function currentRows()" in js and 'data-k="${esc(key)}"' in js \
        and 'data-id="${esc(e.id)}"' in js and "openSheet(e)" in js \
        and "function refreshAfterEdit()" in js and "MutationObserver" in js
    assert "function openCatSubs(" in js and "function openCatEntries(" in js
    assert 'pushView("cat-subs")' in js and 'pushView("cat-entries")' in js
    assert "renderCatSubsView = pane =>" in js and "renderCatEntriesView = pane =>" in js
    assert "没有小类: 直达具体明细" in js
    assert '<div class="pane-title">${esc(req.cat' in js and 'class="dr-sum"' in js
    assert ".push-pane .dr-sum" in css and "cursor: pointer" in css   # 柱行可点
    push = _static("bookkeeping-push.js")
    assert '"cat-subs": "stats"' in push and '"cat-entries": "stats"' in push
    assert 'view === "cat-subs") renderCatSubsView(target)' in push \
        and 'view === "cat-entries") renderCatEntriesView(target)' in push
    # 1.15.0 修 (用户报「筛选的确定和取消被底栏挡住」): 层 (z65) 恒在栏 (z69)
    # 底下 — 弹框开着把整栈抬到 75, 栈里没别的框开着才放回去
    assert 'classList.add("over")' in js and 'classList.remove("over")' in js
    assert "#push-stack.over { z-index: 75; }" in css


def test_stats_view_1_15_0_wave2_toolbar_and_tree():
    """1.15.0 第二波起 (stats.js v15, 语句上限满了按家规分家): 日期 2026/10 简写 + 工具行定版
    (标题靠左/漏斗钉右沿/svg 箭头居中) + 筛选类别改一棵树 (复选框 + 小类折叠 + 全选/重置/取消/确定);
    第三波 = 季/周加回一级档; 第四波 = 换档动画 (圆环扫开/条子错峰长出/引标淡入) + 圆环放大成双层。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    # 日期简写: 标题恒报起止 (2026-10-10 用户点名), 年头带在起端 (尾端同年省年), 跨年两头全
    assert "return `${ay}/${am}/${ad}`;" in js and "const dSlash = s =>" in js \
        and "return `${ay}/${am}/${ad} ~ ${bm}/${bd}`;" in js \
        and 'if (mode === "all" && !all.length) return "全部";' in js \
        and "return spanTitle(range[0], range[1]);" in js and "年${+range[0].slice(5, 7)}月" not in js
    # 工具行 2026-10-10 定版: 标题靠左恒报起止; 右上角分享存图 + 漏斗两枚圆钮
    assert 'class="flt-btn" id="flt-btn" aria-label="筛选"' in js \
        and "</svg>筛选" not in js and "stats-head" not in js \
        and ".stats-head" not in css and ".push-pane .stats-tools .flt-btn { flex: none; }" in css
    assert ".push-pane .stats-tools .month-nav { flex: 1; justify-content: flex-start; }" in css \
        and 'id="m-btn"' in js and ".push-pane .month-nav .m-btn {" in css
    assert "M14.5 5.5L8 12l6.5 6.5" in js and "M9.5 5.5l6.5 6.5-6.5 6.5" in js \
        and ">‹</button>" not in js and ">›</button>" not in js
    # 筛选两页 (10-10 用户点名): 类别一页一棵树 (小类默认折叠, 大类勾 = 整类,
    # 小类勾 = 只它), 标签字典倒序; 全选只管眼前这页; 底部四枚照旧
    # (级联三态 2026-10-15 分家到 test_bookkeeping_stats_filter.py)
    assert 'id="flt-tree"' in js and "flt-cats-out" not in js and "flt-cats-in" not in js
    assert 'data-p="cat" class="on">类别' in js and 'data-p="tag">标签' in js \
        and 'id="flt-pager"' in js and '[...tagM.keys()].sort().reverse()' in js \
        and 'if (fltPage === "tag")' in js   # 两页 + 标签字典倒序 + 全选只管眼前页
    assert "const fltOpen = new Set();" in js and "function catTreeOf()" in js
    assert 'class="ft-chk${' in js and 'class="ft-exp${' in js \
        and 'class="ft-row${sub ? " sub" : ""}"' in js
    assert "const catHit = (e, k) =>" in js and 'k.includes("/", bar)' in js
    assert 'id="flt-all">全选' in js and 'id="flt-cancel">取消' in js \
        and 'id="flt-ok">确定' in js and 'id="flt-ok">完成' not in js \
        and ".push-pane .bk-sheet .bs-foot button { flex: 1; padding: 8px 0;" in css
    assert ".push-pane .ft-chk {" in css and ".push-pane .ft-row.sub {" in css \
        and ".push-pane .ft-exp.open svg" in css
    # 第三波: 季/周档锚 (自然季首月 / 退到本周一); 药丸开关 10-10 试了一天又撤, 横滑 10-15 也退役 (收进卡题下拉)
    assert "Math.floor(now.getMonth() / 3) * 3" in js and "(w.getDay() + 6) % 7" in js
    assert "cap(" not in js and "w.getDate() + 6" in js   # 各档亮足自然段 (今天帽退役 — 标题恒报起止, 截今天就残)
    assert "movePill" not in js and "seg-pill" not in js \
        and "dr.gran" not in js
    # 第四波 (2026-10-09 三点名): ① 「切换时间要有动画」— 弧扫开/条子错峰
    # 长出/引标晚一拍淡入 (重建自动重放); ② 「半径太小」「要有层次感」—
    # 双层放大: 外带原色内带深一档, 画框 218 (BOT 208); 段间满占微叠不留缝
    assert 'class="dn-arc"' in js and "animation-delay:${dly}ms" in js \
        and "const dly = Math.min((idx || 0) * 45, 360);" in js \
        and "const dk = (hex, f) =>" in js and 'stroke="${dk(s.c, 0.7)}"' in js \
        and "const CX = 170, RO = 65, RI = 54;" in js \
        and "cy + 80 * col[i].dy" in js and 'stroke-width="9"' in js \
        and "s.w = pct + 0.3;" in js   # 段间无隙: 满占+微叠压住发丝缝
    assert "@keyframes dn-arc-in { from { stroke-dasharray: 0 100; } }" in css \
        and "@keyframes bar-in { from { width: 0; } }" in css \
        and "@keyframes dn-fade-in { from { opacity: 0; } }" in css   # 换档动画归环/条
