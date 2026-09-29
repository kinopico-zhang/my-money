"""日历导航的两副跟手感 (1.4.0): 左右划翻月从阈值触发改成真拖拽 — 月份内容贴
指尖 1:1 平移、上月/下月候场页垫在两侧、松手按拖过多少 + 甩得多快弹簧定去留;
点日子/翻月的联动滑屏不再收起日历 — 卡滚过接管线那刻原地化成悬浮面板接着挑
日子, 只有用户亲手滚列表才算收起令。骨架钉在 test_bookkeeping_waterfall_feed.py
(轴向锁定/竖滚让路/误触吃掉/‹ › 的 canned 滑入), 面板开合本体在
test_bookkeeping_calendar_bubble.py。"""
from pathlib import Path


def test_calendar_swipe_drag_follow():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 跟手: 月份内容贴指尖 1:1 平移, 过一页宽那截软阻尼 (tanh 渐近一页 — 拖到头
    # 也就露出大半页, 不拖出空白); 本月标题/格 + 两页候场各贴 ±页宽同一横位摆
    assert "const calXSoft" in render and "Math.tanh" in render
    assert "s.flyL.style.transform = `translateX(${p - s.w}px)`;" in render
    # 候场页与真身同一副 HTML (calTitleHtml/calGridHtml 抽出来共用): 落定换真身
    # 内容那帧像素一致, 接缝零跳; 假箭头占位让标题框与真头一行宽 (字同位)
    assert "function calTitleHtml(" in render and "function calGridHtml(" in render
    assert '$("#cal-grid").innerHTML = calGridHtml(calMon);' in render
    assert '<span class="cal-hpad"></span>' in render
    # 松手定去留: 甩得快速度说了算 (0.42px/ms, 指尖近 100ms 取样), 否则看拖过
    # 三成; 都不沾弹回。收场 = 滑屏那副临界阻尼弹簧原样搬来推横位 (CAL_G 同款
    # 常数 — 全应用的程序动画一副脾气), 指尖速度原样带进去 (松手不换挡)
    assert "vx > 0.42 ? -1 : vx < -0.42 ? 1" in render and "w * 0.3" in render
    assert "CAL_G_K * (s.to - s.p) - CAL_G_C * s.v" in render
    assert "Math.abs(s.v) < 60) || now - s.t0 > 1200" in render   # 到位/兜底熄火
    # 落定: 拆候场页/清平移, 翻定那趟静默换月 — shiftCal quiet (canned 滑入/
    # 胶泡对滑已由拖页演完, 不再叠一遍); 收场在飞被新一拖打断也走这 (连划不停顿)
    assert "shiftCal(d, calMon, true);" in render and "if (quiet) return;" in render
    assert "if (calX) calXFinish();" in render
    # 候场页的窝: 卡挂 .cal-x 变身裁形窗 — 真身卡平时不定位, 不顺手当包含块的
    # 话候场页会锚到整页上去; 候场页同一副内衬 (网格逐线对上)、自带卡面、不接
    # 点击; 悬浮面板那份候场页垫进分身 (.cb-card 自带裁形, 同一套机制)
    assert ".cal-card.cal-x { overflow: hidden; position: relative; }" in page_css
    fly = page_css.split(".cal-fly {")[1].split("}")[0]
    assert "padding: inherit;" in fly and "pointer-events: none;" in fly
    assert ".cal-fly .cal-hpad { flex: none; width: 30px; height: 30px; }" in page_css


def test_calendar_tap_keeps_calendar_open():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    # 点日子/翻月的联动滑屏带 hold: 滚到接管线那刻日历不收拢 — 原地化成悬浮
    # 面板 (p=0 卡原样, 接缝零跳) 浮在列表上接着挑日子; 与 calFloatOpen 同一副
    # 脸 (float 开 pointer-events/时间线让位, morph 换皮肤层), 只是 p 本来就在
    # 0 — 不用弹簧从胶囊长开, 行内摆一回即成
    assert "hold: !!hold" in render and "function calGlideTo(y, hold)" in render
    assert "if (calGlide && calGlide.hold) {" in render
    assert 'bar.classList.add("float", "morph");' in render \
        and "calDraw(r, 0);" in render
    # 只有用户亲手滚列表才算收起令: 自己这趟滑屏发的滚动不算 (calGlide 在途),
    # 落地那半像素的尾帧也盖上"自己滑的"戳 (calGlide 先清后跑 — 没这个戳, 面板
    # 刚落到日子上就被当成用户滚了列表, 缩回胶囊)
    assert "calJumpT = now;" in render
    assert "if (calGlide || performance.now() - calJumpT < 350) return;" in render
    # 落点按"滑到地方时顶上占着的是谁"算: 滑得远卡过线化面板 (让开整张 — 贴
    # 胶囊那档不够, 目标日组会钻进面板背后看不见); 滑得近卡留在原位 (日组头贴
    # 卡底钻出来); 已接管才走 calGap 的胶囊/面板档
    assert "const flow = Math.max(0, elDoc - (cr.bottom + scrollY) - 8);" in render
    assert "elDoc - (line + cr.height + 8)" in render
    assert "calGlideTo(Math.max(0, elDoc - calGap()), true);" in render
