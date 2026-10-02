// bookkeeping-categorizer.test.mjs — 类别聪明事的纯逻辑: 归一化 / 建索引 /
// 三层匹配裁决 (自学习票权 + 钟点先验) / 格子热度排序 / 钟点餐段
// (弹层接线与回填在 bookkeeping-entry-sheet.js, 由 pytest 钉串覆盖;
// 这里只测能 require 的部分)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)),
  "../../app/bookkeeping/static");
const { normNote, buildNoteIndex, matchNoteCategory, rankCategories,
        mealCategoryByHour } = require(
          path.join(dir, "bookkeeping-categorizer.js"));

// 条目工厂 (bookkeeping-merge.js 的形状; date 默认落在以 2026-10-02 为 today
// 的 90 天窗口内, 各测试按需改写)
function ent(note, category, opts = {}) {
  return { kind: "expense", category, note, date: "2026-09-01", deleted: false,
    updatedAt: "2026-01-01T00:00:00Z", ...opts };
}
const CATS = new Set(["居家/水电燃气", "餐饮/早餐", "交通/火车", "餐饮/买菜原料",
  "餐饮/饮料水果", "餐饮/晚餐", "餐饮/夜宵"]);

/* ---------- normNote ---------- */

test("normNote 剥全部空白 (含全角) + 拉丁小写", () => {
  assert.equal(normNote(" 去哪 APP "), "去哪app");
  assert.equal(normNote("IU　酒店"), "iu酒店");
  assert.equal(normNote("两 个 肉包"), "两个肉包");
});

test("normNote null / undefined / 纯空白 → 空串", () => {
  assert.equal(normNote(null), "");
  assert.equal(normNote(undefined), "");
  assert.equal(normNote("  \t "), "");
});

/* ---------- buildNoteIndex ---------- */

test("buildNoteIndex 同备注折票柜, votes/recents 按类别各记", () => {
  const idx = buildNoteIndex([
    ent("电费", "居家/水电燃气", { updatedAt: "2026-01-01T00:00:00Z" }),
    ent("电费", "居家/水电燃气", { updatedAt: "2026-02-01T00:00:00Z" }),
    ent("电费", "餐饮/早餐", { updatedAt: "2026-03-01T00:00:00Z" }),
  ], "expense", CATS);
  const rec = idx.exact.get("电费");
  assert.equal(rec.votes.get("居家/水电燃气"), 2);
  assert.equal(rec.votes.get("餐饮/早餐"), 1);
  assert.equal(rec.recents.get("居家/水电燃气"),
    new Date("2026-02-01T00:00:00Z").getTime());
  assert.equal(rec.recents.get("餐饮/早餐"),
    new Date("2026-03-01T00:00:00Z").getTime());
  assert.equal(idx.notes.length, 1);
});

test("buildNoteIndex 过滤: 墓碑/异方向/剥空备注/树外类别/数组混 null", () => {
  const idx = buildNoteIndex([
    ent("电费", "居家/水电燃气"),
    ent("水费", "居家/水电燃气", { deleted: true }),
    ent("工资", "工资薪水", { kind: "income" }),
    ent("   ", "餐饮/早餐"),
    ent("打车", "不存在/类别"),
    null,
  ], "expense", CATS);
  assert.equal(idx.notes.length, 1);
  assert.equal(idx.exact.get("电费").votes.get("居家/水电燃气"), 1);
});

test("buildNoteIndex updatedAt 非法串不写进 recents (NaN 永不大于)", () => {
  const idx = buildNoteIndex(
    [ent("电费", "居家/水电燃气", { updatedAt: "不是时间" })], "expense", CATS);
  assert.equal(idx.exact.get("电费").recents.size, 0);
});

test("buildNoteIndex 后来条目更旧不顶掉 recents", () => {
  const idx = buildNoteIndex([
    ent("电费", "居家/水电燃气", { updatedAt: "2026-05-01T00:00:00Z" }),
    ent("电费", "居家/水电燃气", { updatedAt: "2026-02-01T00:00:00Z" }),
  ], "expense", CATS);
  assert.equal(idx.exact.get("电费").recents.get("居家/水电燃气"),
    new Date("2026-05-01T00:00:00Z").getTime());
});

/* ---------- 精确层 ---------- */

test("精确层: 多数票胜出 (后到的更多票也认)", () => {
  const idx = buildNoteIndex([
    ent("电费", "餐饮/早餐"),
    ent("电费", "居家/水电燃气"), ent("电费", "居家/水电燃气"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("电费", idx),
    { cat: "居家/水电燃气", how: "exact" });
});

test("精确层: 平票 → recents 更近的类别胜", () => {
  const idx = buildNoteIndex([
    ent("红包", "餐饮/早餐", { updatedAt: "2026-01-01T00:00:00Z" }),
    ent("红包", "交通/火车", { updatedAt: "2026-06-01T00:00:00Z" }),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("红包", idx), { cat: "交通/火车", how: "exact" });
});

test("精确层: 平票且同刻 → 账本先到的胜 (严格大于才换)", () => {
  const idx = buildNoteIndex([
    ent("红包", "餐饮/早餐"), ent("红包", "交通/火车"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("红包", idx), { cat: "餐饮/早餐", how: "exact" });
});

/* ---------- 子串层 ---------- */

test("子串层: 历史备注 ⊂ 输入 (打车 → 打车去公司)", () => {
  const idx = buildNoteIndex([ent("打车", "交通/火车")], "expense", CATS);
  assert.deepEqual(matchNoteCategory("打车去公司", idx),
    { cat: "交通/火车", how: "sub" });
});

test("子串层: 输入 ⊂ 历史备注 (深圳 → 深圳通)", () => {
  const idx = buildNoteIndex([ent("深圳通", "交通/火车")], "expense", CATS);
  assert.deepEqual(matchNoteCategory("深圳", idx), { cat: "交通/火车", how: "sub" });
});

test("子串层: 交叠 1 字不猜 (电 → 电费)", () => {
  const idx = buildNoteIndex([ent("电费", "居家/水电燃气")], "expense", CATS);
  assert.equal(matchNoteCategory("电", idx), null);
});

test("子串层: 只认交叠最长的一组, 短候选无论先后都不搅局", () => {
  const mk = es => buildNoteIndex(es, "expense", CATS);
  const long = ent("打车去公司", "交通/火车"), short = ent("打车", "餐饮/早餐");
  const hit = { cat: "交通/火车", how: "sub" };
  assert.deepEqual(matchNoteCategory("打车去公司报销", mk([short, long])), hit);
  assert.deepEqual(matchNoteCategory("打车去公司报销", mk([long, short])), hit);
});

test("子串层: 同长多候选按类别总票数裁决", () => {
  const idx = buildNoteIndex([
    ent("打车回家", "交通/火车"), ent("打车回家", "交通/火车"),
    ent("打车票", "餐饮/早餐"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("打车", idx), { cat: "交通/火车", how: "sub" });
});

test("子串层: 总票数打平 → 歧义不猜", () => {
  const idx = buildNoteIndex([
    ent("打车回家", "交通/火车"), ent("打车票", "餐饮/早餐"),
  ], "expense", CATS);
  assert.equal(matchNoteCategory("打车", idx), null);
});

/* ---------- 字符集层 ---------- */

test("字符集层: 顺序无关 (费电 → 电费)", () => {
  const idx = buildNoteIndex([ent("电费", "居家/水电燃气")], "expense", CATS);
  assert.deepEqual(matchNoteCategory("费电", idx),
    { cat: "居家/水电燃气", how: "chars" });
});

test("字符集层: 集合 <2 不猜 (买 → 买菜) / 互不包含不猜 (电网 vs 买菜)", () => {
  const idx = buildNoteIndex([ent("买菜", "餐饮/买菜原料")], "expense", CATS);
  assert.equal(matchNoteCategory("买", idx), null);
  assert.equal(matchNoteCategory("电网", idx), null);
});

test("字符集层: 反方向包含 (地充卡铁 → 地铁, 非子串)", () => {
  const idx = buildNoteIndex([ent("地铁", "交通/火车")], "expense", CATS);
  assert.deepEqual(matchNoteCategory("地充卡铁", idx),
    { cat: "交通/火车", how: "chars" });
});

/* ---------- 层序与兜底 ---------- */

test("层序: 全等命中即 exact, 模糊候选不参与", () => {
  const idx = buildNoteIndex([
    ent("电费", "居家/水电燃气"),
    ent("电费缴纳", "餐饮/早餐"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("电费", idx),
    { cat: "居家/水电燃气", how: "exact" });
});

test("空词库 (树没拉到) / 空备注 → null", () => {
  const idx = buildNoteIndex([ent("电费", "居家/水电燃气")], "expense", new Set());
  assert.equal(matchNoteCategory("电费", idx), null);
  assert.equal(matchNoteCategory("  ", idx), null);
});

test("反馈环: 手选一笔, 同备注下次即精确命中", () => {
  const idx0 = buildNoteIndex([], "expense", CATS);
  assert.equal(matchNoteCategory("星巴克", idx0), null);
  const idx1 = buildNoteIndex([ent("星巴克", "餐饮/饮料水果")], "expense", CATS);
  assert.deepEqual(matchNoteCategory("星巴克", idx1),
    { cat: "餐饮/饮料水果", how: "exact" });
});

/* ---------- 自学习票权 (2026-10-02 用户点名自主学习) ---------- */

test("票权: 近 90 天的账记 2 票, 更老的 1 票; today 不给 = 全员 1 票", () => {
  const idx = buildNoteIndex([
    ent("电费", "居家/水电燃气", { date: "2026-09-01" }),
    ent("水费", "餐饮/早餐", { date: "2025-01-01" }),
    ent("燃气", "交通/火车", { date: "2026-07-04" }),      // cutoff 当天算新
    ent("物业", "餐饮/买菜原料", { date: "" }),             // 没记日期: 进不了窗
  ], "expense", CATS, "2026-10-02");
  assert.equal(idx.exact.get("电费").votes.get("居家/水电燃气"), 2);
  assert.equal(idx.exact.get("水费").votes.get("餐饮/早餐"), 1);
  assert.equal(idx.exact.get("燃气").votes.get("交通/火车"), 2);
  assert.equal(idx.exact.get("物业").votes.get("餐饮/买菜原料"), 1);
  const old = buildNoteIndex([ent("电费", "居家/水电燃气")], "expense", CATS);
  assert.equal(old.exact.get("电费").votes.get("居家/水电燃气"), 1);
});

test("票权翻案: 老账投错的类, 新近改对一笔即 2:1 反超 (同刻平票救不了老口径)", () => {
  const idx = buildNoteIndex([
    ent("红包", "餐饮/早餐", { date: "2025-06-01" }),
    ent("红包", "交通/火车", { date: "2026-09-20" }),
  ], "expense", CATS, "2026-10-02");
  // 两笔 updatedAt 同刻: 没有票权时是平票→账本先到→错类; 票权让新账赢
  assert.deepEqual(matchNoteCategory("红包", idx), { cat: "交通/火车", how: "exact" });
});

/* ---------- 钟点先验 ---------- */

test("钟点先验: 精确层平票时属意这顿饭的类别拍板 (8 点的「包子」= 早餐)", () => {
  const idx = buildNoteIndex([
    ent("包子", "餐饮/早餐"), ent("包子", "餐饮/晚餐"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("包子", idx, 8), { cat: "餐饮/早餐", how: "exact" });
  assert.deepEqual(matchNoteCategory("包子", idx, 18), { cat: "餐饮/晚餐", how: "exact" });
  assert.deepEqual(matchNoteCategory("包子", idx), { cat: "餐饮/早餐", how: "exact" });
  //   ↑ hour 不给 = 无先验, 同刻平票照旧取账本先到
});

test("钟点先验: 只裁平票, 不顶多数 (属意的类别票数落后就老老实实输)", () => {
  const idx = buildNoteIndex([
    ent("包子", "餐饮/早餐"), ent("包子", "餐饮/早餐"), ent("包子", "餐饮/晚餐"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("包子", idx, 19), { cat: "餐饮/早餐", how: "exact" });
});

test("钟点先验: 模糊层平票的几家里有属意的餐段 → 拍板; 不在则照旧不猜", () => {
  const idx = buildNoteIndex([
    ent("打车票", "餐饮/晚餐"), ent("打车回家", "交通/火车"),
  ], "expense", CATS);
  assert.deepEqual(matchNoteCategory("打车", idx, 19), { cat: "餐饮/晚餐", how: "sub" });
  assert.equal(matchNoteCategory("打车", idx, 8), null);   // 属意的早餐不在平票一伙
});

/* ---------- 格子排序 (时间窗频率 + LRU) ---------- */

test("rankCategories: 窗内按频率倒排 (平票取最近) → 窗外按最后记账日倒排 → 树序垫底", () => {
  const cats = new Set(["餐饮/早餐", "餐饮/午餐", "交通/火车",
    "餐饮/夜宵", "购物/家居百货", "居家/水电燃气"]);
  const ranked = rankCategories([
    ent("a", "餐饮/早餐", { date: "2026-09-01" }),          // 早餐: 窗内 1
    ent("b", "餐饮/午餐", { date: "2026-09-02" }),
    ent("c", "餐饮/午餐", { date: "2026-09-03" }),          // 午餐: 窗内 2 → 头名
    ent("d", "交通/火车", { date: "2026-07-04" }),          // 火车: 窗内 1 (cutoff 当天)
    ent("e", "餐饮/夜宵", { date: "2026-07-03" }),          // 夜宵: 窗外, LRU 桶头名
    ent("f", "购物/家居百货", { date: "2026-01-01" }),      // 购物: 窗外, 更老
    ent("g", "餐饮/早餐", { date: "2026-07-03" }),          // 早餐窗外一笔: n 仍 1, last 09-01
  ], "expense", cats, "2026-10-02");
  // 早餐 vs 火车同为窗内 1 笔: 平票取 last 更近的早餐; 居家从没记过垫底
  assert.deepEqual(ranked, ["餐饮/午餐", "餐饮/早餐", "交通/火车",
    "餐饮/夜宵", "购物/家居百货", "居家/水电燃气"]);
});

test("rankCategories: 窗外同 last 平票取树序 (全确定, 不吃账本顺序)", () => {
  const cats = new Set(["交通/火车", "餐饮/夜宵", "餐饮/早餐"]);
  const ranked = rankCategories([
    ent("a", "餐饮/夜宵", { date: "2026-05-05" }),
    ent("b", "交通/火车", { date: "2026-05-05" }),
    ent("c", "餐饮/早餐", { date: "2026-08-05" }),
    ent("d", "餐饮/早餐", { date: "2026-08-05" }),
  ], "expense", cats, "2026-10-02");
  assert.deepEqual(ranked, ["餐饮/早餐", "交通/火车", "餐饮/夜宵"]);
});

test("rankCategories: 墓碑/异方向/树外类别/混 null 不计", () => {
  const cats = new Set(["餐饮/早餐", "交通/火车"]);
  const ranked = rankCategories([
    ent("a", "餐饮/早餐", { date: "2026-09-01" }),
    ent("b", "餐饮/早餐", { date: "2026-09-02", deleted: true }),
    ent("c", "工资薪水", { date: "2026-09-03", kind: "income" }),
    ent("d", "不存在/类别", { date: "2026-09-04" }),
    ent("e", "交通/火车", { date: "" }),                    // 没记日期: 进不了窗, 只落 LRU 桶
    null,
  ], "expense", cats, "2026-10-02");
  assert.deepEqual(ranked, ["餐饮/早餐", "交通/火车"]);
});

/* ---------- 钟点餐段 (没写备注时) ---------- */

test("mealCategoryByHour: 2/10/14/20 点整点换挡, 凌晨与深夜都是宵夜 (四段闭环)", () => {
  assert.equal(mealCategoryByHour(1), "餐饮/夜宵");
  assert.equal(mealCategoryByHour(2), "餐饮/早餐");
  assert.equal(mealCategoryByHour(9), "餐饮/早餐");
  assert.equal(mealCategoryByHour(10), "餐饮/午餐");
  assert.equal(mealCategoryByHour(13), "餐饮/午餐");
  assert.equal(mealCategoryByHour(14), "餐饮/晚餐");
  assert.equal(mealCategoryByHour(19), "餐饮/晚餐");
  assert.equal(mealCategoryByHour(20), "餐饮/夜宵");
  assert.equal(mealCategoryByHour(23), "餐饮/夜宵");
});
