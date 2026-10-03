# 离线扑克牌型比较服务

Windows 本地可运行的七张扑克牌最佳五张牌型比较后端，仅提供 API 与 CLI。
使用 TypeScript + Node.js（>= 22，推荐 24+）+ SQLite（Node 内置 `node:sqlite`，无原生依赖、无 Docker、无外部服务）。

## 功能

- 标准 52 张牌（无大小王/万能牌），接受 5 或 7 张互不重复的实体牌。
- 自实现五张分类与七选五（枚举 21 个子集取最优），不依赖任何扑克求解库。
- 九种牌型：高牌、一对、两对、三条、顺子、同花、葫芦、四条、同花顺。
- A2345 仅作五高顺子；QKA23 不成立；花色不参与比较；踢脚与两对顺序完整处理。
- 多人比较：5 张公共牌 + 每人 2 张底牌，整体查重，允许完全使用公共牌，返回并列名次。
- 输出最佳五张组合、牌型、等级向量与中文解释；相同牌力的最佳实体组合可能不止一个，按固定牌序展示一份，不影响平局判断。
- SQLite 持久化牌例、参与者、规则版本与不可变分析快照；旧分析不会被后续修改覆盖，重启后可读取。

## 快速开始

```powershell
npm install
npm run build     # 编译 TypeScript 到 dist/
npm test          # 构建并运行全部确定性测试
npm run demo      # 内置示例：公共牌成最大牌型平局 + 同对子踢脚比较
npm start         # 启动 API（默认端口 0，自动选空闲端口）
```

端口配置：`node dist/cli.js serve --port 8080` 或环境变量 `PORT`。
数据库路径：环境变量 `POKER_DB`，默认 `data/poker.db`（项目内数据目录）。

## CLI

```
node dist/cli.js import As Ks Qs Js Ts --name 皇家
node dist/cli.js analyze As Ks Qs Js Ts 2c 3d
node dist/cli.js analyze-hand 1
node dist/cli.js compare --board "As Ks Qs Js Ts" --player "甲:2c 3d" --player "乙:7h 8h"
node dist/cli.js explain 1
node dist/cli.js export
node dist/cli.js demo
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/hands/import` | 导入牌例 `{name?, cards:[...]}` |
| GET | `/api/hands` | 列出牌例 |
| POST | `/api/analyze` | 分析 `{cards:[...]}` 或 `{handId}` |
| POST | `/api/compare` | 多人比较 `{board:[5], players:[{name, hole:[2]}]}` |
| GET | `/api/analyses/:id` | 查看历史分析快照与解释 |
| GET | `/api/analyses` | 列出分析 |
| GET | `/api/export` | 导出全部数据 JSON |

## 牌面格式与错误码

- 牌面：点数 `2-9 T J Q K A` + 花色 `s h d c`，大小写不敏感（如 `As`、`aS`）。
- 错误码：`UNKNOWN_CARD`（未知牌）、`DUPLICATE_CARD`（重复牌）、`WRONG_COUNT`（张数错误）、`NOT_FOUND`、`VALIDATION`、`INTERNAL`。
- 等级向量：`[类别, ...比较值]`，类别 0-8 由低到高，同类逐项比较，花色不参与。

## 测试

`npm test` 覆盖：九种牌型、A2345 低顺、非连续同花、两组三条选葫芦、三组对子、四条踢脚、公共牌重复冲突、枚举小牌例校对七选五、输入牌序与花色置换不变性、反对称性与传递性、重复错误不落库、重启后读取历史快照。全部为确定性用例，不使用随机抽样。

## 限制

- 仅分析给定牌，不计算胜率、不模拟下注、不管理资金、不提供在线牌局。
- `node:sqlite` 在 Node 25 仍打印 ExperimentalWarning，属正常现象。
- 仅支持 5 或 7 张牌的评估；多人比较固定为 5 张公共牌 + 每人 2 张底牌。
