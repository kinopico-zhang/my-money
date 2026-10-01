"""记账类别与页面测试: 挖财种子导入, 类别树端点, 金额键盘。
拆自 test_bookkeeping.py (结构化重构); JS 接线断言拆去了
test_bookkeeping_js_wiring.py。"""
from fastapi.testclient import TestClient

import app.main as m
from tests.bookkeeping_sync_helpers import _user

# ---------------------------------------------------------------- 类别 (挖财导入)

def test_categories_seeded_from_wacai(usersdb, bkdb):
    """类别树种子: 空库建好就有 (挖财导出的 163 类), 大类在前子类随后。"""
    from app.bookkeeping import store  # pylint: disable=import-outside-toplevel
    tree = store.category_tree(bkdb)
    assert len(tree.expense) == 14           # 支出大类
    assert len(tree.income) == 15            # 收入大类
    canyin = tree.expense[0]
    assert canyin.name == "餐饮"
    assert "早餐" in canyin.children and "餐饮其他" in canyin.children
    income_names = [group.name for group in tree.income]
    assert "工资薪水" in income_names and "顺风车" in income_names
    # 子类总数对上 (大类的子类拼起来)
    assert sum(len(group.children) for group in tree.expense) == 134
    assert all(group.children == [] for group in tree.income)
    assert len(tree.tags) == 30 and tree.tags[0].name == "20260718龙南游"   # 历史标签种子
    assert tree.tags == sorted(tree.tags, key=lambda t: t.created, reverse=True)   # 创建时间倒排
    # 「其他」兜底小类一律沉组尾 (挖财导来的兜底命名不一): 老库里旅游的「其他」
    # 种在中间 (把它的序号改到最前模拟), 读取口照样把它沉到最后 — 库不用动
    from sqlalchemy import update  # pylint: disable=import-outside-toplevel
    bkdb.execute(update(store.Category)
                 .where(store.Category.parent == "旅游",
                        store.Category.name == "其他")
                 .values(sort=-1))
    for group in store.category_tree(bkdb).expense:
        others = [n for n in group.children if n.endswith("其他")]
        assert group.children[len(group.children) - len(others):] == others


def test_categories_seeded_only_once(usersdb, bkdb):
    """非空不重种: 再跑一次种子 (幂等), 行数不长。"""
    from sqlalchemy import func, select  # pylint: disable=import-outside-toplevel
    from app.bookkeeping import store  # pylint: disable=import-outside-toplevel
    store.seed_default_categories()
    store.seed_default_categories()
    count = bkdb.execute(
        select(func.count()).select_from(store.Category)).scalar_one()
    assert count == 163


def test_categories_api_serves_tree(usersdb):
    """GET /bookkeeping/api/categories: 登录可拿两级树, 形状给前端画胶囊。"""
    client, _ = _user(usersdb, "记账人甲")
    r = client.get("/bookkeeping/api/categories")
    assert r.status_code == 200, r.text
    tree = r.json()
    tops = {g["name"]: g["children"] for g in tree["expense"]}
    assert tops["交通"][0] == "充电"          # 子类有序 (种子顺序)
    assert "房贷" in tops and tops["房贷"] == []
    assert any(g["name"] == "工资薪水" for g in tree["income"])
    assert [t["name"] for t in tree["tags"]][:2] == ["20260718龙南游", "20260519新疆游"]   # 历史标签随树下发
    assert tree["tags"][0]["created"] == "2026-07-19"


def test_categories_api_requires_login(usersdb):
    """类别接口也是登录态资源: 未登录 401。"""
    anon = TestClient(m.app)
    assert anon.get("/bookkeeping/api/categories").status_code == 401


def test_bookkeeping_page_has_amount_keyboard():
    """金额键盘 (常驻吸底 iOS 扁平风): 右列 ⌫/完成 两枚大键, 完成就是保存
    (无另设保存钮); 顶部收入/支出是标签页不是按钮; 金额行类别牌 (readonly 金额框,
    只由键盘写入; 不带人民币符号, 类别牌选上亮本色线稿); 类别格 5×3 常见格
    (全部类别点「选类别」弹类别树手风琴选层 (大类标题带图标), 没子类的大类带图标铺成一级行直选),
    图标圆底平时暗井, 线稿未选中灰、选中翻本色圆底压白线稿 (1.5.2 改款); 备注独占一行 (无边框样, 点开弹 rides 系统键盘的浮层输入:
    从行原位升起、数字键盘让位、页面不动、贴键盘上方垫不透底, 无完成钮 —
    系统键盘回车/点别处收),
    时间/标签并一行收瘦 (胶囊不描边, 底色自分), 时间点开是 iOS 闹钟式拨轮 (日期/时/分),
    标签收进牌里点开弹列表 (单选一枚, 选中即收; 创建时间倒排); 全程禁双指缩放;
    把手下拉关闭 + 整层手势 (左右划换收支只换类别, 任意部位下拽关层);
    顶部 My Money 菜单撤了 (页面从同步状态条起 — 垫高让开状态栏; 更新日志/退出登录留在更新日志页);
    支出红/收入绿 (特意调柔: 标签页/金额大字/选中类别图标跟方向走, 主页汇总与账目行同色路);
    选层类别图标与格子同尺寸、选中同款高亮;
    类别图标圆底在 svg 里自带 (恒暗井 --icon-tint); IconPark 线性 currentColor 线稿;
    金额键盘方正满铺 (无圆角, 键贴屏幕两边);
    视口医生 (tesla 移植) 治底部黑边 (--shell-h 钉真满高); 纯逻辑脚本单独成文件。"""
    from pathlib import Path  # pylint: disable=import-outside-toplevel
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    # 样式拆去了 css/ (结构化重构), 断言拼齐 html + 全部 css 文件
    css = "".join(p.read_text(encoding="utf-8")
                  for p in sorted((base / "css").glob("*.css")))
    icons = (base / "category-icons.js").read_text(encoding="utf-8")
    assert 'id="f-amount" type="text" inputmode="none" readonly placeholder="0.00"' in html
    assert 'id="amt-pad"' in html and 'id="amt-eq"' in html
    assert 'class="cat-tiles" id="cat-tiles"' in html
    assert 'id="cat-sub"' not in html and 'cat-sub' not in css  # 子类上格后子类行整个撤掉
    for k in ("back", "done", "7", "8", "9", "/", "4", "5",
              "6", "*", "1", "2", "3", "-", "0", ".", "+"):
        assert f'data-k="{k}"' in html, f"键盘缺键 {k}"
    assert 'data-k="again"' not in html           # 再记键撤了 (完成一记到底)
    assert 'data-k="clear"' not in html          # 清空改长按 ⌫
    assert 'id="sheet-save"' not in html and 'id="sheet-calc"' not in html
    assert 'save-row' not in html and 'save-row' not in css   # 大保存钮退场, 键盘完成就是保存
    assert 'class="tabs" id="kind-seg"' in html             # 收支切换是标签页
    seg = html[html.index('id="kind-seg"'):]    # 标签页里收入在前 (body 上的方向配色属性不算)
    assert seg.index('data-kind="income"') < seg.index('data-kind="expense"')
    assert 'id="sheet-close"' in html and 'id="sheet-del"' in html
    assert 'id="amt-cat-ic"' in html and 'id="amt-cat-name"' in html   # 金额行类别牌
    assert 'class="cur"' not in html and ".amt-line .cur" not in css   # 人民币符号撤了
    assert 'id="cat-pick"' in html and 'id="cp-list"' in html   # 类别树选层 (点「选类别」弹)
    assert 'position: sticky; bottom: 0' in css   # 键盘常驻吸底
    assert 'id="brand-menu"' not in html and "/static/menu-user.js" not in html   # 顶部菜单撤了
    assert "padding: var(--top-clear) 14px 7px;" in css   # 同步条垫高让开状态栏 (顶栏没了它顶头);
    #    独立模式钉 --top-clear 之下 — 系统模糊带里不留常驻内容 (my-music 同款)
    assert "border: 1.5px solid var(--ink-3)" not in css   # 圆底自带, 不描边
    assert ".ci { color: var(--cc); }" in css   # 本色线稿 (page.css 全局脸; 弹层里另有灰/亮收口)
    assert '<circle cx="24" cy="24" r="24" style="fill: var(--sel, var(--icon-tint))"/>' in icons \
        and "translate(7.2 7.2) scale(.7)" in icons   # 圆底平时白井 (--icon-tint), 图形缩一圈居中
    assert "function catTint(" not in icons and "--icon-red-tint" not in css \
        and "ci-ring" not in icons   # 未选中: 白圆底不描边 (红/绿淡底撤)
    assert 'kind === "income" ? "var(--icon-green)" : "var(--icon-red)"' in icons \
        and "function catColor(" in icons and "#e0554d" not in icons
    #    ↑ 线稿跟收支方向走 (支出柔红/收入柔绿 — 图标专用降饱和档, 高饱和红绿太跳; 一类一色色板撤了), --sel 兜底链盖 --icon-tint
    assert ".note-line {" in css and ".note-t.empty { color: var(--ink-3); }" in css
    #    ↑ 备注行: 无边框样, 空时灰提示
    assert "#note-kb {" in css and "#note-kb[hidden] { display: none; }" in css
    #    ↑ 备注浮层输入 (rides 系统键盘)
    assert "#note-kb::after" in css and "height: var(--shell-h, 100dvh);" in css
    #    ↑ 键盘半透: 浮层以下垫不透的底 (高度吃 --shell-h, dvh 赖账也不漏)
    assert "padding: 5px 11px" in css                # 胶囊牌整体收瘦 (少占地方)
    # 选层图标收小 (34 方 — 主页账目行同尺度, 大井在树里占地方);
    # 大类→小类明显缩进: 小类图标起头对齐大类名字 (2 边距 + 34 井 + 8 缝)
    assert ".amt-ic .ci, .cat-tiles .ti .ci, .cp-ic .ci { width: 100%; height: 100%;" \
           " display: block; }" in css   # 圆铺满各自的井 (井多大圆多大)
    assert "width: 34px; height: 34px;" in css.split(".cp-ic {")[1].split("}")[0]
    assert "padding-left: 42px;" in css
    assert ".cp-row.cp-solo {" in css            # 没子类的大类: 铺成一级行直选
    assert "max-height: calc(var(--shell-h, 100dvh) - 24px)" in css   # 弹层高吃真满高
    assert "min-height: var(--shell-h, 100dvh);" in css   # 页高吃 --shell-h (冻矮补偿)
    assert "overflow-x: hidden; touch-action: pan-y" in css   # 拨轮只上下拨, 横向死锁
    assert 'max-height: 34dvh' not in css         # 格子不再自带内滚 (默认 5×3 就一屏)
    # 时间: 与标签并一行 (备注独占上一行, 点开弹 rides 系统键盘的浮层输入), 名字缩进提示字; 点时间牌弹 iOS 闹钟式拨轮 (日期/时/分)
    assert 'class="row2 one"' in html
    assert 'id="when-btn"' in html and 'id="when-label"' in html
    assert 'class="note-line"' in html and 'id="note-btn"' in html
    assert 'id="note-kb"' in html and 'id="f-note"' in html
    assert 'placeholder="输入备注..."' in html
    assert 'id="f-when"' not in html and "datetime-local" not in html  # 系统时间控件退场
    assert 'id="when-pick"' in html and 'id="wp-date"' in html \
        and 'id="wp-hour"' in html and 'id="wp-min"' in html   # 三列拨轮
    assert 'id="f-date"' not in html and 'id="f-time"' not in html
    # 标签: 收进牌里, 点开弹列表 (创建时间倒排), 顶部可打新标签
    assert 'id="tag-btn"' in html and 'id="tag-label"' in html
    assert 'id="tag-pick"' in html and 'id="tp-list"' in html and 'id="tp-new"' in html
    assert 'id="f-tags"' not in html and 'id="tag-chips"' not in html   # 平摊的标签行撤了
    assert 'id="grab-zone"' in html and 'touch-action: none' in css  # 把手下拉关闭
    assert "touch-action: pan-y" in css           # 全应用禁双指缩放 (body 收口)
    assert "--cat-icon" not in css and "grayscale" not in css   # 统一色变量退役: 圆底 svg 里自带, 不滤镜
    assert 'src="/bookkeeping/static/amount-calculator.js?v=1"' in html
    assert 'src="/bookkeeping/static/bookkeeping-viewport.js?v=1"' in html   # 视口医生最先加载


def test_bookkeeping_sheet_kind_colors_and_pad():
    """方向配色与键盘铺法: 支出红/收入绿挂 body (标签页/金额大字跟方向走, 弹层外
    的选层也吃得到; 主页汇总与账目行同一个色路; 1.5.2 起类别图标未选中灰线稿、
    选中翻本色圆底压白线稿 (本色即方向色, 自选色盖它), 类别牌图标圆心对齐类别格第一列, 胶囊牌不描边 (底色自分),
    金额键盘方正满铺 (无圆角, 键贴屏幕两边, 1px 发丝缝)。"""
    from pathlib import Path  # pylint: disable=import-outside-toplevel
    base = Path(__file__).parent.parent / "app" / "bookkeeping" / "static"
    html = (base / "bookkeeping.html").read_text(encoding="utf-8")
    css = "".join(p.read_text(encoding="utf-8")
                  for p in sorted((base / "css").glob("*.css")))
    assert 'body[data-kind="expense"]' in css and 'body[data-kind="income"]' in css
    #    ↑ 方向配色变量 (挂 body, 弹层外的选层也吃得到)
    assert ".tabs button.on { color: var(--ink-1); font-weight: 600; }" in css \
        and ".tabs button.on.inc" not in css and "color: var(--kind); text-align: right;" in css \
        and "background: var(--accent);" in css.split(".tabs button.on::after")[1].split("}")[0]
    on_ci = " { --sel: color-mix(in srgb, var(--cc) 72%, #000); color: #fff; }"
    for sel in (".cat-tiles .tile.on", ".cp-row.on", ".amt-cat.on"):
        assert f"{sel} .ci{on_ci}" in css
    #    ↑ 选中翻本色圆底压白线稿 (1.5.2 续: 底 = 行内 --cc 压深一档, 休眠 --sel 钩子启用)
    assert "--icon-tint: #2c2c2e;" in css \
        and ".ci-ring" not in css   # 未选中圆底 = 暗井一枚 (红/绿淡底撤), 边框规则整个撤掉
    assert "margin-left: max(0px, calc((100% + 12px) / 10 - 36px));" in css   # 圆心对齐格子第一列 (半图标 44/2)
    assert ".cal-day .e { color: var(--red); }" in css   # 日历每天支出柔红
    assert "font-weight: 650; font-variant-numeric: tabular-nums;\n  color: var(--red);" in css
    #    ↑ 日历格/账目行支出柔红 (收入 .in/.i 盖绿) — 与记一笔同一个色路
    assert "background: var(--surface-2); border-radius: 999px; padding: 8px 14px;" in css
    #    ↑ 时间/标签胶囊牌不描边 (底色自分)
    assert "height: 52px; border-radius: 0; font-size: 22px;" in css   # 键盘方正
    assert "repeat(5, 1fr); gap: 1px;" in css    # 键贴键 1px 发丝缝, 满铺
    assert ".amt-name { font-size: 17px;" in css   # 金额左边的类别名字调大 (原 14px)
    assert 'id="note-done"' not in html          # 备注浮层完成钮撤了 (键盘回车/点别处收)
    assert '<body data-kind="expense">' in html  # 方向配色挂 body (默认支出)
    assert ".cat-tiles.swap-l { animation: kind-swap-l .3s ease; }" in css
    #    ↑ 左右切换: 类别格顺着划的方向滑入 (去支出从右进/去收入从左进)
    assert ".amt-cat .ci, .cp-row .ci, .cat-tiles .tile .ci" \
           " { transition: color .3s ease; color: var(--ink-2); }" in css
    #    ↑ 弹层默认脸 = 灰线稿 (.on 翻彩色圆底压白线稿已在前文钉; 圆底换色另有 circle 过渡)
