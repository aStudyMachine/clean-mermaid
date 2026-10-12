export type CaptureLanguage = "zh" | "en";

export interface CaptureDiagram {
	/** 决定文件名：`compare-<slug>-<lang>-<side>.png`。 */
	slug: string;
	/** 控制台里用的短标题。 */
	title: string;
	/** 按文档语言分的 mermaid 源码，均不含任何 `%% cm: %%` 或 `%%{init}%%` 指令。 */
	codes: Record<CaptureLanguage, string>;
}

/** 捕获顺序即数组顺序；两侧入口都按这个顺序遍历。 */
export const CAPTURE_LANGUAGES: readonly CaptureLanguage[] = ["zh", "en"];

/**
 * README「渲染对比」用的四张图，各备中英两套文案（中文文档用 `zh`、英文文档用 `en`），
 * 共 4 × 2 语言 × 2 侧 = 16 张 PNG。
 *
 * 四条容易被改坏的地方：
 * - **两侧必须同源**：插件侧与原生侧都遍历本文件，任一图只在这里改一次，不要另起副本。
 * - **状态图的状态名只能用单词**：mermaid 12.1.0 的 stateDiagram-v2 词法里状态名规则是
 *   `/^(?:[^:\n\s\-\{]+)/i`，含空格或连字符会被切成两个 token 而报错，所以英文侧写
 *   `Pending` / `Shipped`，不能写 `Pending payment` 或 `In-transit`；确需多词只能走
 *   `state "Pending payment" as s1` 的引号别名形式。
 * - **ER 图的关系标签同样只能是单词**：标签与实体名共用同一条 token 规则
 *   （`[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-_\[\]().,\u00C0-\uFFFF*]*`，不含空白），
 *   多写的词**不会报错**，而是被静默当成一个新实体画成孤立方框（曾因此画出名为 `with` 的框）——
 *   所以写 `tagged`，不要写 `tagged with`。判据是渲染后的图，不是 `mermaid.parse` 是否通过。
 * - **时序图的 `as` 是「id as 显示名」**：写反了不会报错，而是让消息里引用的 id 找不到声明、
 *   被 mermaid 当成新参与者自动补出一条生命线（曾因此画出 4 条生命线）。两边文案的 id 都是
 *   `U` / `W` / `A`，只有 `as` 之后的显示名随语言变。
 *
 * 四张图都是日常会写的规模（≤10 个节点），刻意避开验收库里的「大」与「极端」两节。
 * 第四张是诚实的对照组 —— 时序图不受 ELK 影响，两侧布局相同，只有配色与字体不同。
 */
export const CAPTURE_DIAGRAMS: readonly CaptureDiagram[] = [
	{
		slug: "build-pipeline",
		title: "flowchart TD",
		codes: {
			zh: `flowchart TD
  A([开始]) --> B[拉取源码]
  B --> C{缓存命中？}
  C -->|命中| D[复用缓存依赖]
  C -->|未命中| E[安装依赖]
  D --> F[编译构建]
  E --> F
  F --> G{测试通过？}
  G -->|通过| H[发布制品]
  G -->|失败| I[归档日志]
  I --> E`,
			en: `flowchart TD
  A([Start]) --> B[Checkout source]
  B --> C{Cache hit?}
  C -->|Hit| D[Reuse cached deps]
  C -->|Miss| E[Install deps]
  D --> F[Build]
  E --> F
  F --> G{Tests pass?}
  G -->|Pass| H[Publish artifact]
  G -->|Fail| I[Archive logs]
  I --> E`,
		},
	},
	{
		slug: "order-state",
		title: "stateDiagram-v2",
		codes: {
			zh: `stateDiagram-v2
  [*] --> 待支付
  待支付 --> 已支付 : 支付成功
  待支付 --> 已关闭 : 超时未支付
  已支付 --> 配送中 : 仓库出库
  配送中 --> 已完成 : 签收
  配送中 --> 配送中 : 物流轨迹更新
  已完成 --> [*]
  已关闭 --> [*]`,
			en: `stateDiagram-v2
  [*] --> Pending
  Pending --> Paid : Payment received
  Pending --> Closed : Payment timeout
  Paid --> Shipped : Dispatched
  Shipped --> Completed : Delivered
  Shipped --> Shipped : Tracking update
  Completed --> [*]
  Closed --> [*]`,
		},
	},
	{
		slug: "blog-er",
		title: "erDiagram",
		codes: {
			zh: `erDiagram
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
			en: `erDiagram
  AUTHOR ||--o{ POST : writes
  POST }o--|{ TAG : tagged
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
	},
	{
		slug: "login-sequence",
		title: "sequenceDiagram",
		codes: {
			zh: `sequenceDiagram
  autonumber
  actor U as 用户
  participant W as 网页
  participant A as 认证服务
  U->>W: 输入账号密码
  W->>A: POST /login
  activate A
  A-->>W: 返回令牌
  deactivate A
  W-->>U: 登录成功
  Note over A,W: 令牌有效期 2 小时`,
			en: `sequenceDiagram
  autonumber
  actor U as User
  participant W as Web
  participant A as Auth service
  U->>W: Enter credentials
  W->>A: POST /login
  activate A
  A-->>W: Return token
  deactivate A
  W-->>U: Login succeeded
  Note over A,W: Token valid for 2 hours`,
		},
	},
];
