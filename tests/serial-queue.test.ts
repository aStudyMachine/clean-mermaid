import { describe, expect, it } from "vitest";
import { createSerialQueue } from "../src/serial-queue";

/** 手动控制的 Promise，用来验证任务确实是一个接一个执行。 */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createSerialQueue", () => {
	it("starts the next task only after the previous one settles", async () => {
		const queue = createSerialQueue();
		const gate = deferred<string>();
		const order: string[] = [];

		const first = queue(async () => {
			order.push("first");
			const value = await gate.promise;
			order.push("first-done");
			return value;
		});
		const second = queue(async () => {
			order.push("second");
			return "b";
		});

		await Promise.resolve();
		expect(order).toEqual(["first"]);

		gate.resolve("a");
		await expect(first).resolves.toBe("a");
		await expect(second).resolves.toBe("b");
		expect(order).toEqual(["first", "first-done", "second"]);
	});

	it("keeps running after a rejected task", async () => {
		const queue = createSerialQueue();
		const order: string[] = [];

		const failing = queue(async () => {
			order.push("failing");
			throw new Error("boom");
		});
		const next = queue(async () => {
			order.push("next");
			return "ok";
		});

		await expect(failing).rejects.toThrow("boom");
		await expect(next).resolves.toBe("ok");
		expect(order).toEqual(["failing", "next"]);
	});

	it("preserves call order across three tasks", async () => {
		const queue = createSerialQueue();
		const order: number[] = [];
		const results = await Promise.all(
			[3, 1, 2].map((delay, index) =>
				queue(async () => {
					await new Promise((resolve) => setTimeout(resolve, delay));
					order.push(index);
					return index;
				}),
			),
		);
		expect(results).toEqual([0, 1, 2]);
		expect(order).toEqual([0, 1, 2]);
	});
});