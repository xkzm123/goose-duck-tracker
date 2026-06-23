# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

鹅鸭杀记牌助手 — 专为《鹅鸭杀》（Goose Goose Duck）设计的纯前端辅助记牌工具。无框架、无构建步骤，原生 HTML/CSS/JS 静态页面。所有游戏数据保存在浏览器 localStorage，不上传服务器。

## Git 提交规范

- **所有 commit message 必须使用中文**。
- 格式：`<type>: <简短描述>`，type 可选 `feat` / `fix` / `docs` / `style` / `refactor`。
- 正文用 `-m` 追加详细说明，同样使用中文。

## 启动开发

```bash
python server.py        # 本地静态服务，端口 3000，禁用缓存
# 浏览器访问 http://localhost:3000
```

也可用 `npx serve .` 等任意静态服务器，根目录指向仓库即可。无 lint、无测试、无构建命令。

## JS 模块加载顺序

`index.html` 中 `<script>` 标签按以下依赖顺序加载，**不可调换**：

1. `data.js` — 静态数据（见下文）
2. `state.js` — 全局状态管理，依赖 `data.js`（`getRoleFaction`）
3. `phase1.js` — 初始化阶段 UI，依赖 `state.js` + `data.js`
4. `phase2.js` — 游戏阶段 UI，依赖 `state.js` + `data.js`
5. `phase3.js` — 会议阶段 UI，依赖 `state.js` + `data.js`
6. `export.js` — 导出复盘，依赖 `state.js`
7. `ai.js` — AI 推理，依赖 `state.js` + `data.js`
8. `aliyun-asr.js` — 阿里云语音，独立模块（但 `ai.js` 初始化时需其已存在）
9. `app.js` — 主控制器，依赖所有以上模块
10. `jinang.js` — 锦囊妙计，依赖 `state.js`（非关键路径，最后加载）

所有模块使用 IIFE 模式（`const ModuleName = (() => { ... })();`），全局命名空间为 window。

## 核心架构：三阶段流转

应用围绕三个阶段的流转设计：

```
初始化(Phase1) → 游戏(Phase2) ⇄ 会议(Phase3)
```

- **Phase1（初始化）**：配置玩家人数(4-16)、选择地图、阵营人数、明牌角色、我的角色。游戏开始后左栏锁定。
- **Phase2（游戏）**：交互式 SVG 地图，点击节点记录路径、输入目击玩家编号。支持按住空格语音记录。点「进入会议」提交当前轮次。
- **Phase3（会议）**：玩家卡片（存活/死亡、可信度、阵营标记、角色认领、备注、目击历史）、阵营统计面板、拖拽连线标记抱团关系。点「下一轮」回到 Phase2，轮次 +1。

`App.switchPhase(phase)` 是唯一合法的阶段切换入口，由 `app.js` 管理。

## 全局数据对象（`data.js` 导出）

- **`ROLES`**：角色数组，每个 `{ name, faction, initials, aliases?, disabled? }`。`initials` 是拼音首字母（用于搜索），`aliases` 是常见误识别别名。
- **`MAPS`**：`{ spaceship, church, basement, jungle }` 四个地图对象。每个地图 `{ id, name, width, height, nodes: [{id, label, x, y, aliases?}], edges: [[fromId, toId]] }`。节点坐标是像素值（含边距偏移 20px）。
- **`FACTION_META`**：`{ goose, duck, neutral }` 各含 `{ label, icon, color }`。
- **`PLAYER_COLORS`**：1-15 号玩家的连线颜色映射。
- **`JINANG_DB`**：锦囊妙计数据库，每项 `{ id, type: 'general'|'role'|'chaos', text, role? }`。
- **`getRoleFaction(roleName)`** / **`searchRoles(query)`**：工具函数。搜索支持中文名、拼音首字母、别名匹配。

## 状态管理（`state.js`）

全局状态对象 `gameState` 通过 `State` API 读写，每次写操作自动 `saveState()` 到 `localStorage`（key: `goose_duck_tracker_v1`）。

核心状态字段：
- `phase`: `'init'|'game'|'meeting'`
- `round`: 当前轮次号
- `config`: `{ playerCount, map, factions: {goose,duck,neutral}, openRoles[], openRoleDrafts{} }`
- `players`: `{ [num]: { alive, trust, faction, role, notes: {roundN: text} } }`
- `currentPath`: 当前轮次路径 roomId 数组
- `currentSightings`: `{ roomId: [playerNums] }`
- `currentGroups`: 当前轮次抱团关系 `[{from, to}]`
- `rounds`: `{ [roundN]: { path, sightings, groups } }` — 已提交轮次存档
- `myRole`: 我的角色名

关键 State API：`startGame()`, `commitRound()`, `nextRound()`, `getFactionStats()`, `getPlayerSightings(num)`, `addToPath(roomId)`, `setSighting(roomId, nums)`.

## AI/语音模块

- **AI 推理**（`ai.js`）：支持 DeepSeek 官方 API（默认 `deepseek-v4-pro`）和硅基流动两套后端，SSE 流式输出。会议阶段按钮触发，构建包含全部玩家状态、目击、路径、阵营统计的 prompt。API Key 存 localStorage key `goose_duck_ai_key`。
- **阿里云 ASR**（`aliyun-asr.js`）：WebSocket 连接阿里云 Paraformer 实时语音识别，PCM 16kHz 采样。
- 语音配置存 localStorage key `goose_duck_aliyun_config`，可切换 Chrome 内置或阿里云。按住空格开始录音，松开停止 — Phase1（明牌角色）和 Phase2（地图目击）各自独立实现空格监听。

## 修改记录维护规范

- **每次完成代码修改、Bug 修复或新功能开发后，必须主动将变更的总结说明保存到 `修改记录.md` 文件中。**
- **每天的修改必须写在同一天的标题下，按序号排列。绝对禁止使用「后续修订」「补充修改」等子区块来分割当天的内容。**
- **如果当前的修改覆盖、重构了当天的某个已有功能，必须直接修改、覆盖日志中原有的那条记录。绝对禁止保留重复的记录（即绝对不允许同时存在废弃方案和新方案的记录）。每天的日志必须是当前最新代码状态的精准反映，保持精简。**
- 记录格式：按日期倒序（最新日期在最顶部），每条包含涉及的文件、变更摘要、技术要点。

## 仓库

- **GitHub**：`https://github.com/xkzm123/goose-duck-tracker`
- **远程**：`origin` → `https://github.com/xkzm123/goose-duck-tracker.git`

## 部署

- **Netlify**：`netlify.toml` 配置 publish 目录为根目录 `.`。
- **GitHub Pages**：`docs/` 目录发布为宣传介绍页（非应用本身）。
- **自定义域**：主域名 `luvlua.cn`，备用 `goose-duck-tracker.netlify.app`。
- 页面包含 Umami 统计脚本（`index.html` 中 `<script defer src="https://cloud.umami.is/script.js">`），在自建部署时可按需删除。

## 响应式设计要点

- 竖屏有旋转提示蒙层（`#rotate-overlay`），强制横屏使用。
- 手机横屏（`max-width:960px and orientation:landscape`）触发特殊布局：会议阶段使用 Tab 切换（玩家/阵营/分析），角色选择用全屏 Modal 而非内联下拉，备注用弹出 Modal 编辑。
- 地图 `map-canvas` 为固定尺寸的 SVG + 绝对定位节点容器。桌面端通过右键拖动平移（CSS Transform），移动端通过 `overflow: scroll` 触摸滚动。

## 微信小程序 web-view 集成

支持通过 URL 参数 `?tip=/pages/reward/index` 或全局变量 `window.__GOOSE_TIP_MINIPROGRAM_PATH__` 配置小程序内赞赏页路径。打赏按钮点击时优先尝试 `wx.miniProgram.navigateTo()`，失败则显示二维码弹窗。
