// bookkeeping-categorizer.js — 记一笔的类别聪明事 (纯逻辑, 不碰页面/存储/网络):
//   1 备注匹配  历史备注建索引, 输入备注查类别 (精确/子串/字符集三层)
//   2 格子排序  时间窗内频率倒排, 窗外 LRU, 从没记过的树序垫底
//   3 钟点餐段  没写备注时按钟点属意一顿饭 (10 点前早餐, 14 点前午餐,
//               20 点前晚餐, 过了 20 点到凌晨 2 点宵夜)
// 单独成模块: node --test 直测 + c8 盖分支 (弹层接线与回填在 bookkeeping-entry-sheet.js)。
//
// 「自主学习」口径 (2026-10-02 用户点名): 词库即参数, 全量历史即训练集 —
// 每次收备注时就地全量重导 (七千条 ≈ 毫秒级), 手选一笔 = 参数立刻长一票;
// 不养夜间训练任务: 参数在每次使用时都是最新的, 比任何定期重训都新鲜,
// 服务器一字未动 (匹配全在手机端算, NAS 零新增负载)。票权见 buildNoteIndex:
// 近一季的账记两票 — 老账投错的类, 新近改对一笔就能翻案。若将来账本涨到
// 手机端重导可感 (十万条级), 再把这层搬去服务端半夜预算 — 当前语料
// (2010 条带备注) 配不上那个阵仗, 上了反而是负资产。
//
// 三层匹配, 命中即停, 只报无歧义的:
//   1 精确    归一化后全等 → 类别票数, 平票取钟点属意的餐段, 再取最近一次 (updatedAt 时刻)
//   2 子串    双向包含, 交叠段 (短的那条) ≥2 字; 交叠最长的多条一起按类别总票数裁决
//   3 字符集  顺序无关的兜底 (「费电」→「电费」): 两边字符集互相包含, 小的那份 ≥2 字
// 模糊层 (2/3) 前两名票数打平 = 歧义, 返回 null 不猜 (钟点属意的那餐恰在平票
// 一伙里时例外 — 时间先验拍板; 只有精确层额外有「平票取最近」)。
//
// 条目形状 (bookkeeping-merge.js 同一份): { kind, category, note, date, deleted, updatedAt, … }
// validCats: Set<组合名> — 当前方向类别树里全部可选路径 (「大类/小类」或无小类的大类名);
// 选上去也存不了的类别不喂给匹配 (树没拉到 → 空 Set → 索引空 → 自然 null)。
// 归一化: 剥全部空白字符 (含全角空格) + 拉丁转小写 (备注里有「去哪app」「iu酒店」) —
// 「IU 酒店」与「iu酒店」共享票柜是期望口径。时刻一律 new Date(...).getTime() 比较
// (本地 Z / 服务器 +00:00 混格式, 字典序会错 — bookkeeping-merge.js 同款不变量);
// 记账日期一律 "YYYY-MM-DD" 串, 字典序即时间序。

// 归一化: 建索引与查串同一副口径; 空串归空串, 调用方自判
function normNote(raw) {
  return String(raw ?? "").replace(/\s+/g, "").toLowerCase();
}

// 90 天 = 一个季度的习惯: 排序的频率窗与票权的新鲜窗共用这一个常数
// (再长会把过季的消费顶上来, 再短被一两笔偶发带偏)
const RANK_WINDOW_DAYS = 90;

// 本地日历日直减 n 天 (不走 UTC: toISOString 在东八区会把零点落到前一天,
// 窗口边会歪一天; Date(y, m, d-n) 自带跨月/跨年进位)
function dateMinusDays(day, n) {
  const [y, m, d] = String(day).split("-").map(Number);
  const t = new Date(y, m - 1, d - n);
  const p = x => String(x).padStart(2, "0");
  return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
}

// 历史备注索引: 同一 (方向, 归一化备注) 的多条目折成一票柜。返回
// { exact: Map<归一化备注, 票柜>, notes: [票柜…] } — exact 给精确层查, notes 给模糊层扫。
// 票柜 = { note, votes: Map<类别,票数>, recents: Map<类别,最近时刻ms> } —
// recents 按类别各记一份: 精确层平票要拿两个类别的最新时刻比, 整柜一个时刻分不出归属。
// today ("YYYY-MM-DD", 可不给): 自学习票权 — 近 90 天的账记 2 票, 更老的记 1 票
// (老账是过去的习惯, 刚改对的口径要顶得动它: 同备注老账投错类, 新近记对
// 一笔即 2:1 反超)。不给 today = 全员 1 票 (老口径)。
function buildNoteIndex(entries, kind, validCats, today) {
  const cutoff = today ? dateMinusDays(today, RANK_WINDOW_DAYS) : "";
  const exact = new Map();
  for (const e of entries) {
    if (!e || e.kind !== kind || e.deleted) continue;
    const note = normNote(e.note);
    if (!note || !validCats.has(e.category)) continue;
    let rec = exact.get(note);
    if (!rec) exact.set(note, rec = { note, votes: new Map(), recents: new Map() });
    const w = today && String(e.date || "") >= cutoff ? 2 : 1;
    rec.votes.set(e.category, (rec.votes.get(e.category) || 0) + w);
    const t = new Date(e.updatedAt).getTime();
    if (t > (rec.recents.get(e.category) || 0)) rec.recents.set(e.category, t);
  }
  return { exact, notes: [...exact.values()] };
}

// 精确层的多数类别: 票数最多; 平票取钟点属意的餐段, 再取 recents 更近的;
// 同刻取账本先到的 (严格大于才换, Map 迭代按插入序 = 账本顺序, 天然确定)
function topCat(rec, prefer) {
  let best = null;
  for (const [cat, n] of rec.votes) {
    if (best == null || n > rec.votes.get(best) ||
        (n === rec.votes.get(best) && rec.recents.get(cat) > rec.recents.get(best))) {
      best = cat;
    }
  }
  // 钟点属意的那餐恰在平票一伙里: 时间先验压过「取最近」(「包子」早晚都买,
  // 早上 8 点问起就该是早餐 — 哪怕上一笔是昨晚的)
  if (prefer && rec.votes.get(prefer) === rec.votes.get(best)) return prefer;
  return best;
}

// 总票柜里票数唯一最多的那类; 并列第一 = 歧义, 返回 null (模糊层不猜) —
// 例外: 并列的几家里有钟点属意的那餐 (prefer), 时间先验拍板
function clearTop(tally, prefer) {
  let max = 0;
  for (const n of tally.values()) {
    if (n > max) max = n;
  }
  if (prefer && tally.get(prefer) === max) return prefer;
  let best = null;
  for (const [cat, n] of tally) {
    if (n !== max) continue;
    if (best !== null) return null;
    best = cat;
  }
  return best;
}

// 一票柜并进总票柜 (模糊层: 同组的几条历史备注一起裁决)
function addVotes(tally, rec) {
  for (const [cat, n] of rec.votes) {
    tally.set(cat, (tally.get(cat) || 0) + n);
  }
}

// 没写备注时按钟点属意的餐段 (2026-10-02 用户点名的口径): 凌晨 2 点到
// 10 点都算早餐, 24 小时四段闭环 — 返回组合名, 树里有没有这餐由调用方自判
function mealCategoryByHour(hour) {
  if (hour < 2) return "餐饮/夜宵";
  if (hour < 10) return "餐饮/早餐";
  if (hour < 14) return "餐饮/午餐";
  if (hour < 20) return "餐饮/晚餐";
  return "餐饮/夜宵";
}

// 输入备注 → 类别: 命中给 { cat, how: "exact"|"sub"|"chars" }, 对不上/歧义给 null。
// hour (0-23, 可不给): 钟点先验 — 平票的几家里有这钟点属意的餐段类别, 就它拍板
function matchNoteCategory(raw, index, hour) {
  const note = normNote(raw);
  if (!note) return null;
  const prefer = hour == null ? null : mealCategoryByHour(hour);
  const exact = index.exact.get(note);
  if (exact) return { cat: topCat(exact, prefer), how: "exact" };

  // 子串层: 双向包含, 交叠段 ≥2 字; 只留交叠最长的一组 (更长的更可能是同一笔的简写)
  let overlap = 0, tally = null;
  for (const rec of index.notes) {
    const ov = Math.min(rec.note.length, note.length);
    if (ov < 2 || (!rec.note.includes(note) && !note.includes(rec.note))) continue;
    if (ov > overlap) { overlap = ov; tally = new Map(); }
    if (ov === overlap) addVotes(tally, rec);
  }
  if (tally) {
    const cat = clearTop(tally, prefer);
    if (cat) return { cat, how: "sub" };
  }

  // 字符集层: 顺序无关兜底, 小的那份 ≥2 字 (1 个字的信息量不配替人做主)
  const set = new Set(note), charTally = new Map();
  for (const rec of index.notes) {
    const other = new Set(rec.note);
    if (Math.min(set.size, other.size) < 2) continue;
    if (![...set].every(ch => other.has(ch)) && ![...other].every(ch => set.has(ch))) continue;
    addVotes(charTally, rec);
  }
  const cat = clearTop(charTally, prefer);
  return cat ? { cat, how: "chars" } : null;
}

// ---------- 格子排序: 时间窗内频率倒排, 窗外 LRU (2026-10-02 用户点名) ----------
// 窗口 = today 往前 90 天, 按记账日 (date) 口径 — 导入历史的 updatedAt 全是
// 导入那一刻, date 才是真记账时间。返回全部可选类别的完整排序 (取前几格由
// 调用方切): 窗口内有账的按笔数倒排 → 窗口外有账的按最后记账日倒排 (LRU) →
// 从没记过的按树序垫底。平票先取 last 新的, 再取树序靠前的 (validCats 插入序)
// — 全确定, 不吃账本顺序。
function rankCategories(entries, kind, validCats, today) {
  const cutoff = dateMinusDays(today, RANK_WINDOW_DAYS);
  const stat = new Map();          // 类别 → { n: 窗口内笔数, last: 最后记账日 }
  for (const e of entries) {
    if (!e || e.kind !== kind || e.deleted || !validCats.has(e.category)) continue;
    const d = String(e.date || "");
    let s = stat.get(e.category);
    if (!s) stat.set(e.category, s = { n: 0, last: "" });
    if (d >= cutoff) s.n += 1;
    if (d > s.last) s.last = d;
  }
  const order = new Map([...validCats].map((c, i) => [c, i]));   // 树序: 垫底与平票仲裁
  const byLast = (a, b) => a[1].last < b[1].last ? 1
    : a[1].last > b[1].last ? -1 : order.get(a[0]) - order.get(b[0]);
  const inWin = [], outWin = [];
  for (const rec of stat) (rec[1].n > 0 ? inWin : outWin).push(rec);
  inWin.sort((a, b) => b[1].n - a[1].n || byLast(a, b));
  outWin.sort(byLast);
  return [...inWin.map(x => x[0]), ...outWin.map(x => x[0]),
          ...[...validCats].filter(c => !stat.has(c))];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normNote, buildNoteIndex, matchNoteCategory,
                     rankCategories, mealCategoryByHour };
}
