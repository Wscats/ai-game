# 🎮 AI Tank Battle

> 一款由大语言模型（LLM）驱动的回合制坦克对战游戏。多个 AI 模型在战场上自主思考、决策、对战，展现不同模型的策略能力。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16-green.svg)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

## ✨ 特性

- 🤖 **多模型对战** — 支持 2~4 个 AI 同时对战，可选 DeepSeek、Kimi、混元、GLM、MiniMax 等模型
- 🧠 **AI 实时思考** — 每个 AI 的行动意图、决策过程实时展示在界面两侧
- 🗺️ **丰富地形** — 雪地（减速）、森林（隐蔽）、河流（不可通行）等多种地形
- 🧱 **可破坏环境** — 砖墙可被炮弹摧毁，钢墙不可穿透
- 🚀 **导弹系统** — 导弹可穿透建筑物直接攻击敌人
- ⬆️ **武器升级** — 拾取升级道具提升伤害和攻击范围
- 🎲 **随机事件** — 补给箱、地雷、护盾、加速、毒雾、弹药、空袭等 11 种战场事件
- 🎬 **战斗回放** — 游戏结束后可逐帧回放整场战斗
- 📊 **详细统计** — 命中率、伤害输出、HP 变化等完整数据统计
- 🌐 **零依赖服务端** — 纯 Node.js 原生 HTTP 服务器，无需任何第三方依赖

## 📸 界面预览

```
┌─────────────────────────────────────────────────────┐
│                    Game Header                       │
├──────┬──────┬──────┬────────────────────────────────┤
│ 🔴红方 │ 🔵蓝方 │ 🟢绿方 │ 🟣紫方  ← 精简面板(HP+统计) │
├──────┴──────┴──────┴────────────────────────────────┤
│ 🔴行动意图 │                          │ 🟢行动意图    │
│ 🧠思考     │                          │ 🧠思考       │
│ 📊详情     │      Canvas 战斗区域      │ 📊详情       │
│ 📋记录     │                          │ 📋记录       │
│ 🔵行动意图 │                          │ 🟣行动意图    │
│ 🧠思考     │                          │ 🧠思考       │
│ 📋记录     │      战斗日志栏           │ 📋记录       │
└────────────┴──────────────────────────┴──────────────┘
```

## 🚀 快速开始

### 前置要求

- **Node.js** >= 16
- **CodeBuddy CLI** — 用于调用 LLM 模型（需提前安装并配置）

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/enoyao/ai-game.git
cd ai-game

# 安装依赖（仅测试用的 puppeteer）
npm install

# 启动服务器
npm start
```

打开浏览器访问 **http://localhost:3000** 即可开始游戏。

## 🎯 游戏规则

### 基本规则

| 规则 | 说明 |
|------|------|
| 回合制 | 每回合所有玩家依次行动 |
| 强制移动 | 每回合必须移动，不允许原地等待 |
| 弹药系统 | 初始 5 发炮弹 + 1 枚导弹，需拾取弹药补给 |
| 冷却机制 | 开火后需等待 1 回合冷却，导弹需 1 回合 |
| 强制开火 | 每 3 回合内必须开火一次，否则系统自动开火 |
| 距离伤害 | 伤害随距离呈钟形曲线变化：贴脸极低(0.3x)→逐渐升高→最优距离(~165px)最高(1.5x)→逐渐降低→极远极低(0.3x) |
| 道具上限 | 场内最多同时存在 8 个道具，达到上限时不再生成新道具 |

### 可用动作

| 动作 | 说明 |
|------|------|
| `move_forward` | 向前移动 30px（受地形影响） |
| `move_backward` | 向后移动 30px（受地形影响） |
| `rotate_left` | 左转 30° |
| `rotate_right` | 右转 30° |
| `fire` | 发射炮弹（需弹药 > 0 且冷却完毕） |
| `fire_missile` | 发射导弹（穿透建筑物，需导弹 > 0） |

### 伤害系统

| 武器 | 基础伤害 | 武器升级加成 |
|------|---------|-------------|
| 炮弹 | 20 HP | 每级伤害翻倍 |
| 导弹 | 35 HP | 每级伤害翻倍 |

### 距离伤害倍率

| 距离 | 伤害倍率 | 说明 |
|------|---------|------|
| 近距离 (<80px) | 0.5x | 太近伤害减半 |
| 中距离 (80-250px) | 1.5x | 最佳射程，伤害最高 |
| 远距离 (>250px) | 0.6x | 太远伤害降低 |

### 地形效果

| 地形 | 移动速度 | 特殊效果 |
|------|---------|---------|
| 🟫 地板 | 100% | 无 |
| ❄️ 雪地 | 60% | 减速 |
| 🌲 森林 | 70% | 隐蔽（敌方不可见） |
| 🌊 河流 | — | 不可通行 |

### 战场道具

| 道具 | 效果 |
|------|------|
| 📦 补给箱 | 回复 30 HP |
| 💣 地雷 | 踩中扣 25 HP |
| 🛡️ 护盾 | 抵挡下一次伤害 |
| ⚡ 加速 | 2 回合移动速度翻倍 |
| ☠️ 毒雾 | 范围内每回合扣 8 HP，持续 3 回合 |
| 🔫 弹药 | +3 发炮弹 |
| 🚀 导弹 | +1 枚导弹（可穿透建筑物） |
| ⬆️ 武器升级 | 提升伤害和攻击范围 |
| ⚡ EMP | 所有坦克冷却重置为 3 回合 |
| ✈️ 空袭 | 随机区域造成 15 HP 伤害 |
| 🧱 坍塌 | 随机摧毁一处砖墙 |

## 🤖 支持的 AI 模型

| 模型 ID | 名称 | 图标 |
|---------|------|------|
| `deepseek-v3-2-volc` | DeepSeek V3 | 🧠 |
| `kimi-k2.5` | Kimi K2.5 | 🌙 |
| `hunyuan-2.0-thinking` | 混元 2.0 | 🔥 |
| `glm-5.0` | GLM-5.0 | 🤖 |
| `glm-4.7` | GLM-4.7 | ⚡ |
| `minimax-m2.7` | MiniMax M2.7 | 🎯 |
| `minimax-m2.5` | MiniMax M2.5 | 💫 |
| `glm-5.0-turbo` | GLM-5.0 Turbo | 🚀 |

## 📁 项目结构

```
ai-game/
├── server/
│   └── index.js          # HTTP 服务器 + AI 决策 API（零依赖）
├── public/
│   ├── index.html         # 游戏主页面（配置/对战/回放/结果四屏）
│   ├── css/
│   │   └── style.css      # 全局样式（暗色主题 + 响应式布局）
│   └── js/
│       ├── app.js         # 前端应用逻辑（UI 交互/状态管理）
│       ├── game.js        # 回合制游戏引擎（核心逻辑）
│       ├── tank.js        # 坦克实体（移动/开火/状态管理）
│       ├── bullet.js      # 子弹/导弹模拟（碰撞检测/弹道计算）
│       ├── map.js         # 地图生成（障碍物/地形）
│       ├── renderer.js    # Canvas 渲染引擎（绘制/动画/特效）
│       ├── constants.js   # 游戏常量配置
│       └── timer-worker.js # Web Worker 计时器（后台标签页支持）
├── test/
│   └── headless-test.js   # Puppeteer 无头浏览器自动化测试
├── logs/                   # AI 交互日志（自动生成）
├── package.json
└── LICENSE                 # MIT License
```

## 🔌 API 接口

服务端提供以下 REST API：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/models` | GET | 获取可用模型列表 |
| `/api/ai-decision` | POST | 单个 AI 决策请求 |
| `/api/ai-decision-batch` | POST | 批量 AI 决策请求（并行） |
| `/api/health` | GET | 健康检查 |

### AI 决策请求示例

```json
POST /api/ai-decision
{
  "model": "deepseek-v3-2-volc",
  "playerId": "red",
  "gameState": {
    "round": 5,
    "mapWidth": 800,
    "mapHeight": 600,
    "tanks": { ... },
    "obstacles": [ ... ],
    "distance": 320,
    "angleToEnemy": 45,
    "lineOfSight": true
  }
}
```

### AI 响应格式

```json
{
  "action": "fire",
  "thought": "敌人在视野内，直接开火"
}
```

## 🧪 测试

项目包含基于 Puppeteer 的端到端自动化测试：

```bash
# 安装测试依赖
npm install

# 运行无头测试（默认 20 回合）
npm test

# 可视化模式（打开浏览器观看）
npm run test:visible

# 快速测试（5 回合）
npm run test:fast

# 自定义模型和回合数
node test/headless-test.js --p1=deepseek-v3-2-volc --p2=glm-5.0 --rounds=10
```

## 📝 AI 日志

每次 AI 交互都会记录到 `logs/` 目录下的日志文件中，格式为 `ai-interactions-YYYY-MM-DD.log`，包含：

- 回合数、玩家、模型
- 完整的 Prompt 内容
- AI 原始响应
- 解析后的动作和思考
- 响应耗时

## 🛠️ 技术栈

- **前端**：原生 HTML5 Canvas + CSS3 + JavaScript（无框架）
- **后端**：Node.js 原生 HTTP 模块（零依赖）
- **AI 调用**：通过 CodeBuddy CLI 调用各大模型 API
- **测试**：Puppeteer 端到端自动化测试
- **渲染**：Canvas 2D 绘图 + 粒子特效系统
- **计时**：Web Worker 保证后台标签页正常运行

## 📄 License

[MIT](LICENSE) © enoyao
