"""记账日历顶胶囊里子测试: 收支配色/定宽 (‹ › 钉两端三边等距)/换月对滑/
金额千·万简写/快速翻月 (明细滑过去)、翻月钉住 (滚动探测让位, 手碰才交还)
与跳位落点让位。拆自 test_bookkeeping_waterfall_feed.py (200 行上限又满了)。"""
from pathlib import Path


def test_bookkeeping_calendar_bubble_content():
    """胶囊的里子: 收支带方向色 + 定宽 + ‹ › 居中对齐 + 金额简写 + 换月对滑。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 胶泡收支带方向色 (支出柔红/收入柔绿 — 日历格子/账目行同一副色, 磨砂里一眼
    # 分得清); 金额走紧凑写法 (上千缩 1.2千/上万缩 1.2万 — 中间窗口宽度有限,
    # 长数字简写不硬挤, 真放不下才省略号兜底)
    assert '<span class="e">支 ${calAmt(t.expense)}</span>' in render \
        and '<span class="i">收 ${calAmt(t.income)}</span>' in render
    assert "if (n >= 1000) return" in render and "}千`;" in render
    assert "#cal-bar .msum .e { color: var(--red); }" in page_css \
        and "#cal-bar .msum .i { color: var(--green); }" in page_css
    assert "max-width: 46vw" not in page_css
    # 胶囊定宽: ‹ › 钉死两端位置恒定 (不跟内容伸缩忽宽忽窄); 与胶囊左/右/上/下
    # 各距 3px (36 = 3+28+3+2 边框 — 三边等距); 528 = 日历卡同一上限, 宽屏不比卡宽
    assert "width: min(calc(100vw - 24px), 528px);" in page_css
    assert "height: 36px; padding: 3px;" in page_css
    assert "flex: none; width: 28px; height: 28px;" in page_css
    # ‹ › 画成 SVG 线段箭头 (几何居中, 与中间文字真正对齐 — 字形的 ‹ 光学偏心),
    # 中间窗口 (cb-mid/cb-mv) 吃满剩余宽度, 里头那层字恒居中
    assert 'aria-label="上月"' in render and 'aria-label="下月"' in render \
        and 'stroke="currentColor"' in render
    assert "#cal-bar .cb-mid {" in page_css and "#cal-bar .cb-mv {" in page_css
    # 换月对滑: 新月顺着翻的方向进 (‹ 从左/› 从右 — 日历格 cal-in 同一套方向
    # 约定), 旧月被顶到对面出去; 只有 ‹ › 翻月才演 (滚动探测/数据刷新不演)
    assert "function calSlideCap(" in render and "calSlideCap(oldHtml, delta);" in render
    for k in ("cb-mv-in-l", "cb-mv-in-r", "cb-mv-out-l", "cb-mv-out-r"):
        assert f"@keyframes {k} " in page_css
    # 胶囊骨架只搭一次 (calBarShell): 翻月/换报/数据刷新只换中间那层字 (cb-mv) —
    # 之前 renderCalendar/探测每回都把整个 #cal-bar innerHTML 重搭, 点着的 ‹ 按钮
    # 被拆掉重换, 整个胶囊一帧重画 — 就是点箭头气泡回闪一下那毛病; 分身 (cal-card
    # 快照) 旧的自然拆走 (以前靠整包重搭顺手清, 现在没人清会堆积)
    assert "function calBarShell(" in render \
        and 'if ($("#cal-bar .cb-in")) return;' in render
    assert "calIn.innerHTML = calCapInHtml(mon);" not in render
    assert 'calBarShell();' in render and 'if (calTwin) calTwin.remove();' in render
    # 收到头歇进胶囊位: 行内几何交还样式表 (居中 + 定宽) — 胶泡以后换内容,
    # ‹ › 和宽度都纹丝不动; 定宽后静止位接管那刻量过一直有效 (calRefit 退役)
    assert "let calDocked = false;" in render and "calDocked = true;" in render \
        and "calClear(bar);" in render
    assert "function calRefit(" not in render
    # 气泡上的 ‹ ›: 歇在胶囊位快速翻月 — 从胶泡正报着的月翻起 (明细联动跟着挪);
    # 分身 pointer-events:none 让路, 隐身的定格快照别压在按钮上吃点击;
    # 裸箭头不套圈 (胶囊里再嵌灰底圆钮一层套一层太重), 按下点亮当回应
    assert "function calCapInHtml(" in render \
        and 'class="cb-nav" data-d="-1"' in render and 'class="cb-nav" data-d="1"' in render
    assert "shiftCal(+nav.dataset.d, calFeedMon || calMon)" in render
    assert "#cal-bar .cb-nav {" in page_css and "pointer-events: none;" in page_css
    nav_rule = page_css.split("#cal-bar .cb-nav {")[1].split("}")[0]
    assert "background:" not in nav_rule and "border-radius" not in nav_rule
    # 翻月钉住: 用户翻的月优先, 滚动探测让位 — 不钉的话, 翻到没账的月份 (跳位落回
    # 眼前) 或跳位被惯性余波压回, 随后的滚动事件会让探测把月份又盖回旧月, 看起来就是
    # "点了没反应"; renderCalendar 播种/探测让位/手一碰解钉 (触摸先解旧钉, 紧跟的
    # 翻月再钉新月 — 顺序天然对), 交还真身时钉跟着交还
    assert 'let calPin = "";' in render and "calPin = calMon;" in render \
        and "calFeedMon = calPin;" in render and "&& !calPin" in render
    assert 'for (const ev of ["touchstart", "pointerdown", "wheel"])' in render \
        and 'calPin = ""; calGlideStop();' in render
    assert "calDocked = false;\n  calPin = \"\";" in render
    # 跳位落点让开顶上的胶囊: 目标日组全在日历底下, 跳过去必进接管带 — 落点一律
    # 让到胶囊底下 (没接管过就现量一眼静止胶囊), 日组头从胶囊底下钻出来才看得见
    assert "function calGap(" in render \
        and 'calSlot ? calSlot.top : $("#cal-bar").getBoundingClientRect().top;' in render \
        and "return top + CAL_H + 8;" in render
    # 联动滑屏: 翻月/点日子跳位顺着滑过去, 真·物理手感 — 弹簧 (拉向终点) + 临界
    # 阻尼 (到位不弹头) + 起步冲量 (近推远甩, 小跳带点过冲回落), 速度指数衰减长尾
    # 缓缓刹住; 半路换目标带着在途余速走 (连点两下 ‹ 物理连续); 目标压着文档底
    # 先画够高 (不然滑到头被最大滚动钳在半道); 途中 drawLess 往上补内容: 视口跟
    # 内容一起下移 (画面不跳), 滑的坐标系整体跟移 (cur/to 都挪 — 光挪 to 不挪 cur,
    # 下一帧会把 scrollBy 顶回去, 落点差一截); 滑屏中递归补内容停一段 (视口不跟
    # scrollBy 走, 递归没了终止条件会一路画到头); 手一碰就停 (用户随时能夺回);
    # 邻月目标窗口朝目标扩, 眼前的内容不动 — 滑一路穿的是真内容 (没有"啪"一下换内容)
    assert "function calGlideTo(" in render and "function calGlideStop(" in render \
        and "if (calGlide !== g) return;" in render
    assert "const CAL_G_K = 110;" in render \
        and "const CAL_G_C = 2 * Math.sqrt(CAL_G_K);" in render
    assert "const carry = calGlide ? calGlide.v : 0;" in render \
        and "g.v += (CAL_G_K * (g.to - g.cur) - CAL_G_C * g.v) * dt;" in render
    assert "calGlideTo(Math.max(0, el.getBoundingClientRect" in render \
        and "scrollY - calGap()));" in render
    assert "while (y > document.documentElement.scrollHeight - innerHeight" in render \
        and "&& feedDrawn < feedGroups.length) drawMore();" in render
    assert "calGlide.cur += grew;" in render and "calGlide.to += grew;" in render
    assert "if (!calGlide && feedStart > 0" in render
    assert "while (feedStart > idx) drawLess();" in render \
        and "while (feedDrawn <= idx) drawMore();" in render
