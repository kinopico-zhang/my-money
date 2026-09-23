"""记账日历顶胶囊里子测试: 收支配色/定宽 (‹ › 钉两端三边等距)/换月对滑/
金额千·万简写/快速翻月 (明细滑过去)、翻月钉住 (滚动探测让位, 手碰才交还)
与跳位落点让位; 点胶囊展开悬浮日历面板 (列表不动/点日子才滑/滑列表才收回)。
拆自 test_bookkeeping_waterfall_feed.py (200 行上限又满了)。"""
from pathlib import Path


def test_bookkeeping_calendar_float_panel():
    """点胶囊展开悬浮日历: 列表纹丝不动, 点日子才滑过去, 滑列表才收回。
    开合走与滑屏同一副临界阻尼弹簧 (统一手感, 铺更多帧换顺滑)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 展开/收回走 p 弹簧 (与滚动收拢同一条 calDraw 形变轨道, 推手从滚动换成弹簧 —
    # 滑屏那副临界阻尼公式原样搬来推 p, 全应用一副脾气; 原先 240ms 一口气的补间
    # 大半程挤在前几帧, 稍掉一帧就看见台阶): calP 记最新进度 (calSync 逐帧写),
    # 半路展开也从眼下的样子长起; 弹簧帧有 calFloatT !== tw 守卫 (半路被停/被换
    # 就地熄火, harness 的假 rAF 撤不掉也安全)
    assert "let calP = 1;" in render and "calP = p;" in render
    assert "const CAL_P_K = 170;" in render \
        and "const CAL_P_C = 2 * Math.sqrt(CAL_P_K);" in render
    assert "function calFloatTween(" in render and "calDraw(r, calP);" in render \
        and "tw.v + (CAL_P_K * (tw.to - calP) - CAL_P_C * tw.v) * dt" in render \
        and "if (calFloatT !== tw) return;" in render
    assert "function calFloatStop(" in render
    # 展开: 只在接管态 (胶囊在屏上才点得着); 手静收场的计时和在途滑屏都掐了
    # (收场早改走弹簧, 一停就真停 — 不再有掐不断的系统 smooth 滚动要原地一写去
    # 掐); 面板底 = 卡面实色 (悬浮得盖得住底下列表); 途中影子歇着 (大投影跟着
    # 尺寸逐帧重画最吃帧率 — 与滚动收拢同一路), 弹簧落位这一下才亮出来;
    # .float 挂上 (css 开分身的 pointer-events)
    assert "function calFloatOpen(" in render \
        and "if (!calHeld || calFloat) return;" in render
    assert "clearTimeout(calSettleT);" in render and "calGlideStop();" in render
    assert "window.scrollTo(0, scrollY);" not in render
    assert 'bar.classList.add("float");' in render \
        and 'bar.style.backgroundColor = "rgb(34,57,58)";' in render
    assert 'bar.style.boxShadow = "none";' in render \
        and "calFloatTween(0, () => {" in render \
        and 'bar.style.boxShadow = "0 12px 32px rgba(8,32,36,.3)";' in render
    # 收回: 先摘牌 (弹簧路上 calSync 不再二连收), 落位时亮的那副影子先歇, 再弹
    # 到 p=1; 缩到头的收尾与滚动收到头同一套 — 真身滚回眼前了直接交还 (不闪双
    # 日历), 没到就歇进胶囊位 (几何交还样式表)
    assert "function calFloatClose(" in render and "if (!calFloat) return;" in render
    assert "calFloatTween(1, () => {" in render \
        and "calDocked = true;\n      calClear(bar);" in render
    # 滑列表 = 收起令 (calSync 门口设卡): 真身滚回眼前 (松手就停在日历里) 面板
    # 让位直接交还; 还没到就顺着原路缩回胶囊 (面板自己的弹簧走, 列表照它自己
    # 的滚)。弹簧在途的帧几何归弹簧 (滚动事件别抢方向盘)
    assert "if (calFloat) {" in render and "if (calFloatT) return;" in render
    assert 'bar.classList.remove("float");' in render
    # 面板里的点击: 分身没了 id, 全走 #cal-bar 委托 — 点日子先收面板再滑列表
    # (这就是"去"); ‹ › 认结构 (头一枚是 ‹) 只翻日历的月, 列表不去; 点在面板
    # 别处不动 (滑列表才收)
    assert 'e.target.closest("button[data-date]")' in render \
        and "jumpToDate(day.dataset.date);" in render
    assert 'e.target.closest(".cal-head button")' in render \
        and "head.parentElement.firstElementChild === head ? -1 : 1" in render
    # 悬浮面板里翻月: 明细联动不跟 (列表等点了日子才走), 面板里的标题/格子和
    # 真身演同一场换月滑入 (分身是刚搬的快照, class 要单独给它挂 — 渲染期够不着
    # 营在后面的 calTwin, 现查 DOM); 面板开着时渲染刷新不走 calSync (那是滚动
    # 探测的门, 进去会把面板收掉)
    assert "if (!calFloat) jumpToMonth(calMon);" in render
    assert 'const panel = calFloat ? $("#cal-bar .cb-card") : null;' in render \
        and 'panel.querySelector(".cal-title")' in render
    assert "if (!calFloat) calSync();" in render
    # 面板期数据变了重搬分身: 面板亮着/胶泡文字隐着的角色不翻面 (重搬的
    # opacity 默认按歇着的胶囊给 — 面板开着得反着来, 不然胶泡文字闪一脸)
    assert "calDocked && !calFloat" in render
    # 左右划翻月在面板上也能用 (真身日历/悬浮面板各绑一份同一副手势骨架,
    # 面板那份只在浮着时听使唤 — 胶囊上划不动)
    assert "function calSwipe(" in render \
        and 'calSwipe($("#cal-card"), () => true);' in render \
        and 'calSwipe($("#cal-bar"), () => calFloat);' in render
    # css: 悬浮面板期分身开 pointer-events (日子格/‹ › 都是它身上的); 平日
    # 仍是快照 (pointer-events:none, 别挡胶泡自己的 ‹ › 和点击)
    assert "#cal-bar.float .cb-card {" in page_css \
        and "pointer-events: auto;" in page_css


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
    assert ("y = Math.max(0, Math.min(y,"
            " document.documentElement.scrollHeight - innerHeight));") in render
    #    ↑ 滑的落点夹进可滚区间: 收场/跳位算出的目标可能出头 (负/超文档底) —
    #    夹不进的话弹簧永远差一口到不了终点, 只能等三秒兜底熄火
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
