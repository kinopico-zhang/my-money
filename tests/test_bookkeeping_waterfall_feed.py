"""记账主页瀑布流+日历测试: 所有月份一条往下滚的长列表 (双向懒加载/签名去抖),
顶部日历每天标收支、点日子跳位 (窗口挪过去, 往上滚还能接回), 左右划翻月。
拆自 test_bookkeeping_page_and_categories.py (200 行上限满了);
1.3.1 瀑布流与日历再各立门户, 末了胶囊里子 (收支配色/宽度自适应) 与左右划
翻月再拆 (单测语句数上限 60), 胶囊里子后来再立门户
test_bookkeeping_calendar_bubble.py、收拢状态机再立门户
test_bookkeeping_calendar_collapse.py (200 行又满了);
月份头横幅 1.3.1 撤了 (气泡一个人报月)。"""
from pathlib import Path


def test_bookkeeping_page_waterfall_feed():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    merge = (base / "bookkeeping-merge.js").read_text(encoding="utf-8")
    state = (base / "bookkeeping-state.js").read_text(encoding="utf-8")
    # 月份切换栏撤了 (看月份走日历); 汇总卡让位给日历也撤了
    assert 'id="mon-prev"' not in html and 'id="mon-label"' not in html
    assert 'id="sum-out"' not in html and 'id="sum-in"' not in html
    assert 'id="feed-more"' in html and 'id="feed-end"' in html and 'id="feed-top"' in html
    assert "还没有账目" in html and "这个月还没有账目" not in html
    assert 'id="person-row"' not in html       # 记账人筛选按钮撤了 (账全排一条流, 谁记的写在每笔上)
    assert "renderPersons" not in render and "person-row" not in page_css
    # 瀑布流: 懒加载 + 签名去抖 + 双向窗口 (跳走后往上滚接得回)
    assert "new IntersectionObserver" in render and 'rootMargin: "900px"' in render
    assert "function drawMore()" in render and "function drawLess()" in render
    assert "FEED_CHUNK" in render and "insertAdjacentHTML" in render   # 展开只追加不重画
    # 月份头横幅撤了: 月份和整月收支气泡一个人报, 列表不插横幅 (日子行自带
    # 月份); 胶泡认月改认日组 (视线线上最靠上那条, data-date 二分)
    assert "monthHeadHtml" not in render and "month-head" not in render
    assert ".month-head" not in page_css and "position: sticky" not in page_css
    assert 'querySelectorAll(".day-group")' in render \
        and "dataset.date.slice(0, 7)" in render
    assert "function feedSignature()" in render   # 数据没变: 列表不动 (滚动不跳)
    assert "feedStart" in render and "window.scrollBy(0, grew)" in render
    #    ↑ 窗口上沿: 往上补时视线钉在原来看的那行 (scrollHeight 差量补偿)
    assert "function jumpToDate(" in render and "findIndex(g => g[0] <= date)" in render
    #    ↑ 日历点日子: 没账的日子落到最近的有账日
    assert 'data-date="${date}"' in render     # 日组带日期, 跳位查得着
    assert 'visibleEntries(entries)' in render      # 全月份一条流, 不带月份/筛选参数
    assert "shiftMonth" not in render and "renderMonth" not in render
    assert "#feed-more { height: 44px; }" in page_css  # 底部哨兵有高度, 观察器才盯得住
    # 滚动条全程不画 (my-music 同款): 能滚只是不显示 — 页面/记一笔弹层/拨轮全盖住
    assert "scrollbar-width: none;" in page_css \
        and "::-webkit-scrollbar { display: none; }" in page_css
    assert "function visibleEntries(entries) {" in merge
    #    ↑ 只挑未删除: month/person 参数都撤了 (瀑布流全月份, 筛选按钮没了)
    assert "visibleEntries" in render and "function visibleEntries(entries," not in merge
    assert "bk-month" not in state   # 月份不再存 localStorage (没有"当前月"了)
    assert "bk-person" not in state  # 记账人筛选撤了, 偏好不再存 localStorage
    # 明细行两行统一 (每笔同高): 类别 + 备注/标签跟在类别后面 (灰字小一号,
    # 没写不占字) / 几点·谁记的 — 行高 height+line-height 双钉 (空 div 没行盒)
    assert 'e.category.split("/").pop()' in render
    assert 'small || "未分类"' in render
    assert 'bits.push("#" + esc(t))' in render
    assert '` <span class="sub">${bits.join(" ")}</span>`' in render
    assert 'e.time ? e.time + " · " : ""' in render and "creatorName(e)" in render
    assert '<div class="l3">' not in render and ".entry .l3" not in page_css  # 三行退役
    assert ".entry .l1 .sub { font-size: 11.5px;" in page_css
    assert ".entry .l2 { font-size: 10.5px; color: var(--ink-3); height: 13px;" in page_css


def test_bookkeeping_calendar_and_top_bubble():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 日历: 每天收支标格里 (上万缩成 1.2万), 标题带当月小计, 今天描一圈
    assert 'id="cal-card"' in html and 'id="cal-grid"' in html
    assert 'id="cal-prev"' in html and 'id="cal-next"' in html
    assert "function renderCalendar(" in render and "function calAmt(" in render
    assert "万" in render and "todayStr()" in render
    assert "function shiftCal(" in render
    # 日子个个能点: 没账的落到最近的有账日 (jumpToDate 兜底), 不留死格子
    assert '<button type="button" class="${cls}" data-date="${date}">${inner}</button>' in render \
        and '${inner}</div>' not in render
    assert "grid-template-columns: repeat(7, 1fr);" in page_css
    assert ".cal-day.today .d { background: var(--accent); color: var(--accent-ink);" in page_css \
        and "border-radius: 999px; padding: 0 5px; }" in page_css
    #    ↑ 今天 = 荧光黄绿胶囊压深橄榄字 (图里 Unpaid 选中章; 细线圈在浅灰蓝卡上立不住)
    # 日历升到落位线被按住: 收拢成顶上一枚磨砂胶囊 (my-music 播放气泡
    # 同款质感), 滚回来一路长回; 落位让开独立模式 iOS 26+ 的系统磨砂带
    # (不进模糊区)。收拢状态机 (缩放全程跟手/任意高度稳态/回滚弹回) 拆在
    # test_bookkeeping_calendar_collapse.py
    assert 'id="cal-bar"' in html
    assert 'id="cal-sent"' not in html          # 哨兵撤了: 观察器直接盯日历卡
    assert 'observe($("#cal-card"))' in render
    assert 'rootMargin: "-40px 0px 0px 0px"' in render   # 观察器只当开机一脚 (恢复滚位没有 scroll 事件)
    assert "calFloatOpen();" in render   # 点胶囊: 就地展开成悬浮日历面板 (列表不动, 不再滚回顶)
    assert "top: var(--cal-top);" in page_css   # 落位钉在顶带下限之下
    assert "--top-floor: 96px;" in page_css     # 独立模式系统磨砂带下限 (my-music 同款)
    assert "--cal-top: max(calc(env(safe-area-inset-top, 0px) + 10px)," in page_css \
        and "var(--cal-floor));" in page_css   # 落位 = 浏览器安全区+10 / 独立模式取深者
    assert "--top-floor: 96px; --cal-floor: 88px;" in page_css
    #    ↑ 气泡卡在模糊带底沿 (88, 实测最深糊到的线): 不躲 96 安全线, 顶边贴着
    #    带沿停 — 同步条那行字仍走 96 (字沾糊看不清)
    # 模糊带里不许常驻任何控件 (my-music --top-clear 同款全局上边界):
    # 不只气泡, 同步条的上沿也钉在带子下头
    assert "--top-clear: max(calc(env(safe-area-inset-top, 0px) + 7px)," in page_css
    assert "padding: var(--top-clear) 14px 7px;" in page_css   # 同步条垫高走上边界
    assert "border-radius: 999px;" in page_css  # my-music 播放气泡同款磨砂胶囊
    assert "-webkit-backdrop-filter: blur(20px) saturate(180%);" in page_css
    # 月份头没了, 让位那套 (cal-mini 类 + top 过渡) 跟着退役
    assert "cal-mini" not in render and "CAL_MINI" not in render \
        and ".cal-mini" not in page_css and "transition: top" not in page_css
    assert 'new IntersectionObserver(() => calSync(false),' in render   # 开机一脚不带弹簧 (不演收拢)
    assert "position: absolute; top: 0; left: 50%;" in page_css   # 分身钉在外壳顶上居中 (定格快照随外壳裁形)
    assert "#cal-bar.morph {" in page_css       # 运动期磨砂暂撤 (WebKit 重影对策)
    assert '<span class="cb-in">' in render     # 胶泡文字 (收拢后段从分身内容交叉淡入)
    assert "function calViewMon(" in render and "function calCapHtml(" in render \
        and 'mv.innerHTML = calCapHtml(mon);' in render
    #    ↑ 胶泡实时报列表当前月: 认视线线上最靠上的日组 (月份头横幅撤了),
    #    月份换了才重写一次 — 只换中间那层字 (‹ › 常驻不重搭, 见 bubble 测试)
    assert '<span class="e">${s && s.exp > 0 ? calAmt(s.exp) : ""}</span>' in render
    #    ↑ 金额槽位常驻 (没数也占行): 日期/支出/收入各排各的水平线, 整行对得齐
    assert "height: 12px; line-height: 12px;" in page_css


def test_bookkeeping_calendar_swipe_months():
    """日历左右划翻月 — 跟手拖拽: 月份内容贴指尖平移, 上月/下月候场页垫在两侧,
    松手弹簧定去留 (细钉在 test_bookkeeping_calendar_nav.py); ‹ › 离散点击仍是
    canned 滑入 (重放式); 误触吃掉。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 整层手势骨架 (记一笔弹层同款): 先定轴向定了不反悔, 竖着划让给页面滚动;
    # 划完的那一下点击捕获吃掉 (不误触日子格子/‹›钮)。阈值触发 (划过 30px 立刻
    # 翻页 + 播 canned) 退役 — 动画跟指尖无关, 就是"不跟手"的根
    assert "function calXApply(" in render and "function calXFlies(" in render
    assert "Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 4" in render
    assert "touchcancel" in render
    assert "setTimeout(() => { ate = false; }, 350)" in render   # 误触兜底自清
    assert "e.stopPropagation(); e.preventDefault();" in render  # 捕获期吃掉
    # ‹ › 与左右划共用 shiftCal: 换月顺着方向滑入 (下月从右进/上月从左进),
    # 重放式 class + reflow (1.3.0 类别格切换动画同款)
    assert 'const cls = delta > 0 ? "cal-in-r" : "cal-in-l";' in render
    assert 'void $("#cal-grid").offsetWidth;' in render
    assert "@keyframes cal-in-r { from { transform: translateX(26px); opacity: 0; } }" in page_css \
        and "@keyframes cal-in-l { from { transform: translateX(-26px); opacity: 0; } }" in page_css
    # 日历翻了明细联动挪到那个月 (气泡上的 ‹ › 也走这): base = 从哪个月翻起
    # (气泡翻传胶泡正报着的月 — 翻的是眼前那个月); 先挪明细再画日历,
    # 接管分支探测到的就是新月, 胶泡不闪旧月
    assert "const from = base || calMon;" in render and "jumpToMonth(calMon);" in render
    assert "function jumpToMonth(" in render and "new Date(y, m, 0).getDate()" in render
    # 六行恒高: 天数不够的月份尾部补下月的日子 (灰字不可点), 补足 42 格 —
    # 左右划切月时日历高度不跟着月初星期/月长短变来变去
    assert "for (let d = 1; d <= 42 - first - days; d++)" in render
    assert '<div class="cal-day after"><span class="d">${d}</span></div>' in render
    assert ".cal-day.after { color: var(--ink-3); justify-content: flex-start; }" in page_css


def test_bookkeeping_row_swipe_delete():
    """主页账目行左滑删除 (1.4.0): 行身 (.sw-body) 垫在删除钮上滑开 (一次只开
    一行; 竖滚意图还给页面, 横滑 preventDefault 钉住页面), 松手过半开没过半收;
    点删除钮不直接删 — 先弹 iOS 式警示框 (写着这笔的类别与金额, 取消/点遮罩
    都收), 点「删除」才真删 (与记一笔里删同一套墓碑同步); 滑开的行点行身/
    滚列表/点到行外都自己收; 滑完的收尾点击当场吃掉 (不顺着误触点开行)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    js = (base / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    # 行结构: 删除钮垫在行身身后右侧, 行身单独一层滑 (圆角裁住别露角)
    assert '<button type="button" class="sw-del">删除</button>' in render \
        and '<div class="sw-body">' in render
    assert ".sw-del {" in page_css \
        and "width: 72px;" in page_css.split(".sw-del {")[1].split("}")[0]
    assert "const SW_W = 72;" in js          # 钮宽 js/css 同一枚数
    assert ".sw-body {" in page_css and "transition: transform .25s ease;" in page_css
    assert "overflow: hidden;" in page_css.split(".entries {")[1].split("}")[0]
    assert ".entry:active" not in page_css   # 按下压暗搬到行身上 (拖动中不糊脸)
    assert ".entry:not(.dragging) .sw-body:active::after" in page_css
    #    ↑ 压暗是盖在行身上的 ::after 层 — 行身底色不能换半透明的 (--press 是透的,
    #    一换就漏出身后的删除钮, 点一下删除就显形了)
    assert ".sw-body::after {" in page_css and "opacity: 0; pointer-events: none;" in page_css
    # 手势: 竖滚让给页面 (滑开的行顺手收), 横滑钉住页面; 松手过半开没过半收
    assert "Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)" in js
    assert "Math.abs(dx) > 12" in js         # 12 起才当滑 (点按的手指微晃不开门)
    assert '"touchmove"' in js and "{ passive: false }" in js and "e.preventDefault()" in js
    assert "sw.cur < -SW_W / 2" in js
    # 二次确认: 警示框节点 html 里都有, js 全接上 (选择器×html 交叉对账)
    assert 'id="del-confirm"' in html and 'id="dc-msg"' in html \
        and 'id="dc-cancel"' in html and 'id="dc-ok"' in html and 'id="dc-mask"' in html
    assert "function askDelRow(" in js and "function closeDelConfirm()" in js
    assert '$("#dc-ok").addEventListener("click"' in js \
        and '$("#dc-mask").addEventListener("click"' in js
    # 确认删除与记一笔里删同一套墓碑 (js 里恰两处), 滑完的收尾点击吃掉
    assert js.count("prev.deleted = true;") == 2
    assert "if (swClick) { swClick = false; return; }" in js
