"""记账前端接线测试: 静态 JS 模块按 bookkeeping.html 的加载顺序拼起来整体断言
(金额键盘/类别树/时间拨轮/标签/备注浮层输入/视口医生)。
拆自 test_bookkeeping_page_and_categories.py (结构化重构)。"""
from pathlib import Path
import re


def test_bookkeeping_js_wires_calculator_and_categories():
    """接线: 完成走 saveEntry (evaluateAmount 求值, 不再 parseFloat), ⌫ 走
    pointerdown (长按清空), 改账带出的旧金额首个数字键重打 (运算键仍接着原金额算), 类别树服务器拿 + 缓存本地 (默认 5×3 常见格, 全部
    类别点「选类别」弹树选层: 大类手风琴 (标题带图标), 点开才见小类; 没子类的
    大类带图标铺成一级行点一下直选), 时间走 iOS 闹钟式
    拨轮 (whenVal 单一事实源, 保存读 whenPicked() 拆 date/time 进条目),
    标签单选一枚选中即收进条目, 备注是 rides 系统键盘的浮层输入
    (从备注行原位升起滑到键盘上方: 聚焦带 preventScroll 不让 iOS 推页面,
    升键过程不从出发线往下跳; 数字键盘让位; 浮层无完成钮 — 系统键盘
    回车/点别处收), 把手 window 级 pointer 下拉关闭 + 整层 touch 手势
    (左右划换收支: switchKind 只换类别那一摊, 金额备注键盘不动; 任意部位
    下拽关层, 内容超高让给滚动; 划/拽后的误触点击吃掉);
    键盘常驻 (无展开/收起逻辑), 金额行类别牌随选择刷新 (选上跟方向色点亮);
    视口医生 (tesla 移植) 治底部黑边; iOS 捏合缩放掐 gesturestart。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    # 大脚本按逻辑拆成了 bookkeeping-*.js 多个模块 (结构化重构), 断言按
    # bookkeeping.html 里的加载顺序拼接起来整体查
    modules = ("bookkeeping-viewport", "bookkeeping-merge", "amount-calculator",
               "bookkeeping-state", "category-icons", "bookkeeping-render",
               "bookkeeping-sync", "bookkeeping-entry-sheet",
               "bookkeeping-amount-pad", "bookkeeping-boot")
    js = "".join((base / f"{name}.js").read_text(encoding="utf-8")
                 for name in modules)
    assert "evaluateAmount($(\"#f-amount\").value)" in js
    assert "applyAmountKey(base, btn.dataset.k)" in js   # base: 改账首键重打时是空串
    assert "parseFloat($(\"#f-amount\").value)" not in js
    assert 'btn.dataset.k === "done"' in js
    assert "again" not in js                       # 再记整个撤了
    assert 'dataset.fresh' in js and '/^[0-9]$/.test(btn.dataset.k)' in js
    #    ↑ 改账带出的旧金额: 首个数字键 = 整个重打 (⌫/运算键则正常接着编辑)
    assert "function saveEntry()" in js
    assert '"pointerdown"' in js and '"clear"' in js   # 长按 ⌫ 清空
    assert '"/bookkeeping/api/categories"' in js
    assert 'saveLS("bk-categories-v2"' in js \
        and 'loadLS("bk-categories-v2"' in js   # v2: 类别树换成 pydantic 形状
    assert "#cat-tiles" in js and "treeFor(sheetKind)" in js
    assert "cat-sub" not in js                     # 子类行撤了
    assert "function parseTags(" in js and "function nowTime(" in js
    # 标签列表层: 挖财种子 (创建时间倒排) 与本账本用过的合并, 单选一枚选中即收
    assert "function tagLib(" in js and "function updateTagPill()" in js
    assert "catTree && catTree.tags" in js and "function addTypedTag()" in js
    assert "sheetTags" in js
    assert "? [] : [tag]" in js            # 单选: 点的就是唯一的一枚 (再点取下)
    assert "sheetTags = [tag];" in js      # 打的新标签也直接选作这一枚
    assert "sheetTags.push(" not in js     # 多选上限那套撤了
    # 备注浮层输入: 从备注行原位升起 rides 系统键盘 (贴键盘上方), 数字键盘让位 (页面不动)
    assert "function openNoteKb()" in js and "function placeNoteKb(bottom)" in js
    assert '$("#note-btn").addEventListener("click", openNoteKb);' in js
    assert "visualViewport" in js
    assert '$("#amt-pad").style.visibility = "hidden";' in js
    # 从行原位升起: 开层先钉在备注行那 (无声), 聚焦带 preventScroll 不让 iOS 推页面;
    # 升键过程贴键盘顶往上走, 但不从出发线往下跳 (不是天降新框)
    assert "kbFrom" in js and "pointer: coarse" in js
    assert "preventScroll: true" in js and "getBoundingClientRect().top" in js
    assert "Math.min(kbFrom, vv.offsetTop + vv.height)" in js
    assert '$("#note-done")' not in js          # 浮层无完成钮 (系统键盘回车/blur 收)
    # 视口医生 (tesla-viewport 瘦身移植): 满高记档 + 冻矮自愈 + dvh 探针, --shell-h 补黑边
    assert "bk.fullInner" in js and '"--shell-h"' in js
    assert "function shellH(" in js and "function dvhLie()" in js
    assert '$("#f-tags")' not in js and '$("#tag-chips")' not in js   # 平摊胶囊撤了
    assert 'time: e.time || ""' in js and "tags: e.tags || []" in js  # 同步映射
    assert '$("#grab-zone")' in js and "translateY(${dy}px)" in js    # 把手拖动
    assert "CATEGORY_ICONS" in js and "CATEGORIES" not in js
    assert 'fill="currentColor"' in js and '<mask' in js and '<use href="#ci-' in js
    #    ↑ 图形: icon-park-outline 线稿 (1.4.0 末段换过面性, iPhone 上 <use> 影子树
    #    url 引用不渲染又回退); sprite 注入按形态分流 —— 带 <mask 的本体提升进
    #    文档级共享 defs 不进影子树 (iOS WebKit 解析不了影子树里的 url(#…) 引用,
    #    挂它的元素整枚不渲染; 眼下线稿集里没有 mask 体, 机制留着防再栽)
    assert 'mask="url(#ci-m-${name})"' in js and 'style="display:none"' not in js
    #    ↑ 分流盖板引文档级 mask (id 注入时重编); sprite 隐身走 0×0 绝对定位
    #    (display:none 的引用源 Safari 也认不全)
    assert "catIcon(val, sheetKind)" in js           # 子类格按全路径取自己的图标; 底色跟方向走
    assert '"bolt-one"' in js and "car-battery" not in js  # 充电: 插头图形
    assert "\"虾饺\": 'cat'" in js and "shrimp" not in js   # 虾饺是只猫 (家里的猫咪)
    assert "COMMON_CATS" in js                      # 常见格清单 (恰填满 5×3)
    assert "#ci-more" not in js and "catAll" not in js   # 「…」全部钮整个撤了
    assert "function updateAmtHead()" in js         # 金额行类别牌随选择刷新
    assert '$("#amt-cat").classList.toggle("on", !!sheetCat);' in js   # 选上翻白点亮
    # 类别树选层: 点「选类别」弹整棵树, 手风琴 (大类点开才亮小类, 开一收窝), 小类点一下选好即收
    assert "function openCatPick()" in js and "function closeCatPick()" in js
    assert '$("#amt-cat").addEventListener("click", openCatPick);' in js
    assert '$("#cp-list").addEventListener("click"' in js
    assert "cp-top" in js and "cp-kids" in js and 'classList.add("open")' in js
    assert "cpRow(top, top, true)" in js           # 没子类的大类: 一级行直选
    assert '<span class="cp-ic">${catIcon(top, sheetKind)}</span>' in js   # 大类标题带图标 (solo 行同款)
    # 时间拨轮: whenVal 单一事实源 (开层摆轮位/拨定回写/保存读), 拆回 date/time 进条目
    assert "function whenPicked()" in js and "function fmtWhen(" in js
    assert "= whenPicked()" in js and '$("#when-btn")' in js
    assert "function fillLoop(" in js and "function buildDateWheel(" in js
    assert "function wpFace(" in js and "WP_ITEM" in js
    assert "datetime-local" not in js and "$(\"#f-when\")" not in js  # 系统控件彻底退场
    assert '"#sheet-calc"' not in js and '"#sheet-save"' not in js   # 展开/保存钮接线撤了
    assert "togglePad" not in js                    # 键盘常驻, 无展开收起逻辑
    assert "gesturestart" in js                     # iOS 捏合缩放掐非标准手势事件


def test_bookkeeping_sheet_gestures():
    """整层手势 (触屏): 左右划换收支 — switchKind 与点标签页共用, 只换类别那一摊
    (金额/备注/键盘都不动); 任意部位下拽关层 (层内容超高时让给滚动);
    划/拽过的那一下点击当场吃掉 (不顺着误触格子)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    modules = ("bookkeeping-viewport", "bookkeeping-merge", "amount-calculator",
               "bookkeeping-state", "category-icons", "bookkeeping-render",
               "bookkeeping-sync", "bookkeeping-entry-sheet",
               "bookkeeping-amount-pad", "bookkeeping-boot")
    js = "".join((base / f"{name}.js").read_text(encoding="utf-8")
                 for name in modules)
    assert "function switchKind(" in js and "document.body.dataset.kind" in js
    #    ↑ 点标签页/左右划共用换收支; 方向配色 (支出红/收入绿) 挂 body 跟走
    assert 'dx < 0 ? "expense" : "income"' in js      # 左划支出, 右划收入
    assert "Math.abs(dx) > 30" in js and "scrollHeight <= sheet.clientHeight + 1" in js
    #    ↑ 横划判定阈值; 层内容超高时下拽让给滚动 (把手仍可拽)
    assert '"touchstart"' in js and '"touchcancel"' in js
    assert 'kind === "expense" ? "swap-l" : "swap-r"' in js   # 滑入方向跟切换方向走
    assert 'classList.remove("swap-l", "swap-r")' in js       # 连划几下每次都重放


def test_bookkeeping_expense_category_required():
    """支出类别必填: 点「完成」时没选类别、或只挂到还有小类的大类上 (如只点
    「餐饮」没点「早餐」) 不放行 —— 类别牌抖一下 (与金额无效同一个提示路数);
    选到小类 / 没子类的大类 (房贷这类) / 收入方向不拦; 不在树里的旧类别名不拦
    (老数据照旧能改)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    js = (base / "bookkeeping-amount-pad.js").read_text(encoding="utf-8")
    css = (base / "css" / "bookkeeping-entry-sheet.css").read_text(encoding="utf-8")
    assert 'sheetKind === "expense"' in js and "shakeCategory()" in js
    assert "function shakeCategory()" in js    # 类别牌抖一下: 与 shakeAmount 同款
    assert 'sheetCat && !sheetCat.includes("/")' in js   # 挂大类的 (无「/」): 查它有没有小类
    assert "bareTop.children.length" in js      # 有小类的大类单独挂着 → 不放行
    assert "treeFor" in js.split("/* exported")[0]   # treeFor 借自 entry-sheet (全局)
    assert ".amt-cat.shake { animation: amt-shake .3s; }" in css   # 复用金额那组抖动
    assert 'id="amt-cat"' in (base / "bookkeeping.html").read_text(encoding="utf-8")


def test_bookkeeping_js_selectors_all_exist():
    """回归: 各模块字面量 $("#id") 引用的元素, bookkeeping.html 里必须真有 ——
    2026-09-22 撤主页菜单后 boot.js 还接着不存在的 #logout, 开局 TypeError
    把 render/首同步整个带崩 (重开应用首页空着, 记过的账不显示)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    ids = set(re.findall(r'id="([^"]+)"', html))
    modules = ("bookkeeping-viewport", "bookkeeping-merge", "amount-calculator",
               "bookkeeping-state", "category-icons", "bookkeeping-render",
               "bookkeeping-sync", "bookkeeping-entry-sheet",
               "bookkeeping-amount-pad", "bookkeeping-boot")
    sel = re.compile(r'\$\("#([A-Za-z0-9_-]+)"\)'
                     r'|querySelector(?:All)?\("#([A-Za-z0-9_-]+)"\)')
    missing = []
    for name in modules:
        src = (base / f"{name}.js").read_text(encoding="utf-8")
        for ln, line in enumerate(src.splitlines(), 1):
            for a, b in sel.findall(line):
                if (a or b) not in ids:
                    missing.append(f"{name}.js:{ln} #{a or b}")
    assert not missing, f"JS 引用了 html 里不存在的元素: {missing}"


def test_bookkeeping_sync_strip_failure_state():
    """同步状态条不说谎: 上次尝试没连上时如实显示「没连上 · 稍后自动重试」,
    不再误显「已同步」(没有待传的账时尤其误导 —— 老账刚导入那阵子坑过人)。"""
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    js = (base / "bookkeeping-sync.js").read_text(encoding="utf-8")
    assert "let syncFailed = false;" in js
    assert "syncFailed = true;" in js and "syncFailed = false;" in js
    assert "没连上 · 稍后自动重试" in js
    assert js.index("syncFailed)") < js.index("`已同步 ·")   # 失败态排在已同步前面
