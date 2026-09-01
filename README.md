# Crazy Universe

[English](README.md) | [简体中文](README.zh-CN.md)

A VS Code extension for managing multiple development task contexts and recording your workflow locally, privacy-first.

## Install

Install [Crazy Universe](https://marketplace.visualstudio.com/items?itemName=CrazyUniverse.crazy-universe) from the Visual Studio Marketplace, or search **Crazy Universe** in the VS Code Extensions view.

## Features /Local builds

Install a given version from the matching `.vsix` link below (Extensions → `…` → **Install from VSIX…**). All builds: [version/](version/).

### [1.1.0](version/crazy-universe-1.1.0.vsix)

- **Tools** group in the task list: enable / disable / hide an in-house plugin without mixing it into task search
- Optional **Feishu worklog** (In-house plugin, not official 日志管理): pick closed work segments on the timeline and submit hours after you confirm
- Work-segment view: time range + duration + workspace/branch; in-progress segments are shown but not selectable
- Multi-select sums closed-segment minutes (gaps such as lunch are not counted); same-day segments merge into one entry, cross-day selection walks 1/n dialogs you can switch between (Cancel skips this day, Cancel all stops the rest); still one work item
- Sign in via Tools → **Sign in to Feishu worklog** (dedicated Chrome profile). The extension still works offline if worklog is off



### [1.0.0](version/crazy-universe-1.0.0.vsix)

- Tasks are grouped into **Current / Active / Completed**; at most one task can be in progress
- Start / pause / complete; a completed task can be moved back to Active (paused) and is not started automatically
- Search by task title; while a query is active only **Search results** is shown
- Add notes (changes, issues, next steps, and more); review them on the per-task timeline
- Read-only snapshots on status changes and notes: branch, file in view, and commits during this task
- Commits during this task show 3 by default, with **Show more / Collapse**
- Feishu IDs open the matching task; if none is found the UI shows `#none`
- Switch the sidebar, prompts, and status bar between **English** and **中文** with the globe icon (left of search), or set `Crazy Universe: Locale`



## Development

Clone this repo. Requires Node.js 20+.

```bash
npm install
```

Open the repo and press **F5** to compile and launch the Extension Development Host.

For day-to-day work, keep a watch build in another terminal:

```bash
npm run watch
```

After changing code, run **Developer: Reload Window** in the development window.

After changing a webview (task list / timeline), press **F5** again; otherwise the old page may still be shown.

## Project layout

```text
Crazy_Universe/
├── src/
│   ├── extension.ts          # entry
│   ├── i18n.ts               # English / 中文 strings
│   ├── commands/             # commands
│   ├── domain/               # state machine, TaskService
│   ├── store/                # local JSON
│   ├── snapshot/             # read-only Git and open files
│   ├── feishu/               # Feishu link detection
│   ├── views/                # task list, timeline, status bar
│   └── webview/              # task list / timeline HTML
├── resources/                # Activity Bar, status, and action icons
├── docs/                     # product / visual / development docs
├── version/                  # versioned VSIX builds
├── package.json
├── package.nls.json          # English contributes strings
├── package.nls.zh-cn.json    # Chinese contributes strings
└── esbuild.js
```



## Test and package

```bash
npm run lint
npm run package
```



## Feedback

Please open [Issues](https://github.com/Tqy43/Crazy_Universe/issues).