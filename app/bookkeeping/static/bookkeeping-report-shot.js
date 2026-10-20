// bookkeeping-report-shot — 报表海报画师 (1.15.0, 10-10 用户点名「报表添加
// 一个保存截图的功能, 可以把报表下载到手机相册」; 同日再点名「跟界面长的
// 也不一样」→ 照版面一笔一笔重画): 不抓 DOM, 但跟页面同一个长相 — 深色卡
// 片 (卡面/圆角/发丝描边), 板头 (支出大类 · N笔), 双层圆环带折线引标 (几
// 何与标签落位直接吃 stats.js donutLayout 的解 — 与版面一字不差), 条形行
// (行首类别图标 + 三行两列: 名…金额 / 色条 / 笔数…占比), 尾上落款。@2x 出
// 图, 纯手画零依赖 — 离线账本不引 html2canvas 这种大件。底色字色抄一份页
// 面 token 的值 (canvas 吃不到 CSS 变量, 改主题两处同步)。
"use strict";
/* exported buildReportCanvas */

// 与 bookkeeping-page.css / panes.css token 同源的常备色 (--bg/--surface/
// --ink-1/--ink-2/--ink-3/--surface-2/--hairline)
const SHOT_C = { bg: "#000", card: "#1c1c1e", ink1: "#f5f5f7",
                 ink2: "rgba(235,235,245,.62)", ink3: "rgba(235,235,245,.32)",
                 track: "#2c2c2e", hair: "rgba(255,255,255,.09)",
                 other: "#555559" };
const SHOT_FONT = '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif';

function buildReportCanvas(rep) {
  const W = 375, PX = 2, PAD = 16, CW = W - PAD * 2;   // 逻辑 375, @2x 出 750px
  // 版面身段抄值 (panes.css): 卡圆角 14 / 卡距 14 / 发丝描边; 板头 36
  // (13 垫 + 21 行 + 2 垫); 环框 340×218 缩到卡宽, 上下垫 20+2 (10-11 与页
  // 面 donut-box 同步加顶 — 引标不再贴着板头); 行 66 高 (上 8 下 8 垫, 内容
  // 50) — 图标 34, 文字列在图标右 11
  const HD = 36, DN_PAD = 22, ROW_H = 66, ICON = 34, PADX = 14, TX = PADX + ICON + 11;
  const s = CW / 340;                         // 环画框 (340 宽) → 卡宽
  const DXC = 170;                            // 环心横位 (画框坐标, 与 donutSvg 同)
  const fmt = n => n.toFixed(2);              // 金额口径与 stats.js 同一副
  // 量高先行: 头 (标题+副题) + 每张卡 (板头 + 环 + 榜行 + 尾垫) + 卡距 +
  // 尾 (发丝线 + 落款) — 量完开画布, 一次画完不返工
  let h = 62;
  for (const b of rep.boards)
    h += HD + DN_PAD + 218 * s + b.rows.length * ROW_H + 10 + 14;
  h += 32;
  const canvas = document.createElement("canvas");
  canvas.width = W * PX;
  canvas.height = Math.round(h) * PX;
  const ctx = canvas.getContext("2d");
  ctx.scale(PX, PX);
  ctx.fillStyle = SHOT_C.bg;
  ctx.fillRect(0, 0, W, h);
  const text = (str, x, y, px, color, align = "left", weight = "") => {
    ctx.fillStyle = color;
    ctx.font = `${weight ? weight + " " : ""}${px}px ${SHOT_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  };
  const rrect = (x, y, w, hh, r) => {        // 圆角矩形 (roundRect 老 Safari 没有)
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, hh, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hh, r);
    ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  // 段弧: svg circle 的 r 是描边中心线 — canvas 弧取同一个 r, 线宽即描边
  // 宽; 起手正上 (与 rotate(-90) 同效) 顺时针铺开
  const arc = (cx, cy, r, sw, color, off, w) => {
    const a = x => (x / 100 - 0.25) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = sw;
    ctx.arc(cx, cy, r, a(off), a(off + w));
    ctx.stroke();
  };
  text(rep.title, PAD, 30, 17, SHOT_C.ink1, "left", "650");   // 头: 范围起止
  text(rep.sub, PAD, 50, 11, SHOT_C.ink3, "left");            // 副题: 档位·笔数·筛选
  let y = 62;
  for (const b of rep.boards) {
    const d = b.donut;                        // 版面同款解: segs 段 + cols 引标
    const cardH = HD + DN_PAD + 218 * s + b.rows.length * ROW_H + 10;
    ctx.fillStyle = SHOT_C.card;              // 卡面: 平贴黑底不投影, 发丝描边
    rrect(PAD, y, CW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = SHOT_C.hair;
    ctx.lineWidth = 1;
    rrect(PAD + 0.5, y + 0.5, CW - 1, cardH - 1, 13.5);
    ctx.stroke();
    text(b.label, PAD + PADX, y + 28, 17, SHOT_C.ink1, "left", "650");   // 板头
    text(`${b.count}笔`, PAD + CW - PADX, y + 28, 11.5, SHOT_C.ink3, "right");
    // 环: 与 donutSvg 同一副几何 — 双层弧 (外原色内深一档), 折线引标 (径向
    // 短戳 + 一弯 + 水平尾), 两侧标签 (名+占比, 线尾竖列对齐), 环心合计
    ctx.save();
    ctx.translate(PAD, y + HD + 20);          // 环框左上角 (donut-box 顶垫 20, 同步页面)
    ctx.scale(s, s);
    for (const sg of d.segs) {
      const cum = -sg.off;                    // 段首 (pathLength 百分制 → 弧位)
      arc(DXC, d.cy, 65, 14, sg.c, cum, sg.w);       // 外带原色
      arc(DXC, d.cy, 54, 9, sg.c2, cum, sg.w);       // 内带深一档 (stats.js 预备)
    }
    for (const col of d.cols) {
      if (!col.length) continue;
      const sx = col.right ? 1 : -1;
      for (const it of col) {
        const r2 = it.dy ? (it.b - d.cy) / it.dy : 78;   // 标签高度反推弯折半径
        ctx.beginPath();                     // 线色跟段走, 字穿字色不穿段色
        ctx.strokeStyle = it.s.c;
        ctx.lineWidth = 1;
        ctx.moveTo(DXC + 72.5 * it.dx, d.cy + 72.5 * it.dy);   // 环沿外 0.5, ⊥弧起手
        ctx.lineTo(DXC + r2 * it.dx, it.b);
        ctx.lineTo(it.lx, it.b);
        ctx.stroke();
        text(it.s.raw, it.lx + 5 * sx, it.b + 3.5, 11, SHOT_C.ink2,
             col.right ? "left" : "right");
      }
    }
    const amt = `¥${fmt(d.total)}`;           // 环心合计 (长数降档, 与版面同规)
    text(amt, DXC, d.cy - 2, amt.length > 10 ? 10.5 : amt.length > 7 ? 13 : 17,
         SHOT_C.ink1, "center", "650");
    text(`${b.label}合计`, DXC, d.cy + 16, 10.5, SHOT_C.ink3, "center");
    ctx.restore();
    // 条形榜: 行首图标 + 三行两列, 色条与环同源 (条按榜首归一)
    let ry = y + HD + DN_PAD + 218 * s;
    const max = b.rows[0].amt || 1;
    for (const r of b.rows) {
      const x0 = PAD + PADX;                  // 图标井: 34×34, 行内垂直居中
      if (r.icon) ctx.drawImage(r.icon, x0, ry + 16, ICON, ICON);
      else {                                  // 「其他」行没有本体图标: 灰圆垫底
        ctx.fillStyle = SHOT_C.other;
        ctx.beginPath();
        ctx.arc(x0 + ICON / 2, ry + 16 + ICON / 2, ICON / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const tx = PAD + TX;                    // 文字列: 图标右侧 11
      const tw = CW - TX - PADX;              // 文字列宽 (右留 14)
      text(r.name, tx, ry + 23, 13.5, SHOT_C.ink1, "left");          // 上行: 名…金额
      text(`¥${fmt(r.amt)}`, PAD + CW - PADX, ry + 23, 13, SHOT_C.ink2, "right", "600");
      const bw = Math.max(3, Math.min(100, r.amt / max * 100));
      ctx.fillStyle = SHOT_C.track;           // 中行: 轨道垫底, 色条按比例盖上去
      rrect(tx, ry + 32, tw, 6, 3);
      ctx.fill();
      ctx.fillStyle = r.color;
      rrect(tx, ry + 32, tw * bw / 100, 6, 3);
      ctx.fill();
      text(`${r.n}笔`, tx, ry + 55, 11.5, SHOT_C.ink3, "left");      // 下行: 笔数…占比
      text(r.pct, PAD + CW - PADX, ry + 55, 11.5, SHOT_C.ink3, "right");
      ry += ROW_H;
    }
    y += cardH + 14;
  }
  ctx.fillStyle = SHOT_C.hair;               // 尾: 发丝线 + 落款 (生成日子)
  ctx.fillRect(PAD, h - 34, CW, 1);
  text(`My Money · ${rep.date} 生成`, W / 2, h - 16, 10, SHOT_C.ink3, "center");
  return canvas;
}
