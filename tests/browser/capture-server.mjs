import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * README 对比图的捕获服务：托管 tests/browser 下的捕获页，并把页面 POST 回来的 PNG 写进 images/。
 * 收不齐就非零退出 —— 宁可没有图，也不要一张悄悄渲染坏了的图。
 *
 * 一轮要收 4 张图 × 2 语言（zh / en）× 2 侧 = 16 张。校验不只看张数：页面把
 * `compare-<slug>-<lang>-<side>.png` 这个集合报回来，服务端按集合比对，少一张或多一张都失败。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const imagesDir = path.join(repoRoot, "images");
const port = Number(process.env.PORT ?? 8787);

const PNG_NAME = /^compare-[a-z0-9-]+-(zh|en)-(plugin|native)\.png$/;
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_PNG_BYTES = 16 * 1024 * 1024;
const SIDES = ["plugin", "native"];
const TIMEOUT_MS = Number(process.env.SHOTS_TIMEOUT ?? 180_000);

/** file → 字节数；同名重复且字节不同即视为不可复现。 */
const received = new Map();
/** side → { count, files: Set<string> }，由页面 self-report 的 summary 推出应有的文件名集合。 */
const reported = new Map();

let closing = false;

function log(...args) {
	console.log("[shots]", ...args);
}

function fail(message) {
	if (closing) {
		return;
	}
	closing = true;
	console.error(`[shots] 失败：${message}`);
	const missing = SIDES.map((side) => `${side} ${receivedForSide(side).length}`).join(" / ");
	console.error(`[shots] 已收到：${missing}`);
	server.close(() => process.exit(1));
	// server.close 不会打断 keep-alive 连接，兜底再退一次。
	setTimeout(() => process.exit(1), 1_000).unref();
}

function receivedForSide(side) {
	return [...received.keys()].filter((name) => name.endsWith(`-${side}.png`));
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error("请求体过大"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve(Buffer.concat(chunks)));
		request.on("error", reject);
	});
}

async function handleSave(request, response) {
	response.setHeader("Content-Type", "application/json");
	let payload;
	try {
		payload = JSON.parse((await readBody(request)).toString("utf8"));
	} catch (error) {
		response.statusCode = 400;
		response.end(JSON.stringify({ error: String(error) }));
		fail(`POST 解析失败：${error instanceof Error ? error.message : error}`);
		return;
	}

	if (payload?.kind === "png") {
		const file = String(payload.file ?? "");
		if (!PNG_NAME.test(file)) {
			response.statusCode = 400;
			response.end(JSON.stringify({ error: `非法文件名 ${file}` }));
			fail(`非法文件名 ${file}`);
			return;
		}
		const bytes = Buffer.from(String(payload.base64 ?? ""), "base64");
		if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) {
			response.statusCode = 400;
			response.end(JSON.stringify({ error: `PNG 大小异常：${bytes.length}` }));
			fail(`${file} 大小异常：${bytes.length} 字节`);
			return;
		}
		const previous = received.get(file);
		if (previous !== undefined) {
			// 同一文件被重复 POST：只可能是页面被刷新或开了两次。同一份源码跨页面加载会出现几字节的
			// 栅格化差异（实测 build-pipeline-zh 81892 → 81895），那是无关正确性的抖动，不该判失败
			// ——保留先写入的那份并留痕即可，报错会把「刷新一下」变成整轮白跑。
			// 真正的完整性由 checkComplete 的集合比对负责：缺一张、多一张都过不去。
			if (previous !== bytes.length) {
				log(`${file} 被重复写入且字节数不同（${previous} → ${bytes.length}），保留先写入的那份`);
			}
			response.statusCode = 200;
			response.end(JSON.stringify({ ok: true, kept: "first" }));
			return;
		}
		await mkdir(imagesDir, { recursive: true });
		await writeFile(path.join(imagesDir, file), bytes);
		received.set(file, bytes.length);
		log(`写入 images/${file}（${bytes.length} 字节）`);
		response.statusCode = 200;
		response.end(JSON.stringify({ ok: true }));
		return;
	}

	if (payload?.kind === "done") {
		const side = String(payload.side);
		const files = new Set();
		for (const item of Array.isArray(payload.summary) ? payload.summary : []) {
			const file = `compare-${item?.slug}-${item?.language}-${side}.png`;
			if (!PNG_NAME.test(file)) {
				response.statusCode = 400;
				response.end(JSON.stringify({ error: `页面报来的条目非法：${JSON.stringify(item)}` }));
				fail(`${side} 侧报来的条目非法：${JSON.stringify(item)}`);
				return;
			}
			files.add(file);
		}
		if (files.size !== payload.count) {
			response.statusCode = 400;
			response.end(JSON.stringify({ error: "summary 与 count 不一致" }));
			fail(`${side} 侧 summary 有 ${files.size} 条，count 却是 ${payload.count}`);
			return;
		}
		reported.set(side, { count: payload.count, files });
		log(`${side} 报告完成，共 ${payload.count} 张`);
		// 明细留痕：SVG 字节数一旦跨运行变化，说明抖动出在渲染侧而不是栅格化，排查时省一轮试错。
		log(
			`${side} 明细：` +
				[...files]
					.map((file) => {
						const item = payload.summary.find(
							(entry) => `compare-${entry?.slug}-${entry?.language}-${side}.png` === file,
						);
						return `${item?.slug}/${item?.language} svg=${item?.svgBytes} ${item?.width}×${item?.height}`;
					})
					.join(" | "),
		);
		response.statusCode = 200;
		response.end(JSON.stringify({ ok: true }));
		checkComplete();
		return;
	}

	response.statusCode = 400;
	response.end(JSON.stringify({ error: "未知 kind" }));
	fail(`未知 kind：${payload?.kind}`);
}

function checkComplete() {
	if (reported.size < SIDES.length) {
		return;
	}
	for (const side of SIDES) {
		const expected = reported.get(side)?.files ?? new Set();
		const actual = receivedForSide(side);
		const missing = [...expected].filter((name) => !received.has(name));
		const extra = actual.filter((name) => !expected.has(name));
		if (missing.length > 0 || extra.length > 0) {
			fail(
				`${side} 侧产物与报告不符：缺 ${missing.length ? missing.join(" / ") : "无"}；` +
					`多 ${extra.length ? extra.join(" / ") : "无"}`,
			);
			return;
		}
		if (expected.size !== reported.get(side)?.count) {
			fail(`${side} 侧应得 ${reported.get(side)?.count} 张，实际收到 ${actual.length} 张`);
			return;
		}
	}
	closing = true;
	log(`完成：images/ 下共 ${received.size} 张对比图`);
	for (const [file, bytes] of received) {
		log(`  images/${file} ${bytes} 字节`);
	}
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 1_000).unref();
}

const server = createServer(async (request, response) => {
	const url = request.url ?? "/";
	if (request.method === "POST" && url === "/save") {
		await handleSave(request, response);
		return;
	}
	if (request.method !== "GET") {
		response.statusCode = 405;
		response.end("method not allowed");
		return;
	}
	if (url === "/" || url === "/index.html") {
		response.setHeader("Content-Type", "text/plain; charset=utf-8");
		response.end(
			`依次打开：\n  http://localhost:${port}/capture-plugin.html\n  http://localhost:${port}/capture-native.html\n`,
		);
		return;
	}

	const file = path.join(here, path.normalize(url).replace(/^([/\\])+/, ""));
	try {
		const data = await readFile(file);
		response.writeHead(200, {
			"Content-Type": file.endsWith(".js")
				? "text/javascript"
				: file.endsWith(".html")
					? "text/html"
					: "application/octet-stream",
		});
		response.end(data);
	} catch {
		response.writeHead(404);
		response.end("not found");
	}
});

server.listen(port, () => {
	log(`监听 http://localhost:${port} —— 依次打开 capture-plugin.html 与 capture-native.html`);
	setTimeout(() => fail(`${TIMEOUT_MS / 1000}s 内没有收齐两张页面的产物`), TIMEOUT_MS);
});
