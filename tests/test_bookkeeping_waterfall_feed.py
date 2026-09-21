"""记账主页瀑布流+日历测试: 所有月份一条往下滚的长列表 (双向懒加载/月头吸顶/签名去抖),
顶部日历每天标收支、点日子跳位 (窗口挪过去, 往上滚还能接回)。
拆自 test_bookkeeping_page_and_categories.py (200 行上限满了)。"""
from pathlib import Path


def test_bookkeeping_page_waterfall_feed_and_calendar():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    merge = (base / "bookkeeping-merge.js").read_text(encoding="utf-8")
    state = (base / "bookkeeping-state.js").read_text(encoding="utf-8")
    # 月份切换栏撤了 (看月份走日历); 汇总卡让位给日历也撤了
    assert 'id="mon-prev"' not in html and 'id="mon-label"' not in html
    assert 'id="sum-out"' not in html and 'id="sum-in"' not in html
    assert 'id="cal-grid"' in html and 'id="cal-prev"' in html and 'id="cal-next"' in html
    assert 'id="feed-more"' in html and 'id="feed-end"' in html and 'id="feed-top"' in html
    assert "还没有账目" in html and "这个月还没有账目" not in html
    # 瀑布流: 懒加载 + 月头小计 + 签名去抖 + 双向窗口 (跳走后往上滚接得回)
    assert "new IntersectionObserver" in render and 'rootMargin: "900px"' in render
    assert "function drawMore()" in render and "function drawLess()" in render
    assert "FEED_CHUNK" in render and "insertAdjacentHTML" in render   # 展开只追加不重画
    assert "function monthHeadHtml(" in render and "msum" in render
    assert "function feedSignature()" in render   # 数据/筛选没变: 列表不动 (滚动不跳)
    assert "feedStart" in render and "window.scrollBy(0, grew)" in render
    #    ↑ 窗口上沿: 往上补时视线钉在原来看的那行 (scrollHeight 差量补偿)
    assert "function jumpToDate(" in render and "findIndex(g => g[0] <= date)" in render
    #    ↑ 日历点日子: 没账的日子落到最近的有账日
    assert 'data-date="${date}"' in render     # 日组带日期, 跳位查得着
    assert 'visibleEntries(entries, person)' in render   # 全月份一条流, 不带月份参数
    assert "shiftMonth" not in render and "renderMonth" not in render
    assert "position: sticky; top: 0;" in page_css     # 月份头滚动吸顶 (盖住下面的组)
    assert "#feed-more { height: 44px; }" in page_css  # 底部哨兵有高度, 观察器才盯得住
    assert "function visibleEntries(entries, person) {" in merge
    #    ↑ 挑选只剩记账人一档: month 参数撤了 (瀑布流全月份)
    assert "bk-month" not in state   # 月份不再存 localStorage (没有"当前月"了)
    # 日历: 每天收支标格里 (上万缩成 1.2万), 标题带当月小计, 今天描一圈
    assert "function renderCalendar(" in render and "function calAmt(" in render
    assert "万" in render and "todayStr()" in render
    assert "function shiftCal(" in render
    assert "grid-template-columns: repeat(7, 1fr);" in page_css
    assert ".cal-day.today { box-shadow: inset 0 0 0 1px var(--blue); }" in page_css
    # 日历离屏 (滚进列表/跳位): 收成顶上一枚磨砂气泡 (月份+整月收支), 点了滚回日历展开
    assert 'id="cal-bar"' in html and 'id="cal-sent"' in html
    assert 'document.body.classList.toggle("cal-mini", gone)' in render
    assert 'window.scrollTo({ top: 0, behavior: "smooth" })' in render
    assert "top: calc(env(safe-area-inset-top) + 10px);" in page_css  # 避开状态栏模糊区
    assert "border-radius: 999px;" in page_css       # my-music 播放气泡同款磨砂胶囊
    assert "-webkit-backdrop-filter: blur(20px) saturate(180%);" in page_css
    assert "body.cal-mini .month-head { top: calc(env(safe-area-inset-top) + 54px); }" \
        in page_css                                  # 月份头让到气泡下面吸顶
    assert "#cal-bar[hidden] { display: none; }" in page_css
    assert '<span class="e">${s && s.exp > 0 ? calAmt(s.exp) : ""}</span>' in render
    #    ↑ 金额槽位常驻 (没数也占行): 日期/支出/收入各排各的水平线, 整行对得齐
    assert "height: 12px; line-height: 12px;" in page_css
    # 明细行三层: 最小类别 / 备注+标签 (没写不占行) / 几点记的·谁记的
    assert 'e.category.split("/").pop()' in render
    assert 'small || "未分类"' in render
    assert 'bits.push("#" + esc(t))' in render
    assert 'bits.length ? `<div class="l2">${bits.join(" ")}</div>` : ""' in render
    assert 'e.time ? e.time + " · " : ""' in render and "creatorName(e)" in render
    assert ".entry .l3 { font-size: 10.5px;" in page_css
