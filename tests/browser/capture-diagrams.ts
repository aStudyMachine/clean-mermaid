export interface CaptureDiagram {
	/** 决定文件名：`compare-<slug>-plugin.png` / `compare-<slug>-native.png`。 */
	slug: string;
	/** 控制台与 README 里用的短标题。 */
	title: string;
	/** mermaid 源码，不含任何 `%% cm: %%` 或 `%%{init}%%` 指令。 */
	code: string;
}

/**
 * README「渲染对比」用的四张小图：都是日常会写的规模（≤10 个节点），刻意避开验收库里的
 * 「大」与「极端」两节。第四张是诚实的对照组 —— 时序图不受 ELK 影响，两侧布局相同，
 * 只有配色与字体不同。
 */
export const CAPTURE_DIAGRAMS: readonly CaptureDiagram[] = [
	{
		slug: "build-pipeline",
		title: "flowchart TD",
		code: `flowchart TD
  A([开始]) --> B[拉取代码]
  B --> C{缓存命中?}
  C -->|命中| D[复用依赖]
  C -->|未命中| E[安装依赖]
  D --> F[编译构建]
  E --> F
  F --> G{测试通过?}
  G -->|是| H[发布制品]
  G -->|否| I[归档日志]
  I --> E`,
	},
	{
		slug: "order-state",
		title: "stateDiagram-v2",
		code: `stateDiagram-v2
  [*] --> 待支付
  待支付 --> 已支付 : 支付成功
  待支付 --> 已关闭 : 超时未支付
  已支付 --> 配送中 : 仓库出库
  配送中 --> 已完成 : 签收
  配送中 --> 配送中 : 物流轨迹更新
  已完成 --> [*]
  已关闭 --> [*]`,
	},
	{
		slug: "blog-er",
		title: "erDiagram",
		code: `erDiagram
  AUTHOR ||--o{ POST : 发表
  POST }o--|{ TAG : 标记
  AUTHOR {
    int id PK
    string nickname
  }
  POST {
    int id PK
    string title
  }
  TAG {
    int id PK
    string name
  }`,
	},
	{
		slug: "login-sequence",
		title: "sequenceDiagram",
		code: `sequenceDiagram
  autonumber
  actor 用户 as U
  participant W as 网页
  participant A as 认证服务
  U->>W: 输入账号密码
  W->>A: POST /login
  activate A
  A-->>W: 返回令牌
  deactivate A
  W-->>U: 登录成功
  Note over A,W: 令牌有效期 2 小时`,
	},
];
