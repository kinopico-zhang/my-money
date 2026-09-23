"""记账主页瀑布流+日历测试: 所有月份一条往下滚的长列表 (双向懒加载/签名去抖),
顶部日历每天标收支、点日子跳位 (窗口挪过去, 往上滚还能接回), 左右划翻月。
拆自 test_bookkeeping_page_and_categories.py (200 行上限满了);
1.3.1 瀑布流与日历再各立门户, 末了胶囊里子 (收支配色/宽度自适应) 与左右划
翻月再拆 (单测语句数上限 60); 月份头横幅 1.3.1 撤了 (气泡一个人报月)。"""
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
    assert ".cal-day.today { box-shadow: inset 0 0 0 1px var(--blue); }" in page_css
    # 日历升到落位线被按住: 跟手收拢成顶上一枚磨砂胶囊 (my-music 播放气泡
    # 同款质感), 滚回来一路长回; 落位让开独立模式 iOS 26+ 的系统磨砂带
    # (不进模糊区)
    assert 'id="cal-bar"' in html
    assert 'id="cal-sent"' not in html          # 哨兵撤了: 观察器直接盯日历卡
    assert 'observe($("#cal-card"))' in render
    assert 'rootMargin: "-40px 0px 0px 0px"' in render   # 观察器只当开机一脚 (恢复滚位没有 scroll 事件)
    assert 'window.scrollTo({ top: 0, behavior: "smooth" })' in render
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
    # 跟手收拢: 日历卡顶一碰到落位线, 分身接管 —— 上边界钉死、下边界跟着滚动
    # 逐帧收 (rAF 直写行内几何, 不挂过渡, 收拢速度 = 手速), 后段窗口收窄长圆、
    # 分身内容交叉淡成胶泡文字。流畅治在三处 (帧率就丢在逐帧重排/换肤):
    # 分身是定格快照 (接管那刻宽高钉死, 外壳一路只当裁形窗口 —— 日历网格
    # 全程零重排), 底色/影子接管那刻一次写死 (途中不逐帧换肤), 热路径 DOM
    # 引用接管那刻缓存。停手不冻半路 (动画要么不播, 播就播完): 手静
    # ~180ms 页面自己把没走完的走完 —— 收场走真滚动 (往哪边滚朝哪边收场),
    # 分身始终从实时几何取形, 不另演一套 (先前停手后分身自演一遍、演完
    # 又被真身几何拽回半路, 来回抽搐就抽在这)
    assert "function calSync(" in render and "function calRetwin(" in render
    assert "function calDraw(" in render and "function calSettle(" in render
    assert "function calRelease(" in render and "function calClear(" in render
    assert "calHeld" in render
    assert 'const CAL_H = 36;' in render and 'const CAL_W_PINCH = 0.45;' in render
    assert 'const CAL_FADE = 0.8;' in render   # 换字淡完线: 分身淡到头, 后段只剩外壳裁形
    assert 'const CAL_IDLE = 180;' in render
    assert "calSmooth" in render and "t * t * (3 - 2 * t)" in render
    assert 'addEventListener("scroll"' in render and "requestAnimationFrame" in render
    assert "calTweenTo" not in render and "cancelAnimationFrame" not in render
    #    ↑ 不留第二条动画轨道: 分身只从实时几何取形, 没有可打架的自演
    assert "calVel" in render and "calLastY" in render   # 滚动方向记账: 停手朝这头收场
    assert 'calLastY < 0' in render              # 开页恢复滚位不算手: 不代劳收场
    assert 'if (calVel > 0)' in render           # 停手收场认方向: 长回就长到底, 收拢就收到胶囊
    assert 'top: scrollY - (r.bottom - line - CAL_H)' in render   # 收场走真滚动到底
    assert 'twin.className = "cal-card cb-card";' in render   # 分身挂 .cal-card 拿全套网格样式
    assert 'twin.innerHTML = $("#cal-card").innerHTML;' in render   # 搬真身内容 (交接像素连续)
    assert 'twin.style.width = `${r.width}px`;' in render \
        and 'twin.style.height = `${r.height}px`;' in render   # 定格快照: 宽高接管那刻钉死, 之后只被裁
    assert "calTwin = twin;" in render   # 热路径 DOM 引用接管那刻缓存 (calDraw 不再逐帧查)
    assert 'removeAttribute("id")' in render    # 分身去 id: $ 永远命中真身 (样式全走 class)
    assert 'card.style.visibility = "hidden"' in render   # 接管: 真身隐身, 分身全权代表
    assert 'card.style.visibility = "";' in render        # 交还: 真身回屏
    assert "const bottom = Math.max(r.bottom, top + CAL_H);" in render   # 下边界跟手, 收到胶囊底为限
    assert "bar.style.top = `${top}px`;" in render        # 上边界钉死在落位线
    assert 'bar.style.backgroundColor = "rgb(29,29,29)";' in render \
        and 'bar.style.boxShadow = "none";' in render   # 底色一次写死 (28→31 中点), 影子路上歇着换流畅
    assert 'new IntersectionObserver(() => calSync()' in render
    assert "position: absolute; top: 0; left: 50%;" in page_css   # 分身钉在外壳顶上居中 (定格快照随外壳裁形)
    assert "#cal-bar.morph {" in page_css       # 运动期磨砂暂撤 (WebKit 重影对策)
    assert '<span class="cb-in">' in render     # 胶泡文字 (收拢后段从分身内容交叉淡入)
    assert "function calViewMon(" in render and "function calCapHtml(" in render \
        and "calIn.innerHTML = calCapHtml(mon);" in render
    #    ↑ 胶泡实时报列表当前月: 认视线线上最靠上的日组 (月份头横幅撤了),
    #    月份换了才重写一次
    assert '<span class="e">${s && s.exp > 0 ? calAmt(s.exp) : ""}</span>' in render
    #    ↑ 金额槽位常驻 (没数也占行): 日期/支出/收入各排各的水平线, 整行对得齐
    assert "height: 12px; line-height: 12px;" in page_css


def test_bookkeeping_calendar_bubble_content():
    """胶囊的里子: 收支带方向色 + 宽度跟内容走 + 收到头歇进胶囊位 (auto 宽)。
    1.3.1 末从 test_bookkeeping_calendar_and_top_bubble 再拆 (单测语句数上限 60)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 胶泡收支带方向色 (支出柔红/收入柔绿 — 日历格子/账目行同一副色, 磨砂里一眼
    # 分得清); 宽度跟内容走: 撤了 46vw 收口, 平常月份的收支整串都摆得下,
    # 超宽到屏放不下才省略号兜底
    assert '<span class="e">支 ${fmtMoney(t.expense)}</span>' in render \
        and '<span class="i">收 ${fmtMoney(t.income)}</span>' in render
    assert "#cal-bar .msum .e { color: var(--red); }" in page_css \
        and "#cal-bar .msum .i { color: var(--green); }" in page_css
    assert "max-width: 46vw" not in page_css
    # 收到头歇进胶囊位: 行内几何交还样式表 (居中 + auto 宽) —— 翻月/记账后
    # 内容变了胶囊自己跟着长, 不吃接管那刻量下的老账宽; 往回滚再重抓行内
    # 几何接着跟手长回
    assert "let calDocked = false;" in render and "calDocked = true;" in render \
        and "calClear(bar);" in render
    # 运动途中胶泡换了月: 收拢的终点宽跟着新内容重测 (同步布局量完画前恢复)
    assert "calSlot = bar.getBoundingClientRect();" in render


def test_bookkeeping_calendar_swipe_months():
    """日历左右划翻月: 向左划下月/向右划上月, 先定轴向一划一次, 误触吃掉;
    ‹ › 与划共用 shiftCal, 新月份顺着方向滑入 (重放式)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 整层手势骨架 (记一笔弹层同款): 先定轴向定了不反悔, 一划只翻一次,
    # 竖着划让给页面滚动; 划完的那一下点击捕获吃掉 (不误触日子格子/‹›钮)
    assert 'shiftCal(dx < 0 ? 1 : -1)' in render
    assert "Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) + 6" in render
    assert "touchcancel" in render
    assert "setTimeout(() => { ate = false; }, 350)" in render   # 误触兜底自清
    assert "e.stopPropagation(); e.preventDefault();" in render  # 捕获期吃掉
    # ‹ › 与左右划共用 shiftCal: 换月顺着方向滑入 (下月从右进/上月从左进),
    # 重放式 class + reflow (1.3.0 类别格切换动画同款)
    assert 'const cls = delta > 0 ? "cal-in-r" : "cal-in-l";' in render
    assert 'void $("#cal-grid").offsetWidth;' in render
    assert "@keyframes cal-in-r { from { transform: translateX(26px); opacity: 0; } }" in page_css \
        and "@keyframes cal-in-l { from { transform: translateX(-26px); opacity: 0; } }" in page_css
    # 六行恒高: 天数不够的月份尾部补下月的日子 (灰字不可点), 补足 42 格 —
    # 左右划切月时日历高度不跟着月初星期/月长短变来变去
    assert "for (let d = 1; d <= 42 - first - days; d++)" in render
    assert '<div class="cal-day after"><span class="d">${d}</span></div>' in render
    assert ".cal-day.after { color: var(--ink-3); justify-content: flex-start; }" in page_css
