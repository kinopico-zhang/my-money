// bookkeeping-stats — 统计视图 (1.8.0 起住推入层): 读本地账本 (localStorage,
// 与记账页同一份 — 离线优先, 断网也能看)。1.14.0 大改: 顶部时间范围、筛选
// (维度内多选 OR、维度间 AND)、大类/小类两档视图、每档收支两个版面 — 版面
// 上圆环图下条形榜 (图标/金额/笔数/占比); 1.15.0 起筛选只剩类别/标签两维
// (成员退役, 两页制 — 类别一页/标签一页), 10-10 存图: 报表落成一张 canvas
// 海报存进手机相册 (画师在 bookkeeping-report-shot.js, 这边只备料接线)。
// 范围与档位记在 localStorage
// (下次打开还在); 筛选是即兴查询不落盘 — 重开自动清零, 免得「怎么账少了
// 一截」看半天。渲染函数模式照 my-music 的 music-stats-view, 渲染目标由
// 调用方给。
"use strict";
/* global catIcon, setCatColors, catIconSvg, pushView, openSheet, buildReportCanvas */
/* exported renderStatsView, renderCatSubsView, renderCatEntriesView */

// 圆环图分类色: dataviz 参考色板暗色列前 7 槽 (validate_palette.js 对卡面
// #1c1c1e 验过: 邻对 CVD ΔE 8.4 / 常视 19.3 / 对比度全 ≥3:1)。按金额排名
// 上色而非跟实体走 — 换个时间段排名变了颜色跟着换, 但身份永远由名字扛
// (圆环有折线引标, 条形榜有行首图标+名字, 颜色不是唯一通道)。1.15.0 起
// 条形榜与折线引标同吃这套色 — 环里那段、榜里那根、引标那线, 三处一个
// 颜色。第 8 段「其他」用中性灰, 不占色槽。
const STATS_RING_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500",
                           "#d55181", "#008300", "#9085e9"];
const STATS_OTHER_COLOR = "#555559";
// 圆环双层 (1.15.0 用户点名「要有层次感」): 外带原色扛身份 (榜与引标同
// 色), 内带同色系加深一档 — RGB 等比缩放, 动的是明度, 色相饱和度不动
const dk = (hex, f) => "#" + [16, 8, 0].map(sh => Math.round(
  (parseInt(hex.slice(1), 16) >> sh & 255) * f).toString(16).padStart(2, "0")).join("");
// 1.15.0 范围控件定案 (2026-10-09 两轮收口, 10-10 五收): 五枚 全部/年/季/
// 月/周 住「时间范围」弹层顶上 — 档定步数; 下头 ‹› 步进器与范围显示合一
// (10-10 用户点名): 当中直接报这段从哪天到哪天 (两头都全到年月日), ‹› 按
// 选中的档把整段一步步平移 (› 封顶现在), 日历联动 — 落到段起点那个月、这段
// 日子亮成选区, 换月带滑入动画; 自定义不占档, 日历里点两天即自定义 (自定义
// 态 ‹› 兼职翻月历 — 跨月区间的尾点就靠这够到); 日历自己也能左右划着翻月
// (纯翻月不动草稿, 封顶现在), 下头一行报当前翻到哪年哪月; 档钮/日历/步数
// 全是草稿, 确定 才生效 (取消/遮罩/✕ 扔草稿); 各档亮足自然段不截今天 (10-10
// 起, 标题恒报起止 — 截到今天就残)。旧存档里的日/滚动窗档已无处可点, 载入
// 时落回月档; 存档里的自定义档照用 (日历预选回那段)
const STATS_MODES = ["all", "year", "quarter", "month", "week", "custom"];
// 可步进的档: ‹› 整段平移的步数单位; 全部/自定义没步数 — 两枚箭头收起
const STATS_SHIFTABLE = ["year", "quarter", "month", "week"];
// 下钻两层 (1.15.0): 大类行 → 小类明细层, 小类行 → 具体明细层。渲染真身
// 在 renderStatsView 里填 (要闭包用 st/sel/工具函数), push.js 按全局名请
let renderCatSubsView = () => {};
let renderCatEntriesView = () => {};

function renderStatsView(target) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pad = n => String(n).padStart(2, "0");
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const loadLS = (key, fb) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fb; }
    catch (_e) { return fb; }
  };
  const saveLS = (key, v) => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_e) { /* 禁写: 记不住就回默认 */ }
  };
  // 报表金额给足位数 (2026-10-09 用户点名「不要xx万」): 与记账页行同一副
  // toFixed(2) 写法, 环心合计长了自动降字号 (见 .dn-total.sm/.xs)
  const fmt = n => n.toFixed(2);
  const q = s => target.querySelector(s);
  let all = loadLS("bk-entries", []).filter(e => !e.deleted);   // 整本账 (选项与统计都从这出; 改完账重拉)

  // ---- 状态: 范围 (mode/shift/custom) + 档位 (gran) 落盘; 筛选 (sel) 即兴 ----
  let st = { mode: "month", shift: 0, custom: null, gran: "top" };
  const saved = loadLS("bk-stats-v1", null);
  if (saved && typeof saved === "object" && STATS_MODES.includes(saved.mode)) {
    st.mode = saved.mode;
    st.shift = Math.max(0, Number(saved.shift) || 0);   // 步数只往过去存
    st.gran = saved.gran === "sub" ? "sub" : "top";
    if (Array.isArray(saved.custom) && saved.custom.length === 2 &&
        saved.custom.every(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))) {
      st.custom = saved.custom.slice().sort();   // 零填 ISO 串, 字典序即时间序
    }
  }
  if (st.mode === "custom" && !st.custom) st.mode = "month";
  if (!STATS_SHIFTABLE.includes(st.mode)) st.shift = 0;   // 没步数的档步数归零
  const sel = { cats: new Set(), tags: new Set(), excl: new Set() };   // 10-10 成员维度退役 (不按人统计); excl = 大类罩着时被单摘的小类键 (2026-10-15)

  // ---- 时间范围: [from, to] 含两端; 各档亮足自然段 (月到底/季到季末/年到
  // 尾/周整周) 不截今天 — 顶行标题恒报起止, 截到今天标题就残 (周档先例
  // 2026-10-10 推广全档); 全部档 = 最早一笔 ~ 最后一笔。shift = ‹› 从当前
  // 段往回数的步数 (档在哪枚, 一步就是多大 — 年一岁/季一季/月一月/周一圈)。
  // 带参版给时间范围框里的草稿 (dr) 用 — 草稿没落账前, 步进/日历联动/自定
  // 义都按草稿算, 真身 st 一根汗毛不动 ----
  function computeRange(s = st) {
    if (s.mode === "custom" && s.custom) return s.custom;
    const now = new Date();
    const today = dateStr(now);
    if (s.mode === "all") {                     // 全部: 最早一笔 ~ 最后一笔
      let lo = "", hi = "";
      for (const e of all) {
        const d = String(e.date || "");
        if (!d) continue;
        if (!lo || d < lo) lo = d;
        if (d > hi) hi = d;
      }
      return lo ? [lo, hi] : [today, today];
    }
    if (s.mode === "year") {
      const y = now.getFullYear() - s.shift;
      return [`${y}-01-01`, `${y}-12-31`];
    }
    if (s.mode === "quarter") {                 // 季: 自然季 (1-3/4-6/7-9/10-12 月)
      const qs = new Date(now.getFullYear(),
        Math.floor(now.getMonth() / 3) * 3 - s.shift * 3, 1);   // 月序跨年自归位
      return [dateStr(qs), dateStr(new Date(qs.getFullYear(), qs.getMonth() + 3, 0))];
    }
    if (s.mode === "week") {                    // 周: 周一起头, 周日收尾 — 整周
      const w = new Date(now.getFullYear(), now.getMonth(),
                         now.getDate() - s.shift * 7);
      w.setDate(w.getDate() - (w.getDay() + 6) % 7);   // 退到那周的周一
      return [dateStr(w), dateStr(new Date(w.getFullYear(), w.getMonth(),
                                          w.getDate() + 6))];
    }
    const base = new Date(now.getFullYear(), now.getMonth() - s.shift, 1);
    const from = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`;
    return [from, dateStr(new Date(base.getFullYear(), base.getMonth() + 1, 0))];
  }

  // 日期简写 (用户点名「日期采用2026/10这种简写」): 斜杠短过一切中文说法。
  // 2026-10-10 顶行标题恒报起止 (用户点名), 年头带在起端 — 同年区间尾端
  // 省年不丢年 (翻回 2025 也有年认), 跨年两头都带全
  function spanTitle(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    if (a === b) return `${ay}/${am}/${ad}`;
    if (ay === by) return `${ay}/${am}/${ad} ~ ${bm}/${bd}`;
    return `${ay}/${am}/${ad} ~ ${by}/${bm}/${bd}`;
  }
  const dSlash = s => { const [y, m, d] = s.split("-").map(Number);
    return `${y}/${m}/${d}`; };   // 单头全日期 — 弹层里那行两头都全到年月日

  function rangeTitle(range, mode = st.mode) {   // mode 带参: 草稿预览用草稿的档
    if (mode === "all" && !all.length) return "全部";
    return spanTitle(range[0], range[1]);   // 各档都亮具体起止 (空账本除外)
  }

  // ---- 筛选 (10-10 两页制: 类别一页/标签一页, 成员维度退役): 维度内多选
  // OR, 维度间 AND; 选项从整本账取 (换范围不缩选项) ----
  const topOf = e => String(e.category || "其他").split("/")[0];
  const kindOf = e => (e.kind === "income" ? "income" : "expense");
  const tagsOf = e => String(e.tags || "").split(",").map(s => s.trim()).filter(Boolean);
  const hasFilters = () => sel.cats.size + sel.tags.size > 0;
  // 勾选键 → 命中: 大类键 (kind|大类) 比大类, 小类键 (kind|大类/小类) 比全路径
  // (斜杠只可能出现在竖线之后 — 大类名里没有斜杠, 小类键本身就是 大类/小类)。
  // 大类键罩整类, 名下被单摘的小类记在 excl (键同小类键): 大类命中后再对一
  // 下账目全路径, 对上被摘的键就不算 — 光秃大类 (账目 category 就是大类名,
  // 没落小类) 对不上任何被摘键, 照算 (2026-10-15 大类勾子类自动勾上配套)
  const catHit = (e, k) => {
    const bar = k.indexOf("|");
    if (kindOf(e) !== k.slice(0, bar)) return false;
    if (k.includes("/", bar)) return String(e.category || "") === k.slice(bar + 1);
    const top = k.slice(bar + 1);
    return topOf(e) === top &&
      !sel.excl.has(`${k}/${String(e.category || "").slice(top.length + 1)}`);
  };
  function matchFilters(e) {
    if (sel.cats.size && ![...sel.cats].some(k => catHit(e, k))) return false;
    if (sel.tags.size && !tagsOf(e).some(t => sel.tags.has(t))) return false;
    return true;
  }

  // ---- 聚合: [[key, 金额, 笔数]] 按金额降序 (key = 大类名或全路径, 看档位) ----
  function aggPairs(rows, keyFn) {
    const m = new Map();
    for (const e of rows) {
      const k = keyFn(e);
      const c = m.get(k) || { amt: 0, n: 0 };
      c.amt += Number(e.amount || 0);
      c.n += 1;
      m.set(k, c);
    }
    return [...m].map(([k, c]) => [k, c.amt, c.n]).sort((a, b) => b[1] - a[1]);
  }

  // 占比口径一处定义 (榜的 .pct 与圆环标签共用): 四舍五入整百分比, 够大算
  // 满, 太小露 <1%
  const pctTxt = (amt, total) => {
    const p = total > 0 ? amt / total * 100 : 0;
    return p >= 99.95 ? "100%" : p < 1 ? "<1%" : `${Math.round(p)}%`;
  };

  // 圆环: 金额前 7 名各占一槽, 尾巴归「其他」(灰)。pathLength=100 让弧长按
  // 百分比直写; 段与段紧挨不留缝 (2026-10-09 用户点名「不要有间隙」), 各段
  // 两头各叠 0.3 份盖掉抗锯齿的发丝缝; 太薄的段垫到 1.2 份保可见再整体
  // 归一 (精确数在行里, 环只管形状)。
  // 1.15.0 圆环放大成双层 (用户点名「半径太小、宽度也小」「要有层次感」, 又
  // 定案两圈紧贴、内圈收窄): 外带 [58,72] 原色, 内带 [49.5,58.5] 紧贴外带
  // 里沿 (叠 0.5 防露缝) 同色系深一档 (dk) — 深浅两道叠出层次; 环沿 72
  // (原 58.5), 引标从 72.5 起戳; 画框加高 208 → 218, 挤档时环心有得往下探
  // (梯子最深 136)。
  // 折线引标 (用户定案: 起点⊥弧 + 只弯一次 + 末段水平): 一根线 = 径向短戳
  // (弧中点沿半径向外) + 水平尾段, 弯折点还落在自身射线上 — 标签高度因此
  // 只能沿这条射线挪: 上半边的行只能上够、下半边只能下探, 上下界三处掐住
  // (最短戳别贴环 / 别伸进本侧标签列 / 别出画框)。同侧按角序排开 (这个顺序
  // 就是标签高度序, 乱序必交叉), 挤了先把 12 点钟扎堆的竖直射线匀去对侧
  // (两边分), 再缩档距 (地板 14, 不低于文字行高)、再挪环心 (环往对头沉 —
  // 环心一变, 两侧上下界整组跟着变); 标签少的档环居中一个不动。线色跟段走,
  // 线尾旁写类别名和占比 (名字与条形行同源, 小类页只露末段名; 占比与榜
  // 同一副 pctTxt 口径); 同侧线尾对齐成一竖列 (量宽按原文 — 转义串虚胖)
  // 落位算式拆成纯几何 (1.15.0 报表海报): svg 版面与画布画师共用一副 —
  // 10-10 用户点名海报要跟界面一个长相, 两边各画各的迟早走样; 常量随算式
  // 提在外层, 出口是解 (segs 段 + cols 两侧标签列 + cy 环心), 不带 DOM
  const CX = 170, RO = 65, RI = 54;            // 双层环: 外带中心 65 宽 14, 内带中心 54 宽 9 (里沿叠 0.5 不露缝)
  const TOP = 10, BOT = 208, R2MIN = 78;      // 戳长下限: 与环沿 (72) 留 6 缝
  function donutLayout(pairs) {
    const total = pairs.reduce((a, p) => a + p[1], 0);
    if (total <= 0) return null;
    const segs = pairs.slice(0, 7).map((p, i) => ({
      c: STATS_RING_COLORS[i], nm: String(p[0]).split("/").pop(), amt: p[1]   // 原文, 出口再转义
    }));
    const rest = total - segs.reduce((a, s) => a + s.amt, 0);
    if (rest > 0.005) segs.push({ c: STATS_OTHER_COLOR, nm: "其他", amt: rest });
    for (const s of segs) {                     // 标签带占比 (与榜同一副口径);
      s.raw = `${s.nm} ${pctTxt(s.amt, total)}`;      // 量宽按原文 (转义串的
      s.lb = esc(s.raw);                        // &lt; 比真身长 3 字, 量了虚胖)
    }
    const raw = segs.map(s => Math.max(s.amt / total * 100, 1.2));
    const k = 100 / raw.reduce((a, x) => a + x, 0);
    let cum = 0;
    segs.forEach((s, i) => {
      const pct = raw[i] * k;
      s.off = -cum;                             // 段首偏移 (pathLength 百分制)
      s.w = pct + 0.3;                          // 满占 + 微叠: 相邻段压住发丝缝
      s.mid = (-90 + (cum + pct / 2) * 3.6) * Math.PI / 180;   // 段中角 (弧度)
      cum += pct;
    });
    const txW = nm => [...nm].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 11 : 6.5), 0);
    const cols = [[], []];
    for (const s of segs) {
      const dx = Math.cos(s.mid), dy = Math.sin(s.mid);
      cols[dx >= 0 ? 1 : 0].push({ s, dx, dy, lx: 0, b: 0, lo: 0, hi: 0 });
    }
    // 12 点钟扎堆两边分 (10-11 用户报「饼图的文字被挡住了」: 段全挤在 12
    // 点钟一侧时, 同侧一列排七八枚, 梯子压到地板也排不下 — 地板 12, 文字
    // 行高 ~14.7, 相邻两行的字压在一起)。近竖直的射线 (|dy| ≥ .95) 两边
    // 都能去: 它的标签带整条落在环沿外 (|b-cy| ≥ 74), 尾巴横穿环顶/环底
    // 上空, 不切环; 挑最竖直的那枚往人少的一侧匀, 匀到两侧差不足两枚
    for (;;) {
      const big = cols[0].length >= cols[1].length ? cols[0] : cols[1];
      const small = cols[big === cols[0] ? 1 : 0];
      if (big.length - small.length < 2) break;
      let pick = -1;
      for (let i = 0; i < big.length; i++)
        if (Math.abs(big[i].dy) >= .95 &&
            (pick < 0 || Math.abs(big[i].dx) < Math.abs(big[pick].dx))) pick = i;
      if (pick < 0) break;                        // 没有可挪的竖直射线了
      small.push(big.splice(pick, 1)[0]);
    }
    cols.forEach((col, ci) => {                 // 中角朝哪边线去哪边
      col.right = ci === 1;
      // 同侧线尾对齐成一竖列 (2026-10-09 用户报「小类页文字没对齐」: 名字
      // 两字到四字不等, 各自按自家宽留位时线尾东一个西一个) — 列里最宽者
      // 定音, 文字贴着列边排齐
      const wMax = Math.max(...col.map(it => txW(it.s.raw)));
      const lx = col.right ? 329 - wMax : 11 + wMax;
      col.forEach(it => { it.lx = lx; });
      col.sort((a, b) => a.dy - b.dy);
    });
    // 顺链落位 (place): M 链自底向上先算每行至多落多低 (给下面的留档距),
    // 再自上而下落 — 自然位被顶就顺档下移; 全落进各自界内才算这档距成
    const place = (col, cy, gap) => {
      const n = col.length, M = new Array(n);
      M[n - 1] = col[n - 1].hi;
      for (let i = n - 2; i >= 0; i--) M[i] = Math.min(col[i].hi, M[i + 1] - gap);
      let prev = -1e9, ok = true;
      for (let i = 0; i < n; i++) {
        const v = Math.min(M[i], Math.max(cy + 80 * col[i].dy, col[i].lo, prev + gap));
        if (v < col[i].lo - .01 || (i && v < prev + gap - .01)) ok = false;
                                                  // 顶出上界, 或 M 封顶把行
                                                  // 距压破地板 — 都算放不下
        col[i].b = v;
        prev = v;
      }
      return ok;
    };
    const solveSide = (col, cy) => {
      const edge = col.right ? Math.min(...col.map(it => it.lx)) - 6
                             : Math.max(...col.map(it => it.lx)) + 1;   // 标签列横界
      for (const it of col) {
        const reach = Math.max(R2MIN, Math.min(  // 戳长上限: 纵不出框, 横不进标签列
          (it.dy > 0 ? BOT - cy : cy - TOP) / Math.max(Math.abs(it.dy), 1e-6),
          Math.abs(edge - CX) / Math.max(Math.abs(it.dx), 1e-6)));
        const ys = [cy + R2MIN * it.dy, cy + reach * it.dy];
        it.lo = Math.min(ys[0], ys[1]);          // 这行标签最高/最低可达
        it.hi = Math.max(ys[0], ys[1]);
      }
      for (let gap = 16.5; gap >= 14; gap -= 0.5)
        if (place(col, cy, gap)) return true;
      place(col, cy, 14);                        // 兜底: 容许顶出上界 (罕见)
                                                  // 地板 14: 行高 ~14.7 的字
                                                  // 相邻两行至少留出字腹
      return false;
    };
    let cy = 0;                                  // 环心纵位: 居中优先, 挤了往对头沉
    for (const c of [104, 114, 94, 124, 84, 136, 82])   // 环沿 72 → 环心 [82, 136]
      if (cols.every(col => !col.length || solveSide(col, c))) { cy = c; break; }
    if (!cy) {
      cy = 104;
      cols.forEach(col => { if (col.length) solveSide(col, cy); });
    }
    return { segs, cols, cy, total };
  }
  function donutSvg(pairs, label) {
    const L = donutLayout(pairs);
    if (!L) return "";
    const { segs, cols, cy, total } = L;
    // 双层弧: 同一段两圈共用偏移/弧长 (内外同步), 外圈原色, 内圈深一档;
    // dn-arc 类挂着扫开进场动画 (CSS @keyframes, 换档重建自动重放)
    const arcs = segs.map(s => {
      const dash = `pathLength="100" fill="none" stroke-dasharray="${s.w.toFixed(2)} ${(100 - s.w).toFixed(2)}" stroke-dashoffset="${s.off.toFixed(2)}" transform="rotate(-90 ${CX} ${cy})"`;
      return `<circle class="dn-arc" cx="${CX}" cy="${cy}" r="${RO}" stroke="${s.c}" stroke-width="14" ${dash}/>` +
        `<circle class="dn-arc" cx="${CX}" cy="${cy}" r="${RI}" stroke="${dk(s.c, 0.7)}" stroke-width="9" ${dash}/>`;
    }).join("");
    let leads = "";
    for (const col of cols) {
      if (!col.length) continue;
      const sx = col.right ? 1 : -1;
      for (const it of col) {
        const r2 = it.dy ? (it.b - cy) / it.dy : R2MIN;   // 标签高度反推弯折半径
        const pts = [[CX + 72.5 * it.dx, cy + 72.5 * it.dy],  // 环沿外 0.5, ⊥弧起手
                     [CX + r2 * it.dx, it.b], [it.lx, it.b]]
          .map(pt => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
        leads += `<polyline class="dn-lead" stroke="${it.s.c}" points="${pts}"/>` +
          `<text class="dn-lbl" x="${it.lx + 5 * sx}" y="${(it.b + 3.5).toFixed(1)}" text-anchor="${col.right ? "start" : "end"}">${it.s.lb}</text>`;
      }
    }
    // 环心合计给足位数后可能很长 (¥1234567.89): 按位数降档字号, 不撑出环心
    const amt = `¥${fmt(total)}`;
    const sz = amt.length > 10 ? " xs" : amt.length > 7 ? " sm" : "";
    return `<svg viewBox="0 0 340 218" role="img" aria-label="${label}构成">${arcs}${leads}` +
      `<text class="dn-total${sz}" x="${CX}" y="${cy - 2}" text-anchor="middle">${amt}</text>` +
      `<text class="dn-label" x="${CX}" y="${cy + 16}" text-anchor="middle">${label}合计</text></svg>`;
  }

  // 条形行 (1.15.0 三行两列): [图标] 上行 类别…金额 / 中行整条分类色条 /
  // 下行 笔数…占比。色跟实体走 — 条子吃圆环同色 (行内 inline, 前 7 名槽色,
  // 榜外灰「其他」), 行首色点与方向红绿都退役 (颜色进了条子, 点就多余了)。
  // 类别名只露末段 (小类页键是全路径, split 尾段即小类名 — 与圆环引标同源)。
  // 行可点 (1.15.0 下钻): data-k 带全键 — 大类页点开小类明细, 小类页点开
  // 具体明细。条子进场错峰长出 (用户点名「要有动画」): 行内 animation-delay
  // 按榜位递增, CSS 动画从零长到行内宽度
  function rowHtml(key, amt, n, kind, total, max, color, idx) {
    const w = Math.max(3, Math.min(100, amt / (max || 1) * 100));
    const dly = Math.min((idx || 0) * 45, 360);   // 错峰: 45ms 一根, 封顶 360ms
    return `<div class="cat-row" data-k="${esc(key)}">` +
      `<span class="cat-ic">${catIcon(key, kind)}</span><span class="cat-main">` +
      `<span class="cat-top"><span class="cat-nm">${esc(key.split("/").pop())}</span>` +
      `<span class="cat-amt">¥${fmt(amt)}</span></span>` +
      `<span class="bar"><i style="width:${w.toFixed(1)}%;background:${color};animation-delay:${dly}ms"></i></span>` +
      `<span class="cat-bot"><span class="cat-n">${n}笔</span>` +
      `<span class="pct">${pctTxt(amt, total)}</span></span></span></div>`;
  }

  function renderBoard(box, kindRows, kind, gran) {
    const total = kindRows.reduce((a, e) => a + Number(e.amount || 0), 0);
    box.count.textContent = kindRows.length ? `${kindRows.length}笔` : "";
    if (!kindRows.length) {
      box.donut.innerHTML = "";
      box.rows.innerHTML = "";
      if (box.empty) {
        box.empty.hidden = false;
        box.empty.textContent = hasFilters() ? `没有符合条件的${box.noun}` : `这段时间还没有${box.noun}`;
      }
      if (box.card) box.card.hidden = true;   // 收入版面: 没收入不占地方
      return;
    }
    if (box.empty) box.empty.hidden = true;
    if (box.card) box.card.hidden = false;
    const keyFn = gran === "top"
      ? e => String(e.category || "其他").split("/")[0]
      : e => String(e.category || "其他");
    const pairs = aggPairs(kindRows, keyFn);
    box.donut.innerHTML = donutSvg(pairs, kind === "income" ? "收入" : "支出");
    // 条形榜: 一张平榜从高到低 (1.15.0 小类页去大类分组 — 没有层级关系,
    // 与大类页同一副行式, 只是键取全路径); 条按榜首归一, 色跟圆环名次走
    // (前 7 名槽色, 榜外灰「其他」)
    const max = pairs[0][1] || 1;
    box.rows.innerHTML = pairs.map((p, i) =>
      rowHtml(p[0], p[1], p[2], kind, total, max,
              i < 7 ? STATS_RING_COLORS[i] : STATS_OTHER_COLOR, i)).join("");
  }

  // 当前范围+筛选下的活行 (报表版面与下钻层共用同一份口径)
  function currentRows() {
    const [from, to] = computeRange();
    return all.filter(e => String(e.date || "") >= from &&
                           String(e.date || "") <= to && matchFilters(e));
  }

  // ---- 下钻两层 (1.15.0 用户点名): 大类行 → 小类明细层 (cat-subs), 小类行
  // (小类页里、或小类明细层里再点) → 具体明细层 (cat-entries)。口径与版面
  // 同源 (currentRows: 当前范围 + 筛选), 渲染真身填给 push.js 按全局名请 ----
  let drillReq = null;   // 点行时落, 铺层时取 (层壳次次新建, 不存在复用旧货)
  function openCatSubs(cat, kind) {
    const rows = currentRows().filter(e => kindOf(e) === kind && topOf(e) === cat);
    const pairs = aggPairs(rows, e => String(e.category || "其他"));
    if (pairs.length === 1 && !pairs[0][0].includes("/")) {
      openCatEntries(pairs[0][0], kind);   // 这个大类没有小类: 直达具体明细
      return;
    }
    drillReq = { cat, kind };
    pushView("cat-subs");
  }
  function openCatEntries(cat, kind) {
    drillReq = { cat, kind };
    pushView("cat-entries");
  }
  renderCatSubsView = pane => {              // 小类明细: 同一副条形行, 点行再下钻
    const req = drillReq || { cat: "", kind: "expense" };
    const rows = currentRows().filter(e => kindOf(e) === req.kind && topOf(e) === req.cat);
    const pairs = aggPairs(rows, e => String(e.category || "其他"));
    const total = rows.reduce((a, e) => a + Number(e.amount || 0), 0);
    const max = pairs[0] ? pairs[0][1] || 1 : 1;
    pane.innerHTML =
      `<div class="pane-title">${esc(req.cat)}</div>` +
      `<div class="dr-sum">${rows.length}笔 · ¥${fmt(total)}` +
      `<span>${req.kind === "income" ? "收入" : "支出"}小类</span></div>` +
      (pairs.length ? `<div class="card" id="dr-rows">${pairs.map((p, i) =>
        rowHtml(p[0], p[1], p[2], req.kind, total, max,
                i < 7 ? STATS_RING_COLORS[i] : STATS_OTHER_COLOR, i)).join("")}</div>`
        : `<div class="empty">这段时间${esc(req.cat)}还没有${req.kind === "income" ? "收入" : "支出"}</div>`);
    const box = pane.querySelector("#dr-rows");
    if (box) box.addEventListener("click", ev => {
      const row = ev.target instanceof Element && ev.target.closest(".cat-row");
      if (row) openCatEntries(row.dataset.k, req.kind);   // 继续点: 看具体明细
    });
  };
  renderCatEntriesView = pane => {           // 具体明细: 与主页账目同一副行样式
    const req = drillReq || { cat: "", kind: "expense" };
    const rows = currentRows()
      .filter(e => kindOf(e) === req.kind && String(e.category || "其他") === req.cat)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));   // 新→老
    const total = rows.reduce((a, e) => a + Number(e.amount || 0), 0);
    pane.innerHTML =
      `<div class="pane-title">${esc(req.cat.split("/").pop())}</div>` +
      `<div class="dr-sum">${rows.length}笔 · ¥${fmt(total)}</div>` +
      (rows.length ? `<div class="card">${rows.map(e => {
        const bits = [];
        if (e.note) bits.push(esc(e.note));
        for (const t of tagsOf(e)) bits.push("#" + esc(t));
        return `<div class="entry" data-id="${esc(e.id)}"><div class="sw-body">` +
          `<div class="cat-dot">${catIcon(e.category, e.kind)}</div>` +
          `<div class="mid"><div class="l1">${esc(String(e.category || "其他").split("/").pop())}` +
          (bits.length ? ` <span class="sub">${bits.join(" ")}</span>` : "") + `</div>` +
          `<div class="l2">${spanTitle(String(e.date), String(e.date))} · ${esc(e.createdByName || "我")}</div>` +
          `</div><div class="amt${e.kind === "income" ? " in" : ""}">` +
          `${e.kind === "income" ? "+" : "-"}${fmt(Number(e.amount || 0))}</div>` +
          `</div></div>`;
      }).join("")}</div>` : `<div class="empty">这段时间还没有账</div>`);
    const list = pane.querySelector(".card");
    if (list) list.addEventListener("click", ev => {   // 点行开改账浮层 (用户点名)
      const row = ev.target instanceof Element && ev.target.closest(".entry");
      if (!row) return;
      const e = all.find(x => x.id === row.dataset.id);
      if (e) openSheet(e);   // 主页同一副浮层; 存/删完浮层自己收, 收完这边重铺
    });
  };

  // 改账后的新鲜度 (2026-10-09 用户点名「点开明细是需要可以编辑的」): 记账
  // 浮层存/删只重排主页, 这边守着它收起 — 现拉账本把报表版面和开着的下钻
  // 层重铺一遍 (从悬浮加号新记的账也走这条路, 报表不再是旧数)
  function refreshAfterEdit() {
    all = loadLS("bk-entries", []).filter(e => !e.deleted);
    render();
    for (const [view, fn] of [["cat-subs", renderCatSubsView],
                              ["cat-entries", renderCatEntriesView]]) {
      const pane = document.querySelector(
        `#push-stack .push-pane[data-view="${view}"] .pane-scroll`);
      if (pane) fn(pane);
    }
  }
  const sheetWatch = new MutationObserver(() => {
    if (!target.isConnected) { sheetWatch.disconnect(); return; }   // 层已拆: 别守了
    if (document.getElementById("sheet").hidden) refreshAfterEdit();
  });
  sheetWatch.observe(document.getElementById("sheet"),
                     { attributes: true, attributeFilter: ["hidden"] });

  // 范围滑块退役 (2026-10-09 六枚收进时间范围弹层): 弹层里的档钮静态高亮
  // 就够, 换档动画由圆环扫开/条子长出接管 (重建自动重放)

  function render() {
    const range = computeRange();
    // 五枚范围钮 (时间范围弹层里): 当前档亮 (自定义档无钮, 全不亮)
    target.querySelectorAll("#rg-seg button")
      .forEach(b => b.classList.toggle("on", b.dataset.mode === st.mode));
    q("#m-title").textContent = rangeTitle(range);   // 顶行恒报已生效的起止 (草稿在框里)
    const nf = sel.cats.size + sel.tags.size;
    const badge = q("#flt-n");
    badge.hidden = nf === 0;
    badge.textContent = String(nf);

    const rows = currentRows();
    const outRows = rows.filter(e => e.kind !== "income");
    const inRows = rows.filter(e => e.kind === "income");
    // 单页版面只铺当前视图 (10-15 下拉切换): 切视图时 renderBoard 整片重
    // 铺, 圆环扫开/条子长出的进场动画自动重放一遍
    renderBoard({ rows: q("#by-cat"), donut: q("#out-donut"),
                  empty: q("#cat-empty"), count: q("#out-n"), noun: "支出" },
                outRows, "expense", st.gran);
    renderBoard({ rows: q("#by-cat-in"), donut: q("#in-donut"),
                  empty: q("#cat-empty-in"), count: q("#in-n"),
                  card: q("#income-card"), noun: "收入" },
                inRows, "income", st.gran);
  }

  function apply() {
    saveLS("bk-stats-v1", st);
    render();
  }

  // ---- 时间范围框的草稿 (dr): 开框时从 st 拷一份, 档钮/日历改的都是
  // 草稿 (用户点名「点击确定的时候才生效」); 取消/遮罩/✕ = 扔草稿关框,
  // 下次开框重拷 — 真身 st 只在 确定 那一下才动 ----
  let dr = null;

  function syncRangeUI() {
    q("#rg-seg").querySelectorAll("button").forEach(
      b => b.classList.toggle("on", b.dataset.mode === dr.mode));
    const r = computeRange(dr);   // 合一行 (10-10 定案): 步进器当中就是时间
    q("#rs-title").textContent = dr.mode === "all" && !all.length   // 范围 —
      ? "全部" : `${dSlash(r[0])} - ${dSlash(r[1])}`;   // 两头都全到年月日
    q("#rc-ok").disabled = dr.mode === "custom" && !dr.custom;
    syncArrows();
  }

  // 范围弹层那本日历的状态 (年月 + 选区起止); › 的封顶要看日历翻到哪月,
  // 定义得排在 syncArrows 前头
  const cal = { y: 0, m: 0, a: null, b: null };

  // ‹› 三态: 年/季/月/周 = 按档步进 (› 封顶现在 — 未来没账); 全部 = 没上一步
  // 下一步, 两枚箭头收起; 自定义 = 步进没意义, 箭头兼职翻月历 (选区留着 —
  // 跨月区间的尾点就靠这够到), › 封顶本月。翻月封顶随月历走, renderCal 里
  // 也唤一次
  function syncArrows() {
    if (!dr) return;
    const step = STATS_SHIFTABLE.includes(dr.mode);
    const browse = dr.mode === "custom";
    q("#rs-prev").hidden = q("#rs-next").hidden = !(step || browse);
    q("#rs-prev").disabled = !(step || browse);
    q("#rs-next").disabled = browse
      ? `${cal.y}-${pad(cal.m)}` >= curMonth() : !step || dr.shift === 0;
  }

  // ---- 弹框 (层内 absolute — 层有 transform, fixed 会退化; 同 #cat-modal) ----
  // 1.15.0 修: 层栈 (z65) 压在 tab 栏 (z69) 底下, 层里的底装弹框 (筛选/日历)
  // 脚上的确定/取消被栏挡住点不到 — 弹框开着把整栈抬到 75 (栏 69 之上,
  // 类别选择 80 之下), 遮罩连 tab 栏一起盖住, 关框落回
  function showSheet(el) {
    el.hidden = false;
    document.getElementById("push-stack").classList.add("over");
    void el.offsetWidth;                        // 先落地再放滑入 (rAF 安静页会饿死)
    el.classList.add("on");
  }
  function hideSheet(el) {
    el.classList.remove("on");
    setTimeout(() => {
      if (!el.classList.contains("on")) el.hidden = true;
      if (!target.querySelector(".bk-sheet.on"))   // 没有别的框还开着才落栈
        document.getElementById("push-stack").classList.remove("over");
    }, 260);
  }

  // ---- 筛选弹框: 勾选即时进 sel, 完成才重渲染; 遮罩/✕/取消 撤回; 重置原地清 ----
  let selBackup = null;
  const fltOpen = new Set();          // 展开着的大类键 (默认全折叠, 会话内记性)
  // 类别树 (1.15.0 用户点名): 收入支出排成一棵树, 图标颜色分方向; 树没有就
  // 按账本现搭一层大类 (没建过类别也照样筛)
  function catTreeOf() {
    const t = loadLS("bk-categories-v2", null);
    if (t && (t.expense || t.income)) return t;
    const outC = new Set(), inC = new Set();
    for (const e of all) (kindOf(e) === "income" ? inC : outC).add(topOf(e));
    return { expense: [...outC].map(name => ({ name, children: [] })),
             income: [...inC].map(name => ({ name, children: [] })) };
  }
  const FT_CHK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FT_DASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const FT_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function buildFlt() {
    const tagM = new Map();
    for (const e of all) for (const t of tagsOf(e))   // 标签的份量 = 笔数
      tagM.set(t, (tagM.get(t) || 0) + 1);
    // 类别页一行 = 复选框 + 类别图标 + 名字 (+ 行尾展开钮); 小类行缩进, 折叠时不画。
    // 大类勾 = 整类 (2026-10-15 用户点名「选了大类, 子类要自动勾上」): 大类键
    // 在选, 名下小类行跟着亮; 摘单颗小类记在 excl (大类键不动 — 命中在 catHit
    // 里对掉, 光秃大类的账不误伤); 部分小类在选或整类摘过小类, 大类亮半选
    // (横杠), 点它一键勾满整类
    const exUnder = pk => [...sel.excl].some(x => x.startsWith(`${pk}/`));
    const row = (key, nm, sub, kids, pk) => {
      const on = pk                                     // 小类: 整类罩着 (没被摘) 或自己在选
        ? (sel.cats.has(pk) && !sel.excl.has(key)) || sel.cats.has(key)
        : sel.cats.has(key) && !exUnder(key);           // 大类: 在选且名下没摘过
      const some = !sub && !on && (exUnder(key)          // 整类在选但摘过小类
                                   || (kids || []).some(n => sel.cats.has(`${key}/${n}`)));
      return `<div class="ft-row${sub ? " sub" : ""}">` +
      `<button type="button" class="ft-chk${on ? " on" : some ? " some" : ""}"` +
      ` data-k="${esc(key)}" aria-label="勾选 ${esc(nm)}">${some ? FT_DASH : FT_CHK}</button>` +
      `<span class="ft-ic">${catIcon(key.slice(key.indexOf("|") + 1),
                                    key.slice(0, key.indexOf("|")))}</span>` +
      `<span class="ft-nm">${esc(nm)}</span>` +
      (kids && kids.length ? `<button type="button" class="ft-exp${fltOpen.has(key) ? " open" : ""}"` +
        ` data-g="${esc(key)}" aria-label="展开小类" aria-expanded="${fltOpen.has(key)}">${FT_CHEV}</button>` : "") +
      `</div>`;
    };
    const tree = catTreeOf();
    let rows = "";
    for (const kind of ["expense", "income"])       // 支出在前 — 账本的大头
      for (const g of tree[kind] || []) {
        const key = `${kind}|${g.name}`;
        const kids = g.children || [];
        rows += row(key, g.name, false, kids);
        if (fltOpen.has(key))
          rows += kids.map(n => row(`${key}/${n}`, n, true, null, key)).join("");
      }
    q("#flt-tree").innerHTML = rows;
    // 标签页 (10-10 用户点名「风格和类别类似」): 同一副行式 — 复选框 + 名字;
    // 按字典倒序排 (10-10 用户改口径「字典顺序倒排」 — 不按热度, 找字按序好翻)
    const tRow = k => `<div class="ft-row">` +
      `<button type="button" class="ft-chk${sel.tags.has(k) ? " on" : ""}"` +
      ` data-k="${esc(k)}" aria-label="勾选 ${esc(k)}">${FT_CHK}</button>` +
      `<span class="ft-nm">${esc(k)}</span></div>`;
    q("#flt-tags").innerHTML = tagM.size
      ? [...tagM.keys()].sort().reverse().map(tRow).join("")
      : '<div class="empty">还没有打过标签</div>';
  }
  function openFlt() {
    selBackup = { cats: new Set(sel.cats), tags: new Set(sel.tags),
                  excl: new Set(sel.excl) };
    buildFlt();
    showSheet(q("#flt-sheet"));
  }
  function closeFlt(ok) {
    if (!ok && selBackup) {                     // 遮罩/✕: 撤回弹框里勾过的
      sel.cats = selBackup.cats; sel.tags = selBackup.tags;
      sel.excl = selBackup.excl;
    }
    hideSheet(q("#flt-sheet"));
    if (ok) apply();
  }

  // ---- 时间范围弹层 (2026-10-09 用户点名「六枚收进子菜单, 跟自定义的日历
  // 融合到一起」; 10-10 收口五枚 + 步进器合一 + 划动翻月): 点时间标题弹出 —
  // 顶上五枚定步数 (点档 = 拉回当前段重新起算); 中间 ‹范围› 步进器与范围
  // 显示合一 — 当中恒报草稿段具体起止 (两头全到年月日), ‹› 按档把整段一步
  // 步平移 (› 封顶现在); 下半日历两点定区间 (同一天点两下 = 只看一天),
  // 日历可左右划翻月 (下头一行报着哪年哪月) + 确定落自定义 ----
  function openRange() {
    dr = { mode: st.mode, shift: st.shift,
           custom: st.custom ? [...st.custom] : null };
    const r = computeRange(dr);   // 联动: 日历落到草稿段起点那个月, 这段日子
    [cal.y, cal.m] = r[0].split("-").map(Number);   // 亮成选区 (起止+中间) —
    [cal.a, cal.b] = r;           // 开框不滑 (框自己滑进来, 日历别凑热闹)
    renderCal();
    syncRangeUI();
    showSheet(q("#cal-sheet"));   // 现查, 避开先引后定义 (fltSheet 同款约定)
  }
  // 草稿段一动 (点档 / ‹› 步进): 日历跟着联动 — 落到段起点那个月 (带滑入
  // 动画), 这段日子亮成选区 (起止两点+区间身)。自定义不走这 (它的 ‹› 只
  // 翻月, 选区在日历上点)
  function rangeFollow() {
    const r = computeRange(dr);
    [cal.a, cal.b] = r;
    calJump(+r[0].slice(0, 4), +r[0].slice(5, 7));
  }
  // 单张月格 (renderCal 拆出 — 跟手划月要三张同款: 当前月居中, 上/下月两翼
  // 候场; 恒 6 行, 10-10 用户点名: 换月面板不忽高忽低)
  const gridOf = (y, m) => {
    const first = new Date(y, m - 1, 1).getDay();   // 周日起, 与主页日历同序
    const days = new Date(y, m, 0).getDate();
    const today = dateStr(new Date());
    // 大月份水印 (10-11 用户点名「当月的时间, 放大占满整个日历, 放在日期的
    // 下面, 透过日期可以按到当前月份. 月份格式 yyyy/mm」): 每张月格自带一枚
    // yyyy/mm, 垫在日期底下 (z-index: -1 沉底), 划月时跟着各自的月份走 —
    // 原先日历底下那行小字年月随之退役
    let html = `<div class="rc-month-bg" aria-hidden="true">${y}/${pad(m)}</div>`;
    for (let i = 0; i < first; i++) html += '<span class="rc-blank"></span>';
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${pad(m)}-${pad(d)}`;
      const fut = ds > today;
      const cls = `rc-d${fut ? " fut" : ""}${ds === cal.a || ds === cal.b ? " sel" : ""}` +
        `${cal.a && cal.b && ds > cal.a && ds < cal.b ? " inr" : ""}${ds === today ? " today" : ""}`;
      html += `<button type="button" class="${cls}" data-d="${ds}"` +
        `${fut ? " disabled" : ""} aria-label="${m}月${d}日">${d}</button>`;
    }
    for (let i = first + days; i < 42; i++)        // 垫到恒 6 行 (10-10 用户
      html += '<span class="rc-blank"></span>';    // 点名: 换月面板不忽高忽低)
    return html;
  };
  function renderCal() {
    q("#rc-grid").innerHTML = gridOf(cal.y, cal.m);
    const pm = new Date(cal.y, cal.m - 2, 1);      // 两翼影子月: 划动的下一站,
    const nm = new Date(cal.y, cal.m, 1);          // 拖过去之前先画好候着
    q("#rc-pm").innerHTML = gridOf(pm.getFullYear(), pm.getMonth() + 1);
    q("#rc-nm").innerHTML = gridOf(nm.getFullYear(), nm.getMonth() + 1);
    // 两点流那两步提示 (先点哪天、再点哪天) 退役了 (10-11 用户点名「这类
    // 提示都不需要」): 选到哪一步, 步进器当中那行起止日期自己会说
    syncArrows();   // 自定义翻月的 › 封顶随月历走, 画一回对一回
  }

  // 日历跳月 (点档联动 / ‹› 步进 / 跟手划月 共用): 落到 y-m — 换了月放
  // 一记滑入动画, 往后翻从右进, 往回翻从左进 (跟子页面右进左回同一套方向
  // 语感); 同月也重画 (换档清了选区), 只是不放动画 (日期两点那类原地重画
  // 不走这); still = 跟手拖拽已经演完滑入 (轨道拉到位才换, 不再放动画)
  function calJump(y, m, still) {
    const later = y * 12 + m > cal.y * 12 + cal.m;
    const same = y === cal.y && m === cal.m;
    cal.y = y; cal.m = m;
    renderCal();
    if (same || still) return;
    const grid = q("#rc-grid");
    grid.classList.remove("cal-l", "cal-r");
    void grid.offsetWidth;            // 重排一下, 类重上动画才肯重放
    grid.classList.add(later ? "cal-r" : "cal-l");
  }

  // 大类/小类版面 (1.15.0): 10-15 切换收进卡题下拉 (用户点名「左上角的
  // 大类支出可以点击, 展开下拉菜单选视图」) — 横滑分页退役, 版面单页常驻
  // 裸 id, 切视图不换容器只换内容 (renderBoard 整片重铺, 圆环/条子进场
  // 动画照重放一遍); 两张卡的标题 (支出/收入 · 大类/小类) 都是同一状态的
  // 把手, 点哪张菜单从哪张卡头垂下。10-10 按记账人卡退役 (用户点名不按
  // 人统计); 标题随视图报 支出/收入 · 大类/小类 并放大 (用户点名) —
  // 标题即路牌, 切到哪个视图一看便知
  const boardCards = (cls) => `
    <div class="card">
      <div class="board-h">
        <button type="button" class="card-t gran-btn" aria-haspopup="menu" aria-expanded="false">
          <span class="gran-lb" data-noun="支出">支出${cls}</span>
          <svg class="gran-car" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="board-n" id="out-n"></span>
      </div>
      <div class="donut-box" id="out-donut"></div>
      <div id="by-cat"></div>
      <div class="empty" id="cat-empty" hidden>这段时间还没有支出</div>
    </div>
    <div class="card" id="income-card" hidden>
      <div class="board-h">
        <button type="button" class="card-t gran-btn" aria-haspopup="menu" aria-expanded="false">
          <span class="gran-lb" data-noun="收入">收入${cls}</span>
          <svg class="gran-car" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="board-n" id="in-n"></span>
      </div>
      <div class="donut-box" id="in-donut"></div>
      <div id="by-cat-in"></div>
      <div class="empty" id="cat-empty-in" hidden>这段时间还没有收入</div>
    </div>
    <div class="src-note">数据来自这台手机上的本地账本, 与记账页一起同步</div>`;

  target.innerHTML = `
    <div class="pane-title">报表</div>
    <div class="stats-tools" id="stats-tools">
      <div class="month-nav">
        <button type="button" class="m-btn" id="m-btn" aria-haspopup="dialog" aria-label="选时间范围">
          <span class="m-title" id="m-title"></span>
          <svg class="m-car" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <button type="button" class="flt-btn" id="shot-btn" aria-label="保存截图">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14V4M8 7.5L12 3.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 11.5H5.4c-.8 0-1.4.6-1.4 1.4v6.7c0 .8.6 1.4 1.4 1.4h13.2c.8 0 1.4-.6 1.4-1.4v-6.7c0-.8-.6-1.4-1.4-1.4h-1.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="flt-btn" id="flt-btn" aria-label="筛选">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16l-6 7v5.5l-4 2V13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="flt-n" id="flt-n" hidden></span>
      </button>
    </div>
    <div class="gran-view" id="gran-view">
      ${boardCards(st.gran === "sub" ? "小类" : "大类")}
      <div class="gran-menu" id="gran-menu" hidden>
        <button type="button" data-g="top">大类</button>
        <button type="button" data-g="sub">小类</button>
      </div>
    </div>

    <div class="bk-sheet" id="flt-sheet" hidden>
      <div class="bs-mask"></div>
      <div class="bs-panel">
        <div class="bs-head"><span>筛选</span>
          <button type="button" class="cm-x bs-x" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>
        </div>
        <div class="bs-body" id="flt-body">
          <div class="seg flt-seg" id="flt-seg">
            <button type="button" data-p="cat" class="on">类别</button>
            <button type="button" data-p="tag">标签</button>
          </div>
          <div class="flt-pager" id="flt-pager">
            <div class="flt-page" id="flt-page-cat"><div class="bs-sec"><div id="flt-tree"></div></div></div>
            <div class="flt-page" id="flt-page-tag"><div class="bs-sec"><div id="flt-tags"></div></div></div>
          </div>
        </div>
        <div class="bs-foot">
          <button type="button" class="ghost" id="flt-all">全选</button>
          <button type="button" class="ghost" id="flt-reset">重置</button>
          <button type="button" class="ghost" id="flt-cancel">取消</button>
          <button type="button" class="main" id="flt-ok">确定</button>
        </div>
      </div>
    </div>

    <div class="bk-sheet" id="cal-sheet" hidden>
      <div class="bs-mask"></div>
      <div class="bs-panel">
        <div class="bs-head"><span>时间范围</span>
          <button type="button" class="cm-x bs-x" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>
        </div>
        <div class="bs-body">
          <div class="seg rg-seg" id="rg-seg">
            <button type="button" data-mode="all">全部</button>
            <button type="button" data-mode="year">年</button>
            <button type="button" data-mode="quarter">季</button>
            <button type="button" data-mode="month">月</button>
            <button type="button" data-mode="week">周</button>
          </div>
          <div class="month-nav rs-nav" id="rs-nav">
            <button type="button" id="rs-prev" aria-label="早一段"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="m-title" id="rs-title"></div>
            <button type="button" id="rs-next" aria-label="晚一段"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <div class="rc-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
          <div class="rc-clip"><div class="rc-track" id="rc-track">
            <div class="rc-grid rc-ghost prev" id="rc-pm" aria-hidden="true"></div>
            <div class="rc-grid" id="rc-grid"></div>
            <div class="rc-grid rc-ghost next" id="rc-nm" aria-hidden="true"></div>
          </div></div>
        </div>
        <div class="bs-foot">
          <button type="button" class="ghost" id="rc-cancel">取消</button>
          <button type="button" class="main" id="rc-ok">确定</button>
        </div>
      </div>
    </div>

    <div class="bk-sheet" id="shot-sheet" hidden>
      <div class="bs-mask"></div>
      <div class="bs-panel">
        <div class="bs-head"><span>保存截图</span>
          <button type="button" class="cm-x bs-x" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>
        </div>
        <div class="bs-body">
          <img class="shot-img" id="shot-img" alt="报表截图预览">
        </div>
        <div class="bs-foot">
          <button type="button" class="ghost" id="shot-close">取消</button>
          <button type="button" class="main" id="shot-save">保存到相册</button>
        </div>
      </div>
    </div>`;

  const fltSheet = q("#flt-sheet");   // 接线用的框引用 (函数侧用 q() 现查, 避开先引后定义)
  const calSheet = q("#cal-sheet");

  // 时间范围五枚 (弹层里, 全是草稿): 档定步数 — 点哪枚, ‹› 一步就是多大
  // (年一岁/季一季/月一月/周一圈); 点档把草稿拉回当前段重新起算 (步数归
  // 零), 全部整本 — 都不动真身, 确定 才落账 (用户点名); 自定义不占钮,
  // 日历里点两天就是; 换档日历联动 (rangeFollow)
  q("#rg-seg").addEventListener("click", ev => {
    const b = ev.target instanceof Element && ev.target.closest("button[data-mode]");
    if (!b) return;
    dr.mode = b.dataset.mode;        // 快捷档永远是「当前」那一段
    dr.shift = 0;                    // 点档 = 步数归零重起算
    rangeFollow();
    syncRangeUI();
  });
  q("#m-btn").addEventListener("click", openRange);   // 点时间标题弹时间范围

  // 条形行下钻 (1.15.0): 大类视图点行开小类明细层, 小类视图点行直达具体明细
  for (const [s, kind] of [["#by-cat", "expense"], ["#by-cat-in", "income"]]) {
    q(s).addEventListener("click", ev => {
      const row = ev.target instanceof Element && ev.target.closest(".cat-row");
      if (!row) return;
      if (st.gran === "top") openCatSubs(row.dataset.k, kind);
      else openCatEntries(row.dataset.k, kind);
    });
  }

  // 大类/小类下拉菜单 (1.15.0 10-15, 用户点名「左上角的大类支出可以点击,
  // 展开下拉菜单, 可以在下拉菜单选择视图」): 菜单一枚, 点开挪进被点那张卡
  // 的卡头底下垂 (board-h relative 托底, 随卡滚动); 当前视图亮蓝, 点别枚即
  // 切 — 标题改字 + 版面整片重铺 (进场动画重放), st.gran 落盘下次进来还在
  // 这个视图; 点菜单外任意处收起。横滑分页退役 (横轴让回右划返回)。
  // 不做视图间滚动记忆: 标题在滚动内容里, 能点到它时人必在页顶, 记了也
  // 永远是 0 — 切换后 scrollTop 原样保留, 不另操心
  const granMenu = q("#gran-menu");
  const granLabels = () => {           // 两张卡的卡题随视图改字 (名词钉在 data-noun)
    const cls = st.gran === "sub" ? "小类" : "大类";
    target.querySelectorAll(".gran-lb").forEach(
      el => { el.textContent = `${el.dataset.noun}${cls}`; });
  };
  const granClose = () => {
    granMenu.hidden = true;
    target.querySelectorAll(".gran-btn").forEach(
      b => { b.setAttribute("aria-expanded", "false"); b.classList.remove("on"); });
  };
  target.querySelectorAll(".gran-btn").forEach(
    btn => btn.addEventListener("click", () => {
      if (!granMenu.hidden) { granClose(); return; }   // 再点标题 = 收起
      granMenu.hidden = false;
      btn.closest(".board-h").appendChild(granMenu);   // 从被点的卡头垂下
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("on");                         // 尖角翻转记开态
      granMenu.querySelectorAll("button").forEach(
        b => b.classList.toggle("on", b.dataset.g === st.gran));
    }));
  granMenu.addEventListener("click", ev => {
    const b = ev.target instanceof Element && ev.target.closest("button[data-g]");
    if (!b) return;
    granClose();
    if (b.dataset.g === st.gran) return;   // 点回当前视图 = 纯收起
    st.gran = b.dataset.g;
    saveLS("bk-stats-v1", st);   // 挑了哪个视图记哪个, 下次进来还在
    granLabels();
    render();
  });
  target.addEventListener("click", ev => {   // 点菜单外任意处收起 (层内足够)
    if (granMenu.hidden) return;
    if (ev.target instanceof Element && ev.target.closest(".gran-menu, .gran-btn")) return;
    granClose();
  });

  q("#flt-btn").addEventListener("click", openFlt);
  // 筛选两页 (10-10 用户点名「风格和类别类似」+「左右滑动要可以切换」): 页签
  // 之外, 两页还并进一副横滑分页器 (原生滚动 + scroll-snap: 跟手、松手没滑
  // 到位自动弹回 = 手势可取消; 报表的 gran 横滑分页 10-15 退役后, 这副是仓
  // 里仅存); 页签点了平滑滚过去, 滑到哪页页签亮到哪页 — 状态唯一事实源是
  // 分页器位置; 两页纵向各自滚 (类别树翻得深不带进标签页), 即兴 UI 态不落盘
  let fltPage = "cat";
  const fltPager = q("#flt-pager");
  const fltStride = () => Math.max(1, fltPager.children[1].offsetLeft
                                   - fltPager.children[0].offsetLeft);
  const fltSegOn = () => q("#flt-seg").querySelectorAll("button").forEach(
    b => b.classList.toggle("on", b.dataset.p === fltPage));
  fltPager.addEventListener("scroll", () => {
    const p = Math.round(fltPager.scrollLeft / fltStride()) ? "tag" : "cat";
    if (p === fltPage) return;
    fltPage = p;                       // 滑到哪页页签亮到哪页
    fltSegOn();
  }, { passive: true });
  q("#flt-seg").addEventListener("click", ev => {
    const b = ev.target instanceof Element && ev.target.closest("button[data-p]");
    if (!b || b.dataset.p === fltPage) return;
    fltPage = b.dataset.p;
    fltSegOn();
    fltPager.scrollTo({ left: fltPage === "tag" ? fltStride() : 0,
                        behavior: "smooth" });   // 页签点了平滑滚过去
  });
  q("#flt-body").addEventListener("click", ev => {
    const b = ev.target instanceof Element && ev.target.closest("button");
    if (!b) return;
    if (b.classList.contains("ft-chk")) {         // 复选框: 类别页是树形三态, 标签页平选平摘
      if (b.closest("#flt-tags")) {
        const k = b.dataset.k;
        if (sel.tags.has(k)) sel.tags.delete(k); else sel.tags.add(k);
      } else if (b.closest(".ft-row.sub")) {      // 小类: 整类罩着时摘/回这颗记在
        const k = b.dataset.k;                    // excl (大类键不动, catHit 对掉)
        const pk = k.slice(0, k.lastIndexOf("/"));
        if (sel.cats.has(pk)) {
          if (sel.excl.has(k)) sel.excl.delete(k); else sel.excl.add(k);
        } else if (sel.cats.has(k)) sel.cats.delete(k);
        else sel.cats.add(k);
      } else {                                    // 大类: 满选摘整类; 半选 (摘过
        const k = b.dataset.k;                    // 小类) 点它勾满整类; 空选/散小类勾整类 (散键收编)
        const under = [...sel.excl].some(x => x.startsWith(`${k}/`));
        if (sel.cats.has(k) && !under) sel.cats.delete(k);
        else {
          sel.cats.add(k);
          for (const x of [...sel.excl]) if (x.startsWith(`${k}/`)) sel.excl.delete(x);
          for (const x of [...sel.cats]) if (x.startsWith(`${k}/`)) sel.cats.delete(x);
        }
      }
      buildFlt();    // 勾选牵一发动全身 (大类小类联动), 重画一遍最省心
      return;
    }
    if (b.classList.contains("ft-exp")) {         // 展开钮: 小类折起来/摊开重画
      if (fltOpen.has(b.dataset.g)) fltOpen.delete(b.dataset.g);
      else fltOpen.add(b.dataset.g);
      buildFlt();
      return;
    }
  });
  q("#flt-all").addEventListener("click", () => {  // 全选只管眼前这页 (10-10 两页制):
    if (fltPage === "tag") {                       // 标签页勾满标签 (再摘几颗 = 排除法)
      for (const e of all) for (const t of tagsOf(e)) sel.tags.add(t);
      buildFlt();
      return;
    }
    const t = catTreeOf();                         // 类别页勾满整棵树 — 只落大类键
    for (const kind of ["expense", "income"])      // (整类罩全部, 摘过的小类一并勾回)
      for (const g of t[kind] || []) sel.cats.add(`${kind}|${g.name}`);
    sel.excl.clear();
    buildFlt();
  });
  q("#flt-ok").addEventListener("click", () => closeFlt(true));
  q("#flt-cancel").addEventListener("click", () => closeFlt(false));
  q("#flt-reset").addEventListener("click", () => {
    sel.cats.clear(); sel.tags.clear(); sel.excl.clear();
    buildFlt();
  });
  fltSheet.querySelector(".bs-mask").addEventListener("click", () => closeFlt(false));
  fltSheet.querySelector(".bs-x").addEventListener("click", () => closeFlt(false));

  // ---- 报表存图 (10-10 用户点名「报表添加一个保存截图的功能, 可以把报表
  // 下载到手机相册」; 同日再点名「跟界面长的也不一样」→ 海报照版面重排: 卡
  // 片/圆环引标/行内图标一个不少; 10-11 再点名图标配色 → 图标跟页面同一副
  // 暗井底+本色线稿, 见 category-icons.js): 快照 = 当前范围+筛选+档位的数
  // 据, 圆环走 donutLayout 与版面同一副落位, 图标走自足版 svg (画布里的
  // <img> 是独立文档, <use> 引不着页内 sprite); 预览一副 bk-sheet; 存相册
  // 走系统分享单 — navigator.share 文件级, 分享单里就有「存储图像」; 机器
  // 不认就退 <a download> 直接下载 ----
  let shotUrl = null, shotBlob = null;
  function closeShot() {
    hideSheet(q("#shot-sheet"));
    if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = shotBlob = null; }
  }
  const iconImg = (key, kind) => new Promise(resolve => {   // 类别图标 → 位图
    const img = new Image();                       // (独立文档, 只吃自足版 svg)
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(catIconSvg(key, kind));
  });
  q("#shot-btn").addEventListener("click", async () => {
    const rows = currentRows();
    if (!rows.length) return;                 // 空账本没东西可画
    const cls = st.gran === "sub" ? "小类" : "大类";
    const keyFn = st.gran === "top"
      ? e => String(e.category || "其他").split("/")[0]
      : e => String(e.category || "其他");
    const board = async (kindRows, kind) => {  // 榜首 7 名各占一槽 (与圆环同
      const total = kindRows.reduce((a, e) => a + Number(e.amount || 0), 0);
      if (!total) return null;                // 源), 尾巴并一行「其他」; 空的
      const pairs = aggPairs(kindRows, keyFn);   // 版面不进海报 (收入常空)
      const top = pairs.slice(0, 7).map((p, i) => {
        const c = STATS_RING_COLORS[i];
        return { key: p[0], name: p[0].split("/").pop(), amt: p[1], n: p[2],
                 color: c, color2: dk(c, 0.7), pct: pctTxt(p[1], total) };
      });
      const rest = pairs.slice(7);
      if (rest.length) {
        const amt = rest.reduce((a, p) => a + p[1], 0);
        top.push({ key: "", name: "其他", amt, n: rest.reduce((a, p) => a + p[2], 0),
                   color: STATS_OTHER_COLOR, color2: dk(STATS_OTHER_COLOR, 0.7),
                   pct: pctTxt(amt, total) });
      }
      for (const r of top)
        r.icon = r.key ? await iconImg(r.key, kind) : null;   // 「其他」没有本体图标
      const donut = donutLayout(pairs);       // 引标落位与版面一字不差
      for (const s of donut.segs) s.c2 = dk(s.c, 0.7);   // 内带深一档也备好
      return { label: (kind === "income" ? "收入" : "支出") + cls,
               total, count: kindRows.length, rows: top, donut };
    };
    const rep = {
      title: rangeTitle(computeRange()),      // 头: 这段从哪天到哪天
      sub: `${cls} · ${rows.length}笔` + (hasFilters() ? " · 已筛选" : ""),
      date: dateStr(new Date()).split("-").join("/"),
      boards: (await Promise.all([          // 两版一齐备齐 (图标位图异步)
        board(rows.filter(e => e.kind !== "income"), "expense"),
        board(rows.filter(e => e.kind === "income"), "income")])).filter(Boolean)
    };
    buildReportCanvas(rep).toBlob(b => {
      if (!b) return;
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotBlob = b;
      shotUrl = URL.createObjectURL(b);
      q("#shot-img").src = shotUrl;
      showSheet(q("#shot-sheet"));
    }, "image/png");
  });
  q("#shot-save").addEventListener("click", async () => {
    if (!shotBlob) return;
    const file = new File([shotBlob], "报表.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (_e) { /* 半路收了 */ }
      return;
    }
    const a = document.createElement("a");    // 老路子: 直接收一张 PNG
    a.href = shotUrl;
    a.download = `报表-${curMonth()}.png`;
    a.click();
  });
  const shotSheet = q("#shot-sheet");
  shotSheet.querySelector(".bs-mask").addEventListener("click", closeShot);
  shotSheet.querySelector(".bs-x").addEventListener("click", closeShot);
  q("#shot-close").addEventListener("click", closeShot);

  // ‹› 步进器 (与范围显示合一): 年/季/月/周态按档步数把整段平移 (‹ 早一段,
  // › 迟一段, 封顶现在), 日历联动跟过去; 自定义态步进没意义, 箭头兼职翻
  // 月历 — 选区原地留着, 跨月区间的尾点就靠这够到 (月导航退役后唯一的路)
  q("#rs-prev").addEventListener("click", () => {
    if (dr.mode === "custom") {
      const d = new Date(cal.y, cal.m - 2, 1);
      calJump(d.getFullYear(), d.getMonth() + 1);
      return;
    }
    dr.shift += 1;                   // 早一段
    rangeFollow();
    syncRangeUI();
  });
  q("#rs-next").addEventListener("click", () => {
    if (dr.mode === "custom") {
      const d = new Date(cal.y, cal.m, 1);
      calJump(d.getFullYear(), d.getMonth() + 1);
      return;
    }
    if (dr.shift > 0) {              // 迟一段 (封顶现在)
      dr.shift -= 1;
      rangeFollow();
      syncRangeUI();
    }
  });
  // 日历跟手划月 (10-10 用户点名「滑动一定要跟手, 并且可以通过手势取消」):
  // 整条轨道 (三月并卧) 跟着手指横移 — 手就是动画; 锁定锥判过才接管 (短/斜
  // 不算划, 点日子的照旧), 锁定那刻才抓指针 — 抓早了日期钮收不到 click;
  // 松手过了三分之一 (或带着甩劲) 才换月, 拖回一半内松手原样弹回 = 手势取
  // 消; 本月封顶: 下月没有了, 往左只给橡皮筋的份 (跟手到头, 松手必弹回);
  // 纯翻月不动草稿 (选区/步进各归各, 跨月选区间的中途也能这么翻)
  let calDrag = null, calSwallow = false, calBusy = false;
  const calTrack = q("#rc-track");
  const calSettle = px => {              // 松手落位: 弹回 / 滑到底换月, 250ms
    calTrack.style.transition = "transform .25s cubic-bezier(.32,.72,.35,1)";
    calTrack.style.transform = `translateX(${px}px)`;   // 得是整串合法值 — 早先
  };                                     // 光塞 "357px" 会被当非法声明整个扔掉,
                                         // transform 原地不动、过渡根本不起,
                                         // 轨道愣 250ms 后被换月钟一把拽回 0
                                         // (10-19 用户报「结束时抖一下」的根)
  calTrack.addEventListener("pointerdown", ev => {
    calSwallow = false;                  // 新手势清旧账 (上回吞漏的 click)
    if (calBusy) return;                 // 换月动画进行中: 不接新手势
    calDrag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, t: 0, lock: false };
  });
  calTrack.addEventListener("pointermove", ev => {
    if (!calDrag || ev.pointerId !== calDrag.id) return;
    const dx = ev.clientX - calDrag.x, dy = ev.clientY - calDrag.y;
    if (!calDrag.lock) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 2) return;   // 短/斜: 还不算划
      calDrag.lock = true;
      calDrag.t = performance.now();     // 锁定那刻起算甩劲
      calTrack.setPointerCapture(ev.pointerId);   // 锁成了才抓 (抓早了日期钮点不动)
      calTrack.style.transition = "none";          // 拖拽期间不吃过渡 — 手就是动画
      calSwallow = true;                 // 这一下是划, 不是点
    }
    const capped = dx < 0 && `${cal.y}-${pad(cal.m)}` >= curMonth();   // 封顶现在
    calTrack.style.transform = `translateX(${capped ? dx * 0.3 : dx}px)`;   // 到头: 橡皮筋
  });
  calTrack.addEventListener("pointerup", ev => {
    if (!calDrag || ev.pointerId !== calDrag.id) return;
    const d = calDrag;
    calDrag = null;
    if (!d.lock) return;                 // 没锁成横划: 原样放行 (点日子照旧)
    const dx = ev.clientX - d.x;
    const w = calTrack.clientWidth;
    const goNext = dx < 0;               // 左划下月, 右划上月
    const capped = goNext && `${cal.y}-${pad(cal.m)}` >= curMonth();
    const flick = performance.now() - d.t < 180 && Math.abs(dx) > 30;
    if (capped || !(Math.abs(dx) > w / 3 || flick)) {   // 没过线/到了头: 弹回
      calSettle(0);
      return;
    }
    calBusy = true;                      // 过线: 滑到底再无缝换月
    calSettle(goNext ? -w : w);
    // 换月落地等动画真到站 (transitionend), 不掐 250ms 定时器 — 定时器按点
    // 开火, 过渡却要等下一帧提交才起跑, 主线程一忙还能落后上百毫秒: 动画
    // 还差几十像素, 内容已换新月归零, 末尾又是一记瞬跳。定时器降级当兜底:
    // 框中途被关 (display:none) 掐了过渡没人送 transitionend, 月也得照换、
    // busy 也得照解 (10-19 同批修)
    let landed = false;
    const onEnd = ev => {
      if (ev.target === calTrack && ev.propertyName === "transform") land();
    };
    function land() {
      if (landed) return;
      landed = true;
      calTrack.removeEventListener("transitionend", onEnd);
      const t = new Date(cal.y, cal.m + (goNext ? 0 : -2), 1);
      calJump(t.getFullYear(), t.getMonth() + 1, true);   // 拖拽已演完, 不再放动画
      calTrack.style.transition = "none";
      calTrack.style.transform = "";
      calBusy = false;
    }
    calTrack.addEventListener("transitionend", onEnd);
    setTimeout(land, 400);
  });
  calTrack.addEventListener("pointercancel", () => {
    if (!calDrag) return;
    calDrag = null;
    calSettle(0);                       // 系统打断: 弹回原位
  });
  calTrack.addEventListener("click", ev => {
    if (calSwallow) { calSwallow = false; return; }   // 划翻月的尾随 click 吞掉
    const b = ev.target instanceof Element && ev.target.closest("button[data-d]");
    if (!b || b.disabled) return;
    const ds = b.dataset.d;
    if (!cal.a || cal.b) { cal.a = ds; cal.b = null; }   // 头一下 / 选完重起
    else if (ds >= cal.a) cal.b = ds;                    // 第二下不早于第一下
    else { cal.a = ds; cal.b = null; }                   // 点到更早: 从头起
    dr.mode = "custom";                                  // 日历里选 = 转自定义档
    dr.custom = [cal.a, cal.b || cal.a];                 // 头一下就算单天区间
    syncRangeUI();
    renderCal();
  });
  // 确定: 草稿这一下才落账 (用户点名) — 步数跟着档一起进真身
  q("#rc-ok").addEventListener("click", () => {
    if (!dr || (dr.mode === "custom" && !dr.custom)) return;
    st.mode = dr.mode;
    st.shift = STATS_SHIFTABLE.includes(dr.mode) ? dr.shift : 0;
    if (dr.mode === "custom") st.custom = [...dr.custom];
    hideSheet(calSheet);
    apply();
  });
  q("#rc-cancel").addEventListener("click", () => hideSheet(calSheet));   // 扔草稿
  calSheet.querySelector(".bs-mask").addEventListener("click", () => hideSheet(calSheet));
  calSheet.querySelector(".bs-x").addEventListener("click", () => hideSheet(calSheet));

  setCatColors(loadLS("bk-categories-v2", null));   // 自选图标色 (类别管理挑的, 随树缓存)
  render();
}
