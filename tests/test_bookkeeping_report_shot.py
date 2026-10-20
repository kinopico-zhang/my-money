"""报表截图测试 (1.15.0, 10-10 用户点名「报表添加一个保存截图的功能, 可以把
报表下载到手机相册」; 同日再点名「你生成的截图, 跟界面长的也不一样啊」→
海报照版面重排; 10-11 再点名图标配色 + 长按提示退役): 不抓 DOM, 但跟页面
一个长相 — 卡片/圆环引标/行内图标一个不少; 存相册走系统分享单
(navigator.share 文件级, 分享单里就有「存储图像」), 不支持的退 <a download>
直接下载。"""
from pathlib import Path

_BASE = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"


def _static(name: str) -> str:
    return (_BASE / name).read_text(encoding="utf-8")


def test_report_shot_poster_painter():
    """海报画师 (bookkeeping-report-shot.js buildReportCanvas): 照界面重画 —
    深色卡片 (卡面 #1c1c1e/圆角 14/发丝描边), 板头 (17px 标题 + N笔), 圆环
    几何直接吃 stats.js donutLayout 的解 (双层弧 + 折线引标 + 两侧标签 +
    环心合计, 与版面一字不差), 条形行 (行首 34×34 类别图标 + 名…金额 /
    色条 / 笔数…占比, 条按榜首归一); 「其他」行没有本体图标 — 灰圆垫底;
    量高先行一次画完, @2x 不发糊; 圆角矩形带老 Safari 退路; 环框顶垫与页面
    donut-box 同一副 (10-11 用户点名「并状图被标题挡住」— 引标不贴板头)。"""
    js = _static("bookkeeping-report-shot.js")
    assert "function buildReportCanvas(rep)" in js and '"use strict";' in js \
        and "/* exported buildReportCanvas */" in js
    # 色板抄一份页面 token 的值 (canvas 吃不到 CSS 变量 — 改主题两处同步)
    assert 'const SHOT_C = { bg: "#000", card: "#1c1c1e", ink1: "#f5f5f7"' in js \
        and "SHOT_FONT" in js
    assert "canvas.width = W * PX;" in js and "ctx.scale(PX, PX);" in js
    assert 'text(b.label, PAD + PADX, y + 28, 17, SHOT_C.ink1, "left", "650");' in js \
        and "SHOT_C.card" in js and "SHOT_C.hair" in js      # 卡面 + 发丝描边
    # 圆环: svg circle 的 r 是描边中心线 — canvas 弧取同一个 r, 线宽即描边
    # 宽; 段位/引标/标签全从 donutLayout 的解来, 海报版面同一副落位
    assert "ctx.arc(cx, cy, r, a(off), a(off + w));" in js \
        and "arc(DXC, d.cy, 65, 14, sg.c, cum, sg.w);" in js \
        and "arc(DXC, d.cy, 54, 9, sg.c2, cum, sg.w);" in js
    assert "for (const col of d.cols) {" in js and "it.lx + 5 * sx, it.b + 3.5" in js \
        and "`${b.label}合计`" in js and "¥${fmt(d.total)}" in js
    # 行: 图标井 34×34 (其他行灰圆垫底), 文字列三行两列, 条按榜首归一
    assert "ctx.drawImage(r.icon, x0, ry + 16, ICON, ICON);" in js \
        and "SHOT_C.other" in js
    assert "const bw = Math.max(3, Math.min(100, r.amt / max * 100));" in js
    assert "const HD = 36, DN_PAD = 22, ROW_H = 66" in js \
        and "ctx.translate(PAD, y + HD + 20);" in js   # 环框顶垫 20, 同步页面
    assert "if (ctx.roundRect) { ctx.roundRect(x, y, w, hh, r); return; }" in js
    assert "My Money · ${rep.date} 生成" in js


def test_report_shot_wiring_and_share():
    """接线 (stats.js + category-icons.js): 工具行分享钮 (漏斗左边) 备数据
    快照 — 当前范围+筛选+档位下的榜首 7 名 + 其他 (与圆环同源, 行带类别
    图标), 圆环走 donutLayout 与版面同一副落位 (内带深一档 c2 预备好);
    图标走自足版 catIconSvg (<img> 是独立文档, <use> 引不着页内 sprite —
    10-11 用户点名「截图里图标的颜色不对」: 图标跟页面同一副暗井底+本色
    线稿, 方向色解析成字面值); 预览一副 bk-sheet; 保存走系统分享单
    (canShare({files}) → share({files})), 不支持退 <a download>; 关框回收
    objectURL, 再开不叠图。"""
    js = _static("bookkeeping-stats.js")
    icons = _static("category-icons.js")
    css = _static("css/bookkeeping-panes.css")
    html = _static("bookkeeping.html")
    assert 'id="shot-btn" aria-label="保存截图"' in js \
        and 'id="shot-sheet"' in js and 'id="shot-img"' in js \
        and 'id="shot-save">保存到相册' in js
    assert "buildReportCanvas(rep).toBlob" in js and ".toBlob(b => {" in js \
        and '"image/png"' in js
    assert "pairs.slice(0, 7).map" in js \
        and "color: STATS_OTHER_COLOR, color2: dk(STATS_OTHER_COLOR, 0.7)," in js \
        and "pct: pctTxt(p[1], total)" in js \
        and 'hasFilters() ? " · 已筛选" : ""' in js
    assert "const iconImg = (key, kind)" in js \
        and "r.icon = r.key ? await iconImg(r.key, kind) : null" in js \
        and "encodeURIComponent(catIconSvg(key, kind))" in js
    assert "const donut = donutLayout(pairs);" in js \
        and "for (const s of donut.segs) s.c2 = dk(s.c, 0.7);" in js
    assert "function catIconSvg(cat, kind)" in icons \
        and "CAT_ICONS.get(key) || CATEGORY_ICONS[key]" in icons \
        and 'style="fill:#2c2c2e"' in icons \
        and 'const tint = own || (kind === "income" ? "#5fd47f" : "#e5666a");' in icons \
        and 'color="${tint}"' in icons      # 暗井底 + 本色线稿 (var() 独立文档没根)
    assert "navigator.canShare && navigator.canShare({ files: [file] })" in js \
        and "await navigator.share({ files: [file] });" in js \
        and "a.download = `报表-${curMonth()}.png`;" in js
    assert "URL.createObjectURL(b)" in js and "URL.revokeObjectURL(shotUrl)" in js
    assert "长按图片" not in js and "shot-hint" not in js and "shot-hint" not in css \
        and ".push-pane .shot-img {" in css   # 长按提示行退役 (10-11 用户点名)
    assert "bookkeeping-report-shot.js?v=4" in html
