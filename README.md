# Crazy Universe

VS Code / Cursor 扩展：管理多个开发任务上下文，并记录开发工作流

## 功能

- 任务分「当前任务 / 活动 / 已完成」；同时最多一件进行中
- 开始 / 暂停 / 完成；已完成可恢复到活动（已暂停），不会自动开始
- 按任务名称搜索；有关键字时只显示「搜索结果」，取消搜索后该分类消失
- 用户主动标记（修改内容、问题、下一步计划等）；时间线按任务回顾
- 状态变更与标记时采集只读快照：分支、正在看的文件、本任务期间的提交
- 本任务期间提交默认展示 3 条，可「展开更多 / 收起」
- 飞书id支持打开任务；无 ID 则 `#none`

## 启动

目前未上架扩展市场。需要 Node.js 20+。

```bash
npm install
```

打开仓库，按 **F5**编译

日常开发可另开终端：

```bash
npm run watch
```

改完代码后，在开发窗口执行 `Developer: Reload Window`

改过 Webview（任务列表 / 时间线）时建议重新 F5，否则可能仍显示旧页面

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