"""记一笔 2.0 挖财层: 全屏滑升 + 深色键盘版式与行为链 —
test_bookkeeping_page_and_categories 顶 200 行硬上限的拆新文件。
键盘: 数字区 3 列 + 右列 ⌫/再记/保存 (保存双高橘), 四则运算收进数字区上方
细条 (挖财键盘没有运算键, 计算器功能不丢); 再记 = 存盘+金额清零+层保持
开着 (挖财实测 — 连记同一天/同类别不用回头), 保存 = 存盘+收层。"""
from pathlib import Path

_STATIC = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
_HTML = (_STATIC / "bookkeeping.html").read_text(encoding="utf-8")
_PAD_CSS = (_STATIC / "css" / "bookkeeping-amount-pad.css").read_text(encoding="utf-8")
_SHEET_CSS = (_STATIC / "css" / "bookkeeping-entry-sheet.css").read_text(encoding="utf-8")
_SHEET_JS = (_STATIC / "bookkeeping-entry-sheet.js").read_text(encoding="utf-8")
_PAD_JS = (_STATIC / "bookkeeping-amount-pad.js").read_text(encoding="utf-8")


def test_amount_pad_wacai_layout():
    """键盘版式 (2.0): 运算细条 (÷×−＋ 沉一档压数字区上方) + 数字 3 列 +
    右列 ⌫/再记/保存 — 保存双高橘 (挖财 jz_theme_red), 0 双宽; 深蓝灰键面
    压白字, 键缝底更深一档衬 1px 缝。"""
    assert '<div class="calc-strip" role="group" aria-label="运算">' in _HTML
    for op, label in (("/", "÷"), ("*", "×"), ("-", "−"), ("+", "＋")):
        assert f'<button type="button" class="k op" data-k="{op}">{label}</button>' in _HTML
    assert '<button type="button" class="k zero" data-k="0">0</button>' in _HTML
    assert "grid-column: span 2;" in _PAD_CSS   # 0 双宽 (数字区 3 列铺满 4 格)
    assert ".amt-pad .k.util { grid-column: 4; grid-row: 1;" in _PAD_CSS    # ⌫ 右列头
    assert ".amt-pad .k.again { grid-column: 4; grid-row: 2;" in _PAD_CSS   # 再记右列中
    assert ".amt-pad .k.done { grid-column: 4; grid-row: 3 / span 2; height: auto;" in _PAD_CSS
    #    ↑ 保存右列尾, 双高 (贴着 0/. 两行); 三键同吃右列 = 挖财键盘同款
    assert "background: var(--accent); color: var(--accent-ink);" in _PAD_CSS \
        and "background: var(--steel-3);" in _PAD_CSS     # 保存橘 / ⌫再记沉档
    assert "background: var(--steel-2); color: rgba(255,255,255,.8);" in _PAD_CSS \
        and "height: 38px; font-size: 16px;" in _PAD_CSS  # 运算细条矮一档


def test_entry_sheet_fullscreen_geometry():
    """记一笔 = 全屏层 (2.0): 底部滑升盖满屏 / 关 = 滑降 (推入层同款曲线);
    白底一路铺到 y=0 — iOS 顶带成「深色状态栏」观感 (亮色绕带总策略), 内容
    (把手) 钉在 --top-clear 之下; 底部浮层的圆角顶盖/软影/高度上限退役。
    类别格同批换 4 列 (挖财版式)。"""
    blk = _SHEET_CSS.split("#sheet {")[1].split("}")[0]    # #sheet 规则块本体
    assert "position: fixed; top: 0; bottom: 0; left: 0; right: 0;" in blk
    assert "transform: translateY(102%);" in blk \
        and "transition: transform .3s cubic-bezier(.32,.72,.35,1);" in blk
    assert "border-radius" not in blk and "box-shadow" not in blk \
        and "max-height" not in blk
    assert "padding: calc(var(--top-clear) + 7px) 0 3px;" in _SHEET_CSS
    #    ↑ 把手顶衬钉在带下 (全屏层自己填带, 内容不进带); 下滑关闭的把手
    assert "grid-template-columns: repeat(4, 1fr); gap: 12px 4px;" in _SHEET_CSS


def test_again_key_chain_and_day_prefill():
    """行为链 (挖财实测): 再记 = saveEntry 过闸才动 (金额无效抖一下层不动) →
    编辑态归零 (下一笔是新账, 删除钮藏回) → 金额清零 (fresh 标记同清) → 周期
    面板回零 (规则跟着刚存的那笔走了, 这笔要不要周期重新说); 类别/备注/标签/
    时刻留着 (连记顺手)。日历点日 = openSheet(null, 该日): 日期 = 改账原值 >
    点的那天 > 今天。Esc (键鼠路, BACK=收层的桌面对应): 选层/备注浮层先收才
    轮到整层; 与推入层 Esc 同挂 document — 即刻拦住兄弟监听 (stopPropagation
    拦不住同节点)。"""
    assert 'else if (btn.dataset.k === "again") {' in _PAD_JS \
        and "resetCyclePanel(null);" in _PAD_JS \
        and 'delete input.dataset.fresh;' in _PAD_JS \
        and '$("#sheet-del").hidden = true;' in _PAD_JS
    #    ↑ 再记四件事: 存闸 → 编辑态归零 → 金额清零重打 → 周期回零
    assert "function openSheet(entry, dayPrefill)" in _SHEET_JS \
        and "(entry && entry.date) || dayPrefill || todayStr()" in _SHEET_JS
    assert 'ev.key !== "Escape" || $("#sheet").hidden' in _SHEET_JS \
        and "ev.stopImmediatePropagation();" in _SHEET_JS
    pick_sel = '"#cat-pick.on .cp-x, #when-pick.on .cp-x, ' \
               '#tag-pick.on .cp-x, #cyc-pick.on .cp-x"'
    assert pick_sel in _SHEET_JS    # 顶上的选层先收 (各带 .cp-x)
