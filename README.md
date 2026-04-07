# MarginNote Importer for Obsidian

将 MarginNote 4 学习集脑图一键导入 Obsidian，生成 [Enhancing Mindmap](https://github.com/MarkMindCkm/obsidian-enhancing-mindmap) 兼容的 `.md` 文件。

## 功能

- 📂 **一键导入**：在 Obsidian 内直接读取 MarginNote SQLite 数据库，无需命令行
- 🧠 **完整脑图结构**：保留 MarginNote 的树结构、子脑图嵌套、跨页高亮拼接
- 🔗 **Deep Link**：每个节点附带 `marginnote4app://` 链接，点击可跳回 MarginNote
- 📁 **自动文件夹组织**：通过 3-pass wikilink 分析，自动推断子脑图的嵌套关系
- ⚙️ **可配置**：数据库路径、输出目录、节点宽度、手动嵌套映射均可在设置面板调整

## 安装

### 手动安装（推荐）

1. 下载 [最新 Release](https://github.com/yzy-lex/obsidian-marginnote-importer/releases)（或从源码构建）
2. 将以下 3 个文件放入 `<你的 Vault>/.obsidian/plugins/marginnote-importer/`：
   - `main.js`
   - `manifest.json`
   - `sql-wasm.wasm`
3. 打开 Obsidian → 设置 → 第三方插件 → 刷新 → 启用 **MarginNote Importer**

### 从源码构建

```bash
git clone https://github.com/yzy-lex/obsidian-marginnote-importer.git
cd obsidian-marginnote-importer
npm install
npm run build
```

构建后 `main.js`、`manifest.json`、`sql-wasm.wasm` 会在项目根目录生成。

## 使用方法

1. 打开 Command Palette（`Cmd+P`）
2. 搜索 **"从 MarginNote 导入脑图"**
3. 在弹出的列表中选择学习集
4. 等待导入完成 ✅

也可以点击左侧 Ribbon 栏的 🧠 图标触发导入。

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| MarginNote 数据库路径 | `~/Library/Containers/QReader.MarginStudy.easy/.../MarginNotes.sqlite` | 支持 `~` 前缀 |
| 输出目录 | `脑图` | vault 内子脑图文件的存放目录 |
| 节点最大宽度 | `300` px | MarkMind 节点的 CSS max-width |
| Block ID 起始深度 | `3` | ≥ 此深度的 heading 会添加 Obsidian block ID |
| 手动嵌套映射 | 空 | 格式为 `子标签 → 父标签`，每行一条 |

## 输出格式

生成的 `.md` 文件使用 MarkMind 的 `basic` 模式：

```markdown
---

mindmap-plugin: basic

mindmap-layout: mindmap6
---

# 学习集名称

## 📌 节点标题 <br> 高亮文本 <a href="marginnote4app://...">📖 Open in MN</a>

### 📂 [[脑图/子脑图名|子脑图标签]]
```

### 图标约定

| 图标 | 含义 |
|------|------|
| 📌 | 节点标题 |
| 📂 | 子脑图链接（wikilink） |
| 📖 | 跳转到 MarginNote |

## 技术栈

| 依赖 | 用途 |
|------|------|
| [sql.js](https://github.com/sql-js/sql.js/) | WASM SQLite 引擎，读取 MarginNote 数据库 |
| [bplist-parser](https://www.npmjs.com/package/bplist-parser) | 解析 ZNOTES 二进制 plist（跨页高亮 LinkNote） |

## 限制

- **仅支持 Desktop**：需要 Node.js `fs` 模块读取 vault 外部的 SQLite 文件
- **仅支持 MarginNote 4**（macOS Catalyst 版本）
- 数据库为只读访问，不会修改 MarginNote 数据

## 项目结构

```
src/
├── main.ts          # 插件入口：命令注册、导入流程编排
├── settings.ts      # 设置面板（含手动嵌套映射编辑）
├── types.ts         # 类型定义
├── db.ts            # sql.js 封装：打开 DB、查询 ZTOPIC/ZBOOKNOTE
├── parser.ts        # 脑图树构建、文本优先级、bplist 解析、子脑图检测
├── generator.ts     # MarkMind .md 生成 + 3-pass 文件夹重组
├── topic-modal.ts   # 学习集选择对话框
└── vendor.d.ts      # sql.js / bplist-parser 类型声明
```

## 致谢

本插件由 [Claude](https://claude.ai)（Anthropic）协助开发。感谢 AI 让不会编程的人也能实现奇思妙想。

## License

MIT
