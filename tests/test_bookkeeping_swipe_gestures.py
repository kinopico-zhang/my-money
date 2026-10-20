"""横滑手势测试 (1.15.0, 10-10 用户点名「筛选的两个界面, 左右滑动要可以切换.
另外, 所有的左滑右划, 包括日历, 所有的空间. 滑动一定要跟手, 并且可以通过
手势取消」): 筛选两页并进原生滚动分页器 (scroll-snap — 跟手/弹回系统自带),
日历改三网格轨道跟手拖拽 (影子月两翼候场, 过 1/3 或甩劲才换月, 拖回一半
弹回, 封顶橡皮筋), 推入层返回本就是跟手拖拽 — 后者只作巡检钉。报表大类/
小类的横滑分页 10-15 退役 (用户点名改卡题下拉菜单切换), 不在此列。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_flt_pager_swipe_between_pages():
    """筛选两页横滑: 类别/标签两页常驻一副分页器, 原生滚动 + scroll-snap —
    跟手、松手没滑到位自动弹回 (手势可取消); 页签点了平滑滚过去, 滑到哪页
    页签亮到哪页 — 状态唯一事实源是分页器位置; 两页纵向各自滚 (类别树翻得
    深不带进标签页), 弹框身不再纵滚。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert 'id="flt-pager"' in js and 'class="flt-page" id="flt-page-cat"' in js \
        and 'class="flt-page" id="flt-page-tag"' in js
    assert "const fltStride = () => Math.max(1, fltPager.children[1].offsetLeft" in js \
        and "Math.round(fltPager.scrollLeft / fltStride())" in js   # 滑到哪页页签亮到哪页
    assert 'behavior: "smooth"' in js          # 页签点了平滑滚过去
    assert ".push-pane .flt-pager {" in css and ".push-pane .flt-page {" in css \
        and "scroll-snap-type: x mandatory" in css \
        and ".push-pane #flt-body { display: flex; flex-direction: column;" in css


def test_calendar_drag_follows_finger():
    """日历跟手划月: 三张月格并卧一条轨道 (当前月居中, 上/下月影子候场),
    拖拽整条轨道横移 — 手就是动画; 锁定锥判过才接管 (短/斜不算划, 点日子
    照旧), 锁定那刻才抓指针 (抓早了日期钮收不到 click); 松手过了 1/3 或带
    甩劲才换月, 拖回弹回 = 手势取消; 本月封顶往左只给橡皮筋的份; 换月走
    calJump(…, true) 拖拽已演完, 不再放滑入动画。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert 'id="rc-track"' in js and 'id="rc-pm"' in js and 'id="rc-nm"' in js
    assert "const gridOf = (y, m) =>" in js   # 单张月格拆出: 三张同款恒 6 行
    assert 'q("#rc-pm").innerHTML = gridOf(' in js \
        and 'q("#rc-nm").innerHTML = gridOf(' in js
    assert "calTrack.setPointerCapture(ev.pointerId);" in js \
        and 'calTrack.style.transition = "none";' in js   # 拖拽期间不吃过渡
    assert "Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 2" in js   # 锁定锥
    assert 'calTrack.style.transform = `translateX(' in js   # 跟手: 手就是动画
    assert "dx * 0.3" in js                   # 封顶橡皮筋 (跟手到头, 松手必弹回)
    assert "const flick = performance.now() - d.t < 180 && Math.abs(dx) > 30;" in js
    assert "Math.abs(dx) > w / 3 || flick" in js   # 过 1/3 或甩劲才换月
    assert "calJump(t.getFullYear(), t.getMonth() + 1, true);" in js
    assert "function calJump(y, m, still)" in js and "if (same || still) return;" in js
    assert "calSwallow" in js and "calBusy" in js    # 吞尾随 click / 动画期不接新手势
    assert ".push-pane .rc-clip {" in css and ".push-pane .rc-track {" in css \
        and ".push-pane .rc-ghost {" in css and "will-change: transform;" in css
    # 10-19 抖动修 (用户报「日历左右滑动, 结束的时候会抖动一下」, 无头浏览器
    # 逐帧采样实锤): ① 落位值得是整串合法 transform — 早先 calSettle 光塞
    # "357px" (裸长度), CSSOM 当非法声明整个拒收: transform 原地不动、过渡
    # 根本不起, 轨道愣 250ms 后被换月钟一把拽回 0 = 松手先定住再猛跳一下;
    # ② 换月落地改等 transitionend 真到站 — 定时器按点开火, 过渡要等下一帧
    # 提交才起跑, 主线程一忙还能落后上百毫秒, 掐点换内容末尾又是一记瞬跳;
    # 定时器降级当兜底 (框被关掉过渡被掐, 月也得照换 busy 也得照解)
    assert "calTrack.style.transform = `translateX(${px}px)`;" in js   # 整串合法值
    assert "calSettle(goNext ? -w : w)" in js and "calSettle(0)" in js
    assert "calSettle(goNext ? `${-w}px` : `${w}px`)" not in js   # 裸长度 = 非法
    assert 'calTrack.addEventListener("transitionend", onEnd);' in js \
        and 'ev.target === calTrack && ev.propertyName === "transform"' in js \
        and "calTrack.removeEventListener(\"transitionend\", onEnd);" in js \
        and "setTimeout(land, 400)" in js and "let landed = false;" in js
    assert "}, 250);" not in js   # 掐点换月的旧定时器退役 (只剩 transitionend + 兜底)


def test_existing_swipes_stay_gesture_driven():
    """大盘巡检: 筛选弹框两页 = 原生滚动 + snap (跟手/弹回天生就有);
    推入层返回 = 指针拖拽跟手 (过 1/4 或甩劲才收) — 这两处已是手势驱动,
    钉住别回退成「先划够数再放动画」的旧做法。报表大类/小类的横滑分页
    10-15 退役 (切换收进卡题下拉菜单), 不再在此巡检。"""
    js = _static("bookkeeping-stats.js")
    push = _static("bookkeeping-push.js")
    css = _static("css/bookkeeping-panes.css")
    assert "Math.round(fltPager.scrollLeft / fltStride())" in js \
        and "scroll-snap-type: x mandatory" in css
    assert "setPointerCapture" in push and 'pane.style.transition = "none";' in push \
        and "dx <= width / 4 && !flick" in push
    # 断触根治 (2026-10-17 用户报「右划/边缘返回总被断触取消, my-music 没
    # 有这个问题」) 三块拼图, my-music 同款: ① 层身放行 pan-x — touch-action
    # 只裁原生滚动不派发事件, 之前 pan-y 让整条链 (含 button 的 manipulation)
    # 拒掉横向平移, iOS 认出横移就地 pointercancel, 手势跟到一半被掐死;
    # ② 层内纵向滚动器全配 overflow-x: hidden — 只写 overflow-y 时 x 按
    # auto 算, iOS 给单向滚动器也配横向橡皮筋, 橡皮筋一接管横拖同样掐
    # (版面身 gran-view/弹框身 bs-body/图标栅格 cm-icons/筛选两页
    # flt-page); ③ 判横收 45° 一把尺 (10-09 的 63° 边缘锥是误诊 — 锥比
    # 浏览器轴向锁宽, 抢到的斜划全被判回竖滚)。筛选器自己明写 pan-x
    # pan-y (原生 snap 平移要链上放行), 图片禁拖影
    assert "touch-action: pan-x pan-y;" in css \
        and "竖滚留给层内滚动器" not in css \
        and "horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy);" in push \
        and "const edge = startX <= 28;" not in push
    for blk in (".gran-view {", ".bk-sheet .bs-body {", ".cm-icons {", ".flt-page {"):
        body = css.split(blk, 1)[1].split("}", 1)[0]
        assert "overflow-x: hidden" in body, f"{blk} 没掐横向橡皮筋"
    assert ".push-pane img { -webkit-user-drag: none; }" in css \
        and "右划别拖出图片幽灵" in css
    # 断触根治第二轮 (10-17 用户复验「还不够丝滑」): 光放行 pan-x 拦不住
    # 浏览器的滚动锁 — 手稍斜, 底下的竖向滚动器中途赢下竞速就 pointercancel,
    # 层跟到一半弹回。触摸看门 (my-music 1.8.18 同款思路, 放宽到全层): 右向
    # 坐实 (过 6px, 抢在浏览器自家 slop 之前) 就 preventDefault 把触摸认领
    # 到底; 左向 (行左滑删除)/竖向 (滚列表)/弹框里 (框有自己的手势) 不掺和
    assert 'pane.addEventListener("touchmove", (event) => {' in push \
        and "{ passive: false });" in push \
        and "if (guardRight) { event.preventDefault(); return; }" in push \
        and "guardRight = dx > 0 && Math.abs(dx) > Math.abs(dy);" in push \
        and "Math.abs(dx) < 6 && Math.abs(dy) < 6" in push \
        and 'event.target.closest("#cat-modal, .bk-sheet")' in push


def test_calendar_month_watermark():
    """大月份水印 (10-11 用户点名「当月的时间, 放大占满整个日历, 放在日期的
    下面, 日期都是半透明的, 透过日期可以按到当前月份. 月份格式 yyyy/mm」):
    每张月格自带一枚 yyyy/mm 水印垫在日期底下 — z-index: -1 沉底 (轨道
    will-change 自成层叠上下文, 负一沉不穿卡面), 划月时跟着各自月份走;
    日期半透明透出月份, 选中两头/今日留重一档; 小字年月行与两点流提示行
    (选开始/结束日期) 一并退役。"""
    js = _static("bookkeeping-stats.js")
    css = _static("css/bookkeeping-panes.css")
    assert '<div class="rc-month-bg" aria-hidden="true">${y}/${pad(m)}</div>' in js
    assert 'id="rc-month"' not in js and ".push-pane .rc-month {" not in css   # 小字年月行退役
    assert "rc-hint" not in js and ".rc-hint" not in css and "选结束日期" not in js
    assert "z-index: -1;" in css and "rgba(235,235,245,.09)" in css \
        and "pointer-events: none;" in css      # 沉底 + 不挡点按 (按到的还是日期)
    assert ".rc-d { opacity: .55; }" in css and "font-weight: 700; opacity: .85; }" in css \
        and ".rc-d.today:not(.sel) { box-shadow: inset 0 0 0 1.5px var(--ink-3);" in css
