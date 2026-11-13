# 剧情书速查（手机离线单文件网页）

把官方中文剧情书做成一个 html 文件，传到手机上直接打开（不用联网），方便在各段落之间跳转。
只给用户自用：**剧情正文和图片是版权内容，输入数据和生成的 html 都不进仓库**（本目录 `.gitignore` 已挡住 `*.html`，`template.html` 除外）。

## 生成

```bash
node tools/story-reader/build.cjs <storybook-official-data.js 的路径> [输出路径，默认 ./剧情书速查.html]
```

- 输入：用户提供的 `storybook-official-data.js`（`window.STORYBOOK_OFFICIAL_DATA`，C1–C5）。
- 章节结构（C1–C3 的章节、遭遇分组、排序）取自仓库里的 `story/storybook-placeholder.js`；C4/C5 自带章节信息。
- 数据精简后 gzip + base64 嵌进 `template.html` 的 `__DATA__`，页面用 `DecompressionStream` 解压（约 3MB）。

## 已有功能

- 顶部切换故事集 C1–C5；首页输入主线编号跳转；搜索编号或关键词（当前故事集内，命中词标黄）。
- 章节页：编号段落排成数字格子，有标题的段落（遭遇开头等）列在上面。
- 正文里「查看 / 参见 / 返回 / 前往 / 见 + 四位编号（或 M 编号）」变成可点按钮。
  解析规则与剧情书页面 `story/assets/app.js` 的 `preferredEntry` 一致：**同一章节优先，其次主线，再其次本书任意位置**（分支冒险有自己的 0001… 编号）。
  「备注“段落0047”（不要现在查看！）」故意不做成链接。
- 路由用 `location.hash`，手机返回键可用；阅读页底栏「上一段 / 目录 / 下一段」（上一段/下一段用 replace，不堆历史）。
- 字号、深浅色、最近看过存在 localStorage（读写都包了 try/catch）。
- 底栏高度由脚本实测写进 `--bottom-h`，正文底部留同样的空白（iPhone 底部安全区曾把最后几行挡住）。

## 用词（用户要求统一为官方中文）

- 章节名、遭遇分组名、C4/C5 段落标题：用 `assets/ato-terms.js` 的官方用词表替换（作用域取剧情书跳转器标题处
  `#encounterSelect, #entryTitle, #resultList, #memoryList`），再叠加私人版偏好：冒险中枢/冒险枢纽 → 分支冒险，
  休憩冒险 / R&R 冒险 → 休整冒险，法洛斯之梦 → 航标梦境。章节名去掉结尾的英文原名和 v2.0。
- C1–C3 的段落标题（officialTitle）和正文本身就是官方校对稿，**不要再套用词表**——表里有按词替换的条目，
  会把官方的「市场力量」改成「市场狂怒」、「恶性循环」改成「恶性故事集」。
- C4/C5 正文没有官方译本，只替换上面几个私人版偏好的专有名词，不套整张表。
- C2 书名暂用「深渊凝视者」（官方 PDF 书名）；主控台用词表里是「深渊凝望者」，用户还没决定统一成哪个。

## 待做：正文里的图标和图片

剧情书页面显示正文时，会用图文混排程序 `story/assets/mixed-media/renderer.js`（样式 `styles.css`）
把资源图标、战斗地形图标/示意图、战斗版图、密码横幅等插进正文。它需要两样不在仓库里的东西，随 `.atopack` 资料包分发：

- `story/assets/mixed-media/mapping.js`（哪一段的哪些文字换成哪张图；按正文文字指纹定位）
- `story/assets/mixed-media/images/`

用户的资料包在自己电脑的 F 盘。下一步：

1. 从 `.atopack`（就是 zip）里取出上面两样，**不要提交进仓库**。
2. 先核对 mapping 能对上多少条官方中文正文（mapping 按文字版本定位，可能只对应民间版文字），把结果告诉用户再继续。
3. 参考 `story/assets/app.js` 里 `mixedMediaRuntime` / `mixedMediaContext` / `sectionRenderer` 的用法和
   `story/tests/mixed-media.test.cjs`，把渲染接进 `template.html` 的阅读页。
4. 图片压缩后嵌进 html（data URI）。注意总大小，太大时把整张战斗版图之类改成点开才显示，或另外打包。

用户在 iPhone 上用（iOS 的 Chrome 打不开本地 html，用 Documents 之类自带浏览器的 App），也在安卓平板上用。
