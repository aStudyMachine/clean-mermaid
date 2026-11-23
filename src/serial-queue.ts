/**
 * 串行执行异步任务：后一个任务要等前一个结束（成功或失败）才开始。
 *
 * mermaid 渲染时会读我们写在模块里的形状设置，所以「设置赋值 + 渲染」必须整段串行，
 * 否则并发请求会互相覆盖。任何一次失败都不能卡住后面的任务。
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => Promise<T>): Promise<T> => {
		const run = tail.then(task, task);
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};
}