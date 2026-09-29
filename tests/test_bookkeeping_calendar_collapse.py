"""记账日历收拢状态机测试: 缩放全程跟手 — 收拢向不再交给弹簧, p 逐帧从滚动
几何来 (分身下边界贴着列表内容的头: 滚多快收多快, 滚停就停在那高度, 任意
高度都是稳态 — 没有空档, 补拽退役); 圆角全程钉死 18px 一分不变 (高度收到 36
那截自然就是胶囊 — 不再追着盒高走, 中途鼓大再收回); 长回照旧跟手, 半路停手
一口气长回顶; 弹簧只剩面板开合 (浮在列表上没有滚动可跟), 收回途中回滚过线
反着弹回长开。掉帧/帧间过渡治在: 收拢几何交滚动时间线 (脚本驱动天生慢一拍 —
快滚时边与内容差一帧滚距; 渲染时按当帧滚位采样零延迟, 不认的环境退回脚本逐
帧老底盘), 形变壳只裁不画 (皮肤搬去 .cb-skin 空壳/分身自带静态圆角/胶泡字进
合成层), 读排在写前头, 日组名单按 DOM 版号缓存 + 胶泡文字还隐着的那程不探测。
拆自 test_bookkeeping_waterfall_feed.py (200 行上限又满了)。"""
from pathlib import Path


def test_bookkeeping_calendar_collapse():
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    # 缩放全程跟手 (收拢向原先是副自顾自的弹簧: 列表照它自己的滚, 滚得慢中间
    # 露空档手停再补拽 — 缩放跟列表两副节拍): 日历卡顶一碰到落位线, 分身接管
    # —— 上边界钉死, p 逐帧从滚动几何来 (分身下边界贴着隐身日历卡的下边界 =
    # 列表内容的头), 滚多快收多快 (帧率就是滚动的帧率), 滚停就停在那高度;
    # 点开的面板才走弹簧 (没有滚动可跟)。流畅治在八处 (帧率就丢在慢一拍的脚本
    # 驱动/逐帧重排/逐帧重画/遮罩逐帧重栅格/一帧排两遍布局/白跑的探测): 收拢
    # 几何交滚动时间线 (脚本写样式下一帧才上屏, 快滚时边和内容差一帧滚距 = 一顿
    # 一顿; 渲染时按当帧滚位采样零延迟, 下头钉), 分身是定格快照 (接管那刻宽高
    # 钉死, 外壳一路只当裁形窗口 —— 日历网格全程零重排), 形变壳只裁不画 (矩形
    # 裁是 GPU 硬件裁; 圆角裁合成层子元素要挂 mask 逐帧重栅格化 — 皮肤搬去
    # .cb-skin, 下头钉), 分身/胶泡字各进合成层 (css 钉), 热路径 DOM 引用接管
    # 那刻缓存, 读排在写前头 (js 钉), 名单缓存 + 隐字不探测 (下头钉)
    assert "function calSync(spring) {" in render and "function calRetwin(" in render
    assert "function calDraw(" in render and "function calSettle(" in render
    assert "function calRelease(" in render and "function calClear(" in render
    assert "function calDockOrReturn() {" in render   # 面板收回弹簧落位收尾 (歇胶囊位/认线交还)
    assert "calHeld" in render
    assert 'const CAL_H = 36;' in render and 'const CAL_W_PINCH = 0.45;' in render
    assert 'const CAL_FADE = 0.8;' in render   # 换字淡完线: 分身淡到头, 后段只剩外壳裁形
    assert 'const CAL_IDLE = 180;' in render
    assert "calSmooth" in render and "t * t * (3 - 2 * t)" in render
    assert 'addEventListener("scroll"' in render and "requestAnimationFrame" in render
    # spring 旗: 只有真滚动带进来的帧才铺路 — 数据刷新对位 (renderCalendar) /
    # 开页恢复滚位 (IO 初次回调) 只摆位不演
    assert "calSync(true);" in render and "calSync(false);" in render
    assert "if (!calFloat) calSync(false);" in render \
        and "new IntersectionObserver(() => calSync(false)," in render
    # 收拢向的滚动只铺路不点弹簧: p 从几何来 (calDraw 在 !calDocked 里每帧直
    # 画), 底下先铺出一屏半防惯性撞底回弹; calFloatTween 全文件恰四处 = 定义
    # + 面板展开/收回/收回途中反悔三处调用 — 缩小不再走它
    assert "if (spring && calVel > 0 && p < 1) {" in render
    assert render.count("calFloatTween(") == 4
    # 圆角全程钉死一个大小: 运动期恒 18px, 住在皮肤层 .cb-skin (收拢/长回/
    # 面板开合的画全走 calDraw, .morph 挂/摘全在那 — 逐条路径不用各自记); 歇下
    # 交还 999px — 36px 盒上等效同是 18, 胶囊端接缝零跳变; 高度收到 36 那截
    # 自然就是胶囊。原先追着盒高走 (半盒高定律): 中途鼓到 ~55px 再收回 18 —
    # 曲率先变大再变小, 就是一顿一顿的观感
    assert "border-radius: 18px;" in page_css.split("#cal-bar .cb-skin {")[1].split("}")[0]
    draw_fn = render.split("function calDraw(")[1].split("function")[0]
    assert "borderRadius" not in draw_fn   # calDraw 不再逐帧写圆角: 恒值是状态, 不是帧
    assert "985" not in render        # 旧法 (14+985·pinch) 退役: 圆角不等收窄线了
    assert "const pill" not in render  # 半盒高追踪也退役: 途中会鼓大 (先变大再变小)
    # 帧间过渡的根治 — 滚动时间线 (几何/淡入淡出/让位/转屏重烤的钉在隔壁那个测试):
    # 脚本驱动天生慢一拍, 快滚时边和内容差一整帧滚距; 时间线渲染时按当帧滚位采样
    # 零延迟, 不认的环境退回脚本逐帧老底盘
    # 掉帧治 1 — 裁剪与皮肤分家: 形变期壳只做矩形裁 — 合成层子元素的矩形裁剪
    # 是 GPU 硬件裁; 圆角裁剪要在壳上挂 mask 层, 壳的几何逐帧变 = mask 逐帧重
    # 栅格化 (掉帧大头)。底色/圆角/影子全班搬去皮肤层 (.cb-skin 空壳 — 没有
    # 合成层子元素, 圆角只是普通画一笔, 跟着壳重画也就一个圆角矩形, my-music
    # 流体形变只动空壳同款打法); 换肤全走 .morph 样式表, 行内一个字不写
    morph_rule = page_css.split("#cal-bar.morph {")[1].split("}")[0]
    assert "border-radius: 0;" in morph_rule and "background: none;" in morph_rule
    assert "#cal-bar.morph .cb-skin { display: block; }" in page_css
    assert 'backgroundColor = "rgb' not in render   # 行内换肤退役: .morph 一把全在样式表
    # 掉帧治 2 — 分身/胶泡字各进合成层: 快照纹理 (含自带的 18px 静态圆角 —
    # 尺寸恒定只渲染一次) 不再跟着裁形窗口逐帧重画; 胶泡文字交叉淡入 + 高度
    # 逐帧变时的重排中心, 全是免费层位移
    card_rule = page_css.split("#cal-bar .cb-card {")[1].split("}")[0]
    assert "will-change: opacity;" in card_rule \
        and "border-radius: 18px; overflow: hidden;" in card_rule
    assert "will-change: opacity;" in page_css.split("#cal-bar .cb-in {")[1].split("}")[0]
    # 掉帧治 3 — 读排在写前头: 铺路读 scrollHeight 必须在 calDraw 写样式之前
    # (写完再读 = 逼着一帧排两遍布局)
    assert render.index("while (doc.scrollHeight") < render.index("calDraw(r, p);")
    # 掉帧治 4 — 日组名单按 DOM 版号缓存 (逐帧重查 querySelectorAll 是白跑),
    # 胶泡文字还没淡进来 (p≤收窄线, 字不可见) 的那程连探测都不做
    assert "let calDomSeq = 0;" in render and "calViewSeq !== calDomSeq" in render \
        and 'calViewGs = document.querySelectorAll(".day-group");' in render
    assert 'const mon = p > CAL_W_PINCH ? calViewMon() : "";' in render
    # 收拢起步先铺路: 惯性要滚多远不可知, 底下哨兵没及时带出内容时文档先到得底 —
    # 滚动被钳在底上回弹, 跟手的分身跟着发抖 (下面的内容没补上来那毛病)。起步
    # 先把底下铺出一屏半 (追加都在视口下方, 画面不动 — 与滑屏"先画够高"同一招)
    assert "while (doc.scrollHeight - scrollY - innerHeight < innerHeight * 1.5" in render \
        and "&& feedDrawn < feedGroups.length) drawMore();" in render
    assert "if (calFloatT) {" in render
    # 面板收回途中回滚过线 (面板收回又反悔): 反着弹回长开, 到位交还真身 (p=0 ≡ 卡
    # 原样, 接缝不跳也不僵等); 过线一整个胶囊高 (CAL_H) 才算真反悔: 撞底回弹的
    # 毛刺拨不动弹簧, 没过线的回滚让弹簧收完、落位时 calDockOrReturn 认线交还
    assert "if (calFloatT.to === 1 && r.top > calSlot.top + CAL_H) {" in render \
        and "calFloatTween(0, calRelease);" in render
    assert "calVel" in render and "calLastY" in render   # 滚动方向记账: 收拢向铺路/停手认方向
    assert "let calBaseY = scrollY;" in render \
        and "if (calLastY < 0) calVel = y - calBaseY;" in render
    #    ↑ 头一滚没上一帧可比: 从开机位起算 (开页必在顶 → 头一滚必是往下) — 滚轮单格
    #      那种一锤子滚动只发一发事件, 不这么记的话 calVel 还是 0, 停手会被当成
    #      "没方向"反倒滚回顶把日历长回来
    assert 'calLastY < 0' in render              # 开页恢复滚位不算手: 不代劳收场
    # 停手只认长回向: 收拢向停哪算哪 (缩放跟手, 列表停哪分身停哪 — 稳态, 补拽
    # 退役); 长回向半路停手一口气长回顶
    assert "if (!calHeld || calLastY < 0 || calVel > 0) return;" in render
    assert "calGlideTo(scrollY + (r.bottom - line - CAL_H));" not in render   # 空档补拽退役
    assert 'calGlideTo(0);' in render   # 长回收场滑到顶交还真身 (1.3.1 那版方向拧反 — 停在半缩处
                                       # 它反倒一路滚回顶把日历长回来, 还借的掐不停的系统 smooth)
    assert "clearTimeout(calSettleT);" in render   # 滚动每帧重排计时: 惯性没停不触发, 不抢方向盘
    assert '"smooth"' not in render      # 系统 smooth 滚动全撤: 全应用的程序动画一副弹簧
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
    assert 'calSkin.style.boxShadow = "none";' in render   # 面板收回: 落位亮的那副影子先歇 — 挂皮肤层
    assert 'if (calSkin) calSkin.style.boxShadow = "";' in render   # 清场连皮肤层那副影子一并还样式表


def test_bookkeeping_calendar_collapse_timeline():
    """帧间过渡的根治 — 收拢几何交浏览器的滚动时间线: 脚本驱动天生慢一拍 (滚动
    事件回来再写样式, 下一帧才上屏), 快滚时分身下边界与底下内容差一整帧滚距,
    就是帧间一顿一顿的根; 时间线渲染时按当帧滚位采样零延迟 (淡入淡出是合成器
    属性, 忙帧也照走), 不认的环境退回脚本逐帧老底盘 calDraw。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    render = (base / "bookkeeping-render.js").read_text(encoding="utf-8")
    page_css = (base / "css" / "bookkeeping-page.css").read_text(encoding="utf-8")
    # 能力探测 + 接管那刻把卡几何/胶囊位/起收滚位烤进变量 (calTrackBake): 胶囊位
    # 按公式现算 (不认旧 calSlot, 转屏不留陈值); .track 一挂, 滚到哪帧同步到哪
    assert 'CSS.supports("animation-timeline", "scroll()")' in render \
        and "function calTrackBake(" in render
    assert 'bar.classList.add("track");' in render \
        and 'bar.classList.remove("track");' in render
    # 样式表那把尺: 根滚动器的时间线, 动画窗 [起收滚位, 起收+卡高-胶囊高]; 高度与
    # 收窄/交叉淡化拆两把动画 — 高度全程线性 (跟滚动同律), 收窄与淡化 45% 之后才
    # smoothstep (linear() 采样, 与 calSmooth 同一条曲线); 高度首尾钉卡高/胶囊高
    track_rule = page_css.split("#cal-bar.track {")[1].split("}")[0]
    assert "animation-timeline: scroll(root block);" in track_rule \
        and "animation-range: var(--col-s0) var(--col-s1);" in track_rule
    assert "animation: cal-track-h linear both, cal-track-x linear both;" in track_rule
    for kf in ("cal-track-h", "cal-track-x", "cal-track-twin", "cal-track-in"):
        assert f"@keyframes {kf} " in page_css
    assert "height: var(--col-h);" in page_css.split("@keyframes cal-track-h {")[1].split("}")[0]
    # 面板开合 (.float) 时间线让位 (animation: none — 停在半缩的动画会压住弹簧的
    # 行内几何), 弹簧的 calDraw 行内接管; 转屏重烤变量 (时间线路几何不现量, 老路
    # 天然跟手)
    assert "#cal-bar.float .cb-in {" in page_css and "animation: none;" in page_css
    assert 'addEventListener("resize"' in render
