import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (request, response) => {
	const url = request.url === "/" ? "/render.html" : (request.url ?? "/");
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
	console.log(`harness: http://localhost:${port}/render.html and http://localhost:${port}/cache.html`);
});
