import { BUILTIN_THEMES } from "../../src/themes";
import { renderDiagram, invalidatePele } from "../../src/renderer";
import { initializeHostFixture } from "./host-fixture";
import type { RenderRequest, RenderedDiagram } from "../../src/render-engine";

const FLOW = `flowchart TD
  subgraph 业务处理
    A[开始：中文与很长的节点说明] --> B{判断条件是否满足}
    B -->|是| C[处理数据]
    B -->|否| D[结束流程]
    C --> D
  end`;
const fixtures = {
  flowchart: FLOW,
  sequence: `sequenceDiagram
participant A as 用户
participant B as 服务
A->>B: 提交订单
alt 支付成功
B-->>A: 完成
else 失败
B-->>A: 重试
end`,
  state: `stateDiagram-v2
[*] --> Pending
Pending --> Paid: 支付
Pending --> Cancelled: 取消
Paid --> [*]`,
  er: `erDiagram
CUSTOMER ||--o{ ORDER : places
ORDER {
 int id PK
 string status
}`,
  math: String.raw`flowchart LR
 A["$$E=mc^2$$"] --> B["$$\frac{a+b}{c}$$"]`,
};
const results: Record<string, unknown>[] = [];
const state = window as unknown as Record<string, unknown>;
state.__cmResults = results;
const request = (code: string, theme = BUILTIN_THEMES[0]): RenderRequest => ({ code, theme, layout: "elk", elkMergeEdges: "default", elkNodePlacement: "default", decisionShape: "compact", plain: false });
const check = (name: string, passed: boolean, detail?: unknown): void => { results.push({ check: name, passed, detail }); };

async function image(svg: string): Promise<HTMLImageElement> {
 const img = new Image();
 img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
 await img.decode();
 return img;
}
async function main(): Promise<void> {
 initializeHostFixture();
 await document.fonts.ready;
 const out = document.getElementById("out")!;
 // 状态图的长自环标签曾让 Pele 留出大量单侧空白；检查实际内容而非 SVG 元素自身是否居中。
 for (const code of [
  "stateDiagram-v2\n A --> B: submit\n B --> B: a long self loop label\n B --> A: cancel",
  "stateDiagram-v2\n A --> B: submit\n B --> A: cancel",
 ]) {
  const rendered = await renderDiagram(request(code));
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;pointer-events:none";
  host.innerHTML = rendered.svg; document.body.appendChild(host);
  try {
   const svg = host.querySelector("svg")!;
   const box = svg.getBBox(), view = svg.viewBox.baseVal;
   const offset = box.x + box.width / 2 - view.x - view.width / 2;
   check("state content stays horizontally centred, including long self loops", Math.abs(offset) < 1, { offset });
   check("state content remains inside the SVG viewport", box.x >= view.x && box.x + box.width <= view.x + view.width);
  } finally { host.remove(); }
 }
 for (const theme of BUILTIN_THEMES) {
  const section = document.createElement("section");
  const heading = document.createElement("h2"); heading.textContent = theme.name; section.appendChild(heading);
  const grid = document.createElement("div"); grid.className = "grid"; section.appendChild(grid); out.appendChild(section);
  for (const [kind, code] of Object.entries(fixtures)) {
   try {
    const result = renderDiagram(request(code, theme));
    check(`${theme.id}/${kind}: synchronous cold render`, !(result instanceof Promise));
    const rendered: RenderedDiagram = await result;
    const img = await image(rendered.svg);
    check(`${theme.id}/${kind}: standalone SVG image`, img.naturalWidth > 0 && img.naturalHeight > 0, { width: rendered.width, height: rendered.height });
    const card = document.createElement("figure"); card.style.background = String(theme.variables.background);
    const caption = document.createElement("figcaption"); caption.textContent = kind; card.append(caption, img); grid.appendChild(card);
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(rendered.width); canvas.height = Math.ceil(rendered.height);
    const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    check(`${theme.id}/${kind}: PNG export`, !!png && png.size > 100);
    if (kind === "math") {
     const doc = new DOMParser().parseFromString(rendered.svg, "image/svg+xml");
     check(`${theme.id}: math paths without foreignObject`, !!doc.querySelector("[data-mml-node] path") && !doc.querySelector("foreignObject"));
    }
   } catch (error) { check(`${theme.id}/${kind}`, false, String(error)); }
  }
 }
 const overridden = await renderDiagram(request(`%%{init: {themeVariables: {mainBkg: "#ff0000"}}}%%
${FLOW}`));
 check("source directive colour overrides plugin theme", overridden.svg.includes("--pele-surface: rgb(255, 0, 0)"));
 const a = await renderDiagram(request(FLOW));
 const b = await renderDiagram({ ...request(FLOW), layout: "dagre", decisionShape: "native" });
 check("legacy layout and shape fields are retained but ignored", a === b);
 invalidatePele(); const refreshed = await renderDiagram(request(FLOW));
 check("appearance invalidation drops cache", refreshed !== a);
 const payload = await renderDiagram(request(`flowchart TD
A["<img src=x onerror=window.__cmXss=1>"] --> B[ok]`));
 const doc = new DOMParser().parseFromString(payload.svg, "image/svg+xml");
 check("HTML labels do not create executable elements", !doc.querySelector("script,img,[onerror],foreignObject"));
 const hostCss = document.createElement("style");
 hostCss.textContent = `body,.mermaid { --pele-surface:#224466; --pele-series-1:#123456; --pele-series-2:#654321; --font-mermaid:sans-serif; --pele-font-mono:monospace; --pele-radius:7px; --pele-bold-weight:600; }`;
 document.head.appendChild(hostCss);
 try {
  invalidatePele();
  const plain = await renderDiagram({ ...request(`%%{init:{themeVariables:{mainBkg:'#ff0000',fontFamily:'serif'}}}%%\n${FLOW}`), plain:true, theme:null });
  const root = new DOMParser().parseFromString(plain.svg,"image/svg+xml").documentElement as unknown as SVGSVGElement;
  check("plain source colours and font override host CSS",root.style.getPropertyValue("--pele-surface")==="rgb(255, 0, 0)" && root.style.getPropertyValue("--pele-font")==="serif");
  const pieCode = `pie\n"A" : 2\n"B" : 3`;
  const inherited = await renderDiagram({ ...request(pieCode), plain:true, theme:null });
  check("plain embeds inherited palette and geometry", inherited.svg.includes("--pele-series-1: rgb(18, 52, 86)") && inherited.svg.includes("--pele-radius: 7px") && inherited.svg.includes("--pele-bold-weight: 600"));
  const pie = await renderDiagram({ ...request(`%%{init:{themeVariables:{pie1:'#ff0000',pie2:'#0000ff'}}}%%\n${pieCode}`), plain:true, theme:null });
  const img = await image(pie.svg);
  const canvas=document.createElement("canvas"); canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext("2d")!;ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let red=0,blue=0;
  for(let i=0;i<pixels.length;i+=4){if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===0)red++;if(pixels[i]===0&&pixels[i+1]===0&&pixels[i+2]===255)blue++;}
  check("source palette survives plain, sanitization and PNG rasterisation",red>100&&blue>100,{red,blue});
 } finally { hostCss.remove(); invalidatePele(); }
 const pre = document.createElement("pre"); pre.textContent = JSON.stringify(results, null, 2); out.appendChild(pre);
}
main().then(() => { state.__cmDone = true; }).catch((error) => { state.__cmDone = "failed"; state.__cmError = String(error); });
