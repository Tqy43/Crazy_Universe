# Crazy Universe

[English](README.md) | [简体中文](README.zh-CN.md)

VS Code 扩展：管理多个开发任务上下文，并记录开发工作流（本地、隐私优先）

## 安装

在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=CrazyUniverse.crazy-universe) 安装 Crazy Universe，或在 VS Code 的扩展视图中搜索 **Crazy Universe**。

## 功能/本地安装包

点下方版本号即可下载对应 `.vsix`（扩展视图 → `…` → **Install from VSIX…**）。全部安装包见 version/。

### [1.1.0](version/crazy-universe-1.1.0.vsix)

- 任务列表增加 **工具** 分组：可使用 / 停用 / 隐藏内部插件，搜索任务时不会出现
- 可选 **飞书工时**（自研工时插件，不是官方「日志管理」）：在时间线勾选已结束的工作段，确认后才登记
- 工作段视图：时间范围 + 时长 + 工作区/分支；进行中的段只展示、不可勾选
- 多选时分钟按各段相加（午饭等空隙不计）；同一天合并为一条，跨天可用 1/n 切换逐步登记（取消当前天 / 全部取消）；仍只挂一个飞书工作项
- 工具右键 **登录飞书工时**（专用 Chrome）。不开工时时，开始 / 暂停 / 标记仍可离线使用



### [1.0.0](version/crazy-universe-1.0.0.vsix)

- 任务分「当前任务 / 活动 / 已完成」；同时最多一件进行中
- 开始 / 暂停 / 完成；已完成可恢复到活动（已暂停），不会自动开始
- 按任务名称搜索；有关键字时只显示「搜索结果」，取消搜索后该分类消失
- 用户主动标记（修改内容、问题、下一步计划等）；时间线按任务回顾
- 状态变更与标记时采集只读快照：分支、正在看的文件、本任务期间的提交
- 本任务期间提交默认展示 3 条，可「展开更多 / 收起」
- 飞书 ID 支持打开任务；无 ID 则 `#none`
- 任务列表标题栏搜索左侧的地球图标可切换 **英语 / 中文**（侧栏、提示框、状态栏）；也可在设置里改 `Crazy Universe: Locale`



## 本地开发

克隆本仓库。需要 Node.js 20+。

```bash
npm install
```

打开仓库，按 **F5** 编译并启动扩展开发宿主。

日常开发可另开终端：

```bash
npm run watch
```

改完代码后，在开发窗口执行 **Developer: Reload Window**。

改过 Webview（任务列表 / 时间线）时建议重新 F5，否则可能仍显示旧页面。

## 项目结构

```text
Crazy_Universe/
├── src/
│   ├── extension.ts          # 入口
│   ├── i18n.ts               # 中英文字符串
│   ├── commands/             # 命令
│   ├── domain/               # 状态机、TaskService
│   ├── store/                # 本地 JSON
│   ├── snapshot/             # 只读 Git 与打开文件
│   ├── feishu/               # 飞书链接识别
│   ├── views/                # 任务列表、时间线、状态栏
│   └── webview/              # 任务列表 / 时间线 HTML
├── resources/                # Activity Bar、状态、操作图标
├── docs/                     # 产品 / 视觉 / 开发文档
├── version/                  # 各版本 VSIX 安装包
├── package.json
├── package.nls.json          # 英文 contributes 文案
├── package.nls.zh-cn.json    # 中文 contributes 文案
└── esbuild.js
```



## 测试与打包

```bash
npm run lint
npm run package
```



## 问题反馈

请提 [Issues](https://github.com/Tqy43/Crazy_Universe/issues)。