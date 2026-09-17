// ESLint 9 扁平配置 —— 前端门禁 (与后端 pylint/mypy 对齐, 由 run_tests.sh 调用)。
// 独立仓口径: 账号层页面 (app/home/static) + 记账应用 (app/bookkeeping/static,
// 纯逻辑模块 bookkeeping-merge / amount-calculator 带 UMD 尾巴供 node 测试,
// 页面脚本按 bookkeeping.html 里的顺序加载, 跨模块引用走全局, 头部自带
// /* global */ 与 /* exported */ 注释)。
// 注意: `...js.configs.recommended` 只带 name/rules 等键, 块内若再写 `rules:`
// 会整体覆盖展开结果 (recommended 悄悄失效过), 必须 `...js.configs.recommended.rules`。
import js from "@eslint/js";
import globals from "globals";

// 页面脚本通用规则: recommended 全量 + 允许函数提升引用 (事件驱动组织)
const pageScript = {
  ...js.configs.recommended,
  rules: {
    ...js.configs.recommended.rules,
    "no-use-before-define": ["error", { functions: false, classes: false }],
    // 经典脚本的 catch 静默吞错是常态 (fetch 失败已有兜底展示)
    "no-unused-vars": ["error", { caughtErrors: "none" }],
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
};

export default [
  // 不检查: venv / 数据目录 / node_modules (组合仓内是软链)
  { ignores: [".venv/**", "data/**", "node_modules/**"] },

  // 账号层 (app/home/static): 登录/注册/账号管理页面脚本 (经典脚本,
  // 按 html 里的顺序加载; 跨模块引用走全局, 头部自带 /* global */ 注释)
  {
    files: ["app/home/static/*.js"],
    ...pageScript,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser },
    },
  },

  // 记账应用 (app/bookkeeping/static): 纯逻辑 (bookkeeping-merge /
  // amount-calculator, 带 UMD 尾巴供 node 测试) 先加载; 页面脚本按逻辑
  // 拆成小文件 (bookkeeping-*.js), 经典脚本按 bookkeeping.html 里的顺序
  // 加载。跨模块引用走全局, 每个文件头部自带 /* global */ (用到别处
  // 定义的) 与 /* exported */ (本文件定义、别处用的) 注释。
  {
    files: ["app/bookkeeping/static/*.js"],
    ...pageScript,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, module: "readonly" },
    },
  },

  // 前端单元测试 (node:test, ESM)
  {
    files: ["tests/js/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
