# 鹅鸭杀记牌助手

专为《鹅鸭杀》（Goose Goose Duck）设计的**纯前端**辅助记牌工具：在浏览器里完成初始化、地图路径、会议信息整理，可选 **语音输入** 与 **AI 推理**。数据保存在本机，无需安装客户端。

<p align="center">
  <a href="https://luvlua.cn/"><strong>luvlua.cn</strong></a>
  &nbsp;·&nbsp;
  <a href="https://goose-duck-tracker.netlify.app"><strong>备用</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/luvlua0808-png/goose-duck-tracker/archive/refs/heads/main.zip">下载 ZIP</a>
  &nbsp;·&nbsp;
  <a href="https://luvlua0808-png.github.io/goose-duck-tracker/">宣传页（图文）</a>
</p>

---

## 亮点速览

| 标签 | 说明 |
|------|------|
| 免费开源 | 代码公开，可自行部署或二次修改 |
| 无需安装 | 静态页面，解压即用或打开在线地址 |
| 离线可用 | 下载到本地后，核心记牌不依赖服务器 |
| 语音 / AI | 可选：按住空格说话、硅基流动 DeepSeek 推理（Key 仅存本地） |

另有图文 **[宣传页](https://luvlua0808-png.github.io/goose-duck-tracker/)**（[GitHub Pages](https://pages.github.com/)，发布自仓库 `docs/`）。若 404：打开仓库 **Settings → Pages**，Source 选 **Deploy from a branch**、`main`、Folder **`/docs`**，保存后等几分钟。克隆到本地也可直接打开 `docs/index.html`。

---

## 界面预览

<p align="center">
  <img src="docs/screenshoot00.png" alt="初始化" width="32%" />
  <img src="docs/screenshoot01.png" alt="游戏记录" width="32%" />
  <img src="docs/screenshoot02.png" alt="会议" width="32%" />
</p>

<p align="center"><em>初始化 · 地图与路径 · 会议与阵营</em></p>

---

## 核心功能

- **地图与路径**：支持 **老妈鹅飞船、鹅教堂、地下室、丛林殿堂** 等地图；在地图上记录移动路径与房间目击。
- **会议与玩家卡片**：为每位玩家标记阵营、角色、可信度、备注与目击历史；阵营统计（鹅 / 鸭 / 中立 / 未知）实时更新。
- **明牌与配置**：本局人数、阵营人数、我的角色、明牌角色等在一页完成。
- **角色检索**：支持中文名与拼音首字母等方式快速定位角色（具体交互以页面为准）。
- **语音记录（可选）**：例如地图页的语音记录入口；可在 **AI 设置** 中选择 Chrome 内置识别或阿里云语音识别。
- **AI 推理（可选）**：会议阶段使用「AI 帮我捋一下」等入口，接入配置的模型（如 DeepSeek-V3），对当前局信息做整理与提示；**API Key 仅保存在浏览器本地**。
- **本局导出**：支持导出本局复盘文本，便于赛后回顾。
- **打赏（可选）**：页面内提供入口；若嵌入微信小程序 web-view，可通过 URL 参数 `tip` 或全局变量配置小程序内赞赏页路径（详见 `js/app.js` 内注释）。

---

## 使用方式

### 在线使用

**主域名：** <https://luvlua.cn/>

**备用：** <https://goose-duck-tracker.netlify.app>

### 本地使用（离线）

1. [下载仓库 ZIP](https://github.com/luvlua0808-png/goose-duck-tracker/archive/refs/heads/main.zip) 或 `git clone` 本仓库。  
2. 解压到任意目录。  
3. **推荐**：在项目根目录启动本地静态服务（避免部分浏览器对 `file://` 的限制），例如：

```bash
python server.py
# 浏览器访问 http://localhost:3000
```

也可使用 `npx serve .` 等任意静态服务器，根目录指向本仓库根目录即可。

4. 开始一局：配置人数与地图 → **开始游戏** → 游戏中可配合语音/地图记录 → **进入会议** 整理信息。  
5. **AI（可选）**：点击 **AI 设置**，填入硅基流动 API Key 并保存；在会议阶段使用 AI 相关按钮即可。

更图文并茂的步骤说明见 **[宣传页](https://luvlua0808-png.github.io/goose-duck-tracker/)** 中的「如何使用」一节。

---

## 技术与隐私

- **技术栈**：原生 HTML / CSS / JavaScript，无构建步骤；部署可参考 `netlify.toml`。线上 **luvlua.cn**，备用 **goose-duck-tracker.netlify.app**。
- **数据**：游戏状态保存在浏览器本地（如 `localStorage`），不上传至作者服务器。  
- **统计**：页面可能包含第三方访问统计脚本（见 `index.html`），用途为访问量分析；若不希望在自建部署中启用，可自行删除对应 `<script>` 标签。

---

## 仓库结构（节选）

| 路径 | 说明 |
|------|------|
| `index.html` | 主应用入口 |
| `css/styles.css` | 全局样式 |
| `js/` | `app.js` 流程、`phase1/2/3` 各阶段、`state.js` 状态、`data.js` 角色与地图数据、`ai.js` 等 |
| `docs/` | 对外介绍页 `index.html`、截图与微信名片素材 |
| `images/` | 应用内用到的图片资源（如打赏收款码） |

---

## 声明与提示

- 本工具为 **非官方** 第三方辅助，与《鹅鸭杀》官方无关；请遵守游戏与平台规则，理性使用。  
- 国内访问 GitHub 若不稳定，可优先使用上文 **在线地址** 与 **ZIP 下载**；工具主体在下载后可离线使用。

---

## 作者联系与支持

有问题或建议，欢迎加微信交流；如果这个小工具对你有帮助，也欢迎随缘支持一杯「奶茶」——会用于续一点算力，继续做下一件顺手的小东西。

<table>
<tr>
<td align="center" width="50%" valign="top">
<strong>微信名片</strong><br/>
<sub>扫码添加作者微信</sub><br/><br/>
<img src="docs/wechat.jpg" alt="微信名片二维码" width="200" />
</td>
<td align="center" width="50%" valign="top">
<strong>打赏收款码</strong><br/>
<sub>应用内右上角「打赏」也可打开</sub><br/><br/>
<img src="images/wechat-receive-qr.png" alt="微信收款码" width="220" />
</td>
</tr>
</table>

---

<p align="center">
  <sub>made by <strong>luvlua</strong> · 免费开源 · 无广告</sub>
</p>
