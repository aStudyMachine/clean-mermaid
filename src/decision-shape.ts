/**
 * 判断节点（菱形）的几何。纯计算，不碰 mermaid 运行时，可单测。
 *
 * mermaid 内置的 `question` 把菱形画成**正方形**：边长 = 文字宽 + 文字高 + 2×padding。
 * 于是 135×20 的单行标签会被撑成 179×179 的空壳。这里把它拉成固定宽高比的扁菱形，
 * 让形状贴着文字量走。
 */

/**
 * 判断节点菱形的宽高比上下限。
 *
 * 等比贴字出来的菱形比例跟着标签的胖瘦走（短标签约 2.1，长标签能到 6.6），同图并排时观感不齐。
 * 夹进这个区间是为了让「扁菱形」始终是同一个形状档次的东西 —— 两个方向的夹取都只会把菱形放大，
 * 不会破坏文字内含。
 */
export const DECISION_MIN_ASPECT = 2;
export const DECISION_MAX_ASPECT = 4;

export interface ShapeBox {
	width: number;
	height: number;
}

export interface ShapePoint {
	x: number;
	y: number;
}

/**
 * 扁菱形的包围盒：文字框每轴各加一份 padding，不够内含就整体等比放大，最后夹住宽高比。
 *
 * 文字框 `w×h` 中心对齐地落在半对角线 `A×B` 的菱形内，当且仅当 `w/(2A) + h/(2B) <= 1`；
 * 取等号时菱形面积正好是文字框的 2 倍，那就是空白下限 —— 想要「没有空白」在菱形上是不存在的。
 *
 * 这里不用固定宽高比：`A = R·B` 会把 padding 也乘上 R，横轴因此白涨
 * （R=3、padding=12 时「140px 的标签」有 72px 纯是内边距），正是原方案显胖的根因。
 */
export function decisionBox(labelWidth: number, labelHeight: number, padding: number): ShapeBox {
	let halfWidth = labelWidth / 2 + padding;
	let halfHeight = labelHeight / 2 + padding;

	const needed = labelWidth / (2 * halfWidth) + labelHeight / (2 * halfHeight);
	if (needed > 1) {
		halfWidth *= needed;
		halfHeight *= needed;
	}

	const aspect = halfWidth / halfHeight;
	if (aspect > DECISION_MAX_ASPECT) {
		halfHeight = halfWidth / DECISION_MAX_ASPECT;
	} else if (aspect < DECISION_MIN_ASPECT) {
		halfWidth = halfHeight * DECISION_MIN_ASPECT;
	}

	return { width: 2 * halfWidth, height: 2 * halfHeight };
}

/** mermaid 内置 `question` 的算法，只用来做对照与回归断言。 */
export function legacyDecisionBox(labelWidth: number, labelHeight: number, padding: number): ShapeBox {
	const side = labelWidth + labelHeight + 2 * padding;
	return { width: side, height: side };
}

/**
 * 菱形在节点局部坐标（`0..width × -height..0`）下的四个顶点，
 * 与 mermaid 原实现同一套约定 —— 这样 `getBBox()` 不含自身 transform 的性质仍然成立，
 * 布局量到的尺寸正好等于我们画的形状。
 */
export function decisionPoints(box: ShapeBox): ShapePoint[] {
	return [
		{ x: box.width / 2, y: 0 },
		{ x: box.width, y: -box.height / 2 },
		{ x: box.width / 2, y: -box.height },
		{ x: 0, y: -box.height / 2 },
	];
}
