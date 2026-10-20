// bookkeeping-amount-pad — My Money 金额键盘: 表达式实时预览 + ⌫ 长按清空
// + 改账带出的旧金额首个数字键直接重打 (不追加) + 保存/再记 (saveEntry 求值落
// 本地账本, 待同步)。2.0 挖财键盘: 保存 = 存盘+收层; 再记 = 存盘+金额清零+层
// 保持开着 (挖财实测, 连记同一天/同类别不用回头)。
// 纯计算在 amount-calculator.js。设了周期账的, 保存 = 存账 + 规则上服务端 (bookkeeping-recurring)。
// 拆自 bookkeeping.js (结构化重构: 代码逐字节未动, 经典脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局)。
"use strict";
/* global $, entries, dirty, persist, render, scheduleSync,
          uuid, sheetKind, sheetCat, sheetTags, editingId: writable, closeSheet,
          whenPicked, evaluateAmount, applyAmountKey, treeFor,
          cyc, submitCycle, resetCyclePanel */
/* exported refreshAmountPreview, saveEntry */

function refreshAmountPreview() {      // 表达式 (含运算符) 的实时结果, 裸数字不打扰
  const expr = $("#f-amount").value;
  const hasOp = /[+\-*/]/.test(expr);
  const value = hasOp ? evaluateAmount(expr) : null;
  $("#amt-eq").textContent = value == null ? "" : "= " + Math.round(value * 100) / 100;
}

$("#amt-pad").addEventListener("click", e => {
  const btn = e.target.closest("button[data-k]");
  if (!btn || btn.dataset.k === "back") return;   // ⌫ 在 pointerdown 处理 (要区分长按)
  if (btn.dataset.k === "done") {                 // 保存 = 存盘 + 收层
    const wasEdit = !!editingId;    // 改的是老账: 它还在下面原地, 不拉着人跑
    if (saveEntry()) {
      closeSheet();
      if (!wasEdit) window.scrollTo(0, 0);   // 新记的在瀑布流最顶上, 翻上去给它看
    }
  } else if (btn.dataset.k === "again") {
    // 再记 = 存盘 + 金额清零 + 层保持开着 (挖财实测): 类别/备注/标签/时刻都
    // 留着 (连记同一天/同类别的顺手); 周期面板回零 (规则跟着刚存的那笔走了,
    // 这笔要不要周期重新说); 改账按下再记 = 存下改笔, 下一笔从新账起头
    if (!saveEntry()) return;
    editingId = null;
    $("#sheet-del").hidden = true;
    resetCyclePanel(null);
    const input = $("#f-amount");
    input.value = "";
    delete input.dataset.fresh;
    refreshAmountPreview();
  } else {
    const input = $("#f-amount");
    // 改账带出的旧金额 (fresh): 按数字 = 整个重打; 运算键仍接着原金额算 (顺手 ×2 这种)
    const fresh = input.dataset.fresh === "1";
    delete input.dataset.fresh;                  // 只有第一下特殊, 之后正常编辑
    const base = fresh && /^[0-9]$/.test(btn.dataset.k) ? "" : input.value;
    input.value = applyAmountKey(base, btn.dataset.k);
    refreshAmountPreview();
  }
});

// ⌫: 按下即回删; 按住半秒整串清空 (iOS 键盘习惯), 抬手/移开就停
(function wireBackspace() {
  const btn = $("#amt-pad button[data-k=back]");
  let holdTimer = null;
  btn.addEventListener("pointerdown", () => {
    const input = $("#f-amount");
    delete input.dataset.fresh;              // ⌫ 是想接着改: 之后的数字键正常追加
    input.value = applyAmountKey(input.value, "back");
    refreshAmountPreview();
    holdTimer = setTimeout(() => {
      input.value = applyAmountKey(input.value, "clear");
      refreshAmountPreview();
    }, 550);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"])
    btn.addEventListener(ev, () => clearTimeout(holdTimer));
})();

// 键盘常驻吸底 (iOS 计算器扁平风): 不收不展, 「完成」就是保存。
// 金额框 readonly (只由键盘写入); 备注/日期聚焦弹系统键盘时, 靠弹层自身滚动让位

function shakeAmount() {               // 金额无效: 抖一下提示 (不清空, 键盘就在手边)
  const line = $("#amt-line");
  line.classList.remove("shake");
  void line.offsetWidth;
  line.classList.add("shake");
}

function shakeCategory() {             // 支出类别没选到位: 类别牌抖一下 (同一套提示)
  const cat = $("#amt-cat");
  cat.classList.remove("shake");
  void cat.offsetWidth;
  cat.classList.add("shake");
}

// 记一笔落库 (键盘上的 完成): 表达式求值 → 条目进本地账本 → 待同步
function saveEntry() {
  const value = evaluateAmount($("#f-amount").value);
  const amount = value == null ? NaN : Math.round(value * 100) / 100;
  if (!isFinite(amount) || amount <= 0) { shakeAmount(); return false; }
  // 支出类别必填: 没选、或只挂到还有小类的大类上 (如只点「餐饮」没点「早餐」)
  // 都不放行; 收入随意。不在树里的旧类别名不拦 (老数据照旧能改)
  const bareTop = sheetCat && !sheetCat.includes("/")
    ? treeFor(sheetKind).find(t => t.name === sheetCat) : null;
  if (sheetKind === "expense" &&
      (!sheetCat || (bareTop && bareTop.children.length))) {
    shakeCategory(); return false;
  }
  // 时刻来自拨轮 (whenVal 单一事实源, 时间牌/拨轮/保存读同一份)
  const { date, time } = whenPicked();
  const note = $("#f-note").value.trim().slice(0, 200);
  const tags = [...sheetTags];    // 标签列表层单选的 (一枚; 服务端照旧清洗)
  const now = new Date().toISOString();
  const prev = entries.find(x => x.id === editingId);
  const entry = {
    id: editingId || uuid(),
    date, time, amount, tags,
    kind: sheetKind, category: sheetCat, note,
    deleted: false, updatedAt: now,
    createdByName: prev ? prev.createdByName : "",
    updatedByName: prev ? prev.updatedByName : "",
  };
  if (prev) entries[entries.indexOf(prev)] = entry;
  else entries.push(entry);
  dirty.add(entry.id);
  persist();
  render();
  scheduleSync();
  if (cyc.on) submitCycle(entry);   // 周期账: 首账 (这一笔) 落本地, 规则紧跟上服务端
  return true;
}
