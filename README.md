# Crazy Universe

VS Code / Cursor 扩展：管理多个开发任务上下文，并记录开发工作流。本地、隐私优先，不改代码、不执行 Git 写操作。

## 功能

- 任务分「当前任务 / 活动 / 已完成」；同时最多一件进行中
- 开始 / 暂停 / 完成；已完成可恢复到活动（已暂停），不会自动开始
- 按任务名称搜索；有关键字时只显示「搜索结果」，取消搜索后该分类消失
- 用户主动标记（修改内容、问题、下一步计划等）；时间线按任务回顾
- 状态变更与标记时采集只读快照：分支、打开的文件、`git status` 摘要、本任务期间的提交
- 本任务期间提交默认展示 5 条，并显示总数；打开的文件可点击跳转（路径相对 Git 仓库根）
- 快照中的「飞书」：无关联时显示 `#none`；标题或正文里有飞书链接 / `飞书 #id` 时可点击跳转

## 启动

目前未上架扩展市场。需要 Node.js 20+。

```bash
npm install
```

打开本仓库，用 **Run Extension (Crazy Universe)** 或按 **F5**。会先编译，再弹出开发窗口；在左侧 Activity Bar 点 Crazy Universe。

日常开发可另开终端：

```bash
npm run watch
```

改完代码后，在开发窗口执行 `Developer: Reload Window`。改过 Webview（任务列表 / 时间线）时建议重新 F5，否则可能仍显示旧页面。

## 界面要点

- **任务**：标题栏 `搜索` / `+`；行内按钮靠右（开始、暂停、标记、恢复）；右键菜单出现在鼠标旁，点别处即关
- **时间线**：标题栏漏斗筛选（全部 / 状态 / 标记）与添加标记；事件按时间轴展示，默认新到旧、无序号
- **状态栏左侧**：`无当前任务` 或 `标题 · 进行中`，点击打开当前任务菜单

数据在本机：`%APPDATA%\Cursor\User\globalStorage\Tqy43.crazy-universe\`（VS Code 则为对应编辑器的 `globalStorage`）。

## 项目结构

```text
Crazy_Universe/
├── src/
│   ├── extension.ts          # 入口
│   ├── commands/             # 命令
│   ├── domain/               # 状态机、TaskService
│   ├── store/                # 本地 JSON
│   ├── snapshot/             # 只读 Git 与打开文件
│   ├── feishu/               # 飞书链接识别
│   ├── views/                # 任务列表、时间线、状态栏
│   └── webview/              # 任务列表 / 时间线 HTML
├── resources/                # Activity Bar、状态、操作图标
├── docs/                     # 产品 / 视觉 / 开发文档
├── package.json
└── esbuild.js
```

## 测试与打包

```bash
npm test
npm run lint
npm run package
```

## 问题反馈

请提 [Issues](https://github.com/Tqy43/Crazy_Universe/issues)。
