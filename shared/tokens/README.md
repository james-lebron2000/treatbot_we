# Design Tokens

跨端共享的 design token 系统：一份 [`tokens.json`](./tokens.json) 数据源 → 三端 CSS 变量。

## 目录

```
shared/tokens/
├── tokens.json     # 数据源（人改这里，唯一可手动修改的文件）
├── build.mjs       # 生成器
├── README.md       # 本文件
└── (生成的三份文件，不在此处)
```

生成产物：

| 端 | 文件路径 | 引入方式 |
|---|---|---|
| Web (Vue 3) | `web/src/styles/tokens.css` | `web/src/main.ts` 在 `import './style.css'` 之前 `import './styles/tokens.css'` |
| 微信小程序 | `styles/tokens.wxss` | `app.wxss` 顶部 `@import './styles/tokens.wxss';` |
| Landing/Admin/Demo Web | `server/public/landing/tokens.css` | `<link rel="stylesheet" href="/landing/tokens.css">` |

三份文件**内容完全相同**，仅扩展名 / 路径不同；都在 `:root { ... }` 内声明 CSS 变量。

## 工作流

1. 改 `tokens.json` 中的某个值
2. 跑 `node shared/tokens/build.mjs`（或 `pnpm -C web tokens:build`）
3. `git add` 生成的三份文件 + `tokens.json` 一起 commit
4. CI 会跑 `node shared/tokens/build.mjs --check` 验证三份文件与 `tokens.json` 同步；不同步则阻止 merge

**不要手改**生成的 `tokens.css` / `tokens.wxss` —— 文件头部已注明，下次 build 会被覆盖。

## Token 分类

```
--brand / --brand-hover / --brand-soft   主品牌色（CTA / 链接 / 焦点环 / Tag 底）
--mint / --amber / --red / --lilac       语义色（success / warning / danger / info）
--xxx-soft                                各色对应的浅底色（banner 背景）

--text / --text-dim / --text-muted       文字三阶
--line                                    分隔 / 边框
--bg / --bg-soft / --bg-cream / ...      背景色

--font-sans                               字体栈（系统字体优先）
--fs-display / --fs-title / .../caption  字号 6 阶
--lh-tight / --lh-normal / --lh-relaxed  行高 3 阶

--r-sm / --r-md / --r-lg / --r-pill      圆角 4 阶
--shadow-1 / --shadow-2 / --shadow-focus 阴影 3 阶（中性灰，禁止彩色染透）
--s-1 ~ --s-12                           间距 7 阶（4/8/12/16/24/32/48 px）
```

## 使用约定

✅ **该做**：
- 用 `var(--brand)` 而非 `#2563eb`
- 用 `var(--s-4)` 而非 `padding: 16px`
- 用 `var(--shadow-1)` 而非自己写阴影
- 缺 token 时改 `tokens.json` 加新 token，跑 build，再用

❌ **不该做**：
- 在 vue/wxss 里硬编码十六进制色值（CI 会扫）
- 用 `padding: 6px / 10px / 14px / 18px / 20px / 26px` 等中间值
- 写 `box-shadow: 0 8px 30px rgba(31, 90, 199, 0.08)` 这种彩色染透阴影
- 在生成的 `tokens.css` / `tokens.wxss` 里手动加变量

## 为什么这样设计

- **SSoT 选 `tokens.json` 而非现成的 Style Dictionary**：当前需求只有 CSS 变量，加入第三方工具反而增加学习成本；100 行的 `build.mjs` 足够。
- **生成产物提交到 git** 而非 build-time 生成：让小程序构建工具（无 npm 阶段）能直接读 `styles/tokens.wxss`；同时 review 时能看到实际 diff。
- **build.mjs 用 `.mjs` 而非 `.js`**：[`shared/package.json`](../package.json) 是 `commonjs`（兼容 WeApp `require()`），`.mjs` 显式 ESM 不受其影响。
- **用 px 而非 rpx**：CSS 变量跨端一致性 > 单位习惯；微信基础库 ≥ 2.16 完全支持 px 写在 wxss 变量里（项目 `libVersion: 3.14.2`）。

## CI 集成

在 `.github/workflows/*.yml` 中添加：

```yaml
- name: Verify design tokens are in sync
  run: node shared/tokens/build.mjs --check
```

## 增改 token 时的 review checklist

- [ ] 命名遵循已有前缀（`--fs-` / `--r-` / `--s-` 等）
- [ ] 数值在已有阶梯内（间距八阶、字号六阶）—— 如要新增阶梯，需要 review 是否真的必要
- [ ] 颜色加了 `-soft` 浅底色配套（用于 banner 背景）
- [ ] 三份生成文件 hash 一致（`build --check` 通过）
- [ ] 改了主色等关键 token 时，`app.json` 的 `tabBar.color/selectedColor` 等小程序原生配置（无法用 var）也同步改了
