import { BUILTIN_THEMES } from "../../src/themes";
import { renderDiagram, invalidatePele, peekRendered } from "../../src/renderer";
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

function svgGeometry(svg: string): string {
 const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
 const attributes = ["x", "y", "width", "height", "d", "points", "transform"];
 return JSON.stringify([root.getAttribute("viewBox"), ...Array.from(root.querySelectorAll("rect,path,polygon,g,svg")).map((el) =>
  attributes.map((name) => el.getAttribute(name)))]);
}

function diamondSize(svg: string): { width: number; height: number } {
 const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
 const values = root.querySelector("polygon")!.getAttribute("points")!.trim().split(/[ ,]+/).map(Number);
 const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2 !== 0);
 return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

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
    check(`${theme.id}/${kind}: expected cold render timing`, (result instanceof Promise) === (kind !== "sequence"));
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
 const layoutSource = `flowchart TD
 A[开始] --> B{判断条件是否满足}
 A --> C[准备]
 B -->|是| C
 B -->|否| D[结束]
 C --> D`;
 const layoutRequest = { ...request(layoutSource), decisionShape: "native" } as const;
 const first = renderDiagram(layoutRequest);
 check("cold ELK requests share one pending layout", first instanceof Promise && first === renderDiagram(layoutRequest));
 invalidatePele();
 const stale = await first;
 check("a stale ELK completion does not repopulate the cache", peekRendered(layoutRequest) === null);
 const elk = await renderDiagram(layoutRequest);
 check("warm ELK is synchronous and uses the new revision", elk !== stale && renderDiagram(layoutRequest) === elk);
 const dagre = renderDiagram({ ...layoutRequest, layout: "dagre" });
 const native = renderDiagram({ ...layoutRequest, layout: "pele" });
 check("Dagre and Pele can render synchronously", !(dagre instanceof Promise) && !(native instanceof Promise));
 check("ELK, Dagre and Pele produce three distinct geometries",
  new Set([elk, await dagre, await native].map((item) => svgGeometry(item.svg))).size === 3);
 const compact = await renderDiagram({ ...layoutRequest, decisionShape: "compact" });
 const compactBox = diamondSize(compact.svg), nativeBox = diamondSize(elk.svg);
 check("compact diamonds reduce height while preserving width for the label",
  compactBox.height < nativeBox.height && compactBox.width > 0, { compactBox, nativeBox });
 const yaml = `---
config:
  layout: elk
  elk:
    mergeEdges: true
---
${layoutSource}`;
 const init = `%%{init:{layout:"dagre"}}%%
${layoutSource}`;
 check("source frontmatter overrides the selected engine and passes ELK options",
  svgGeometry((await renderDiagram({ ...layoutRequest, code: yaml, layout: "pele" })).svg) ===
  svgGeometry((await renderDiagram({ ...layoutRequest, elkMergeEdges: "on" })).svg));
 check("source init overrides the selected engine",
  svgGeometry((await renderDiagram({ ...layoutRequest, code: init })).svg) === svgGeometry((await dagre).svg));
 const stateNative = await renderDiagram({ ...request(fixtures.state), layout: "pele" });
 const stateElk = await renderDiagram(request(fixtures.state));
 check("ELK changes state layout geometry", svgGeometry(stateElk.svg) !== svgGeometry(stateNative.svg));
 for (const [kind, code] of Object.entries({
  er: fixtures.er,
  class: "classDiagram\n Animal <|-- Dog\n Animal <|-- Cat\n Dog --> Owner: belongs to",
  requirement: "requirementDiagram\n requirement Availability {\n id: 1\n text: \"Test requirement\"\n risk: low\n verifymethod: test\n }\n element Controller {\n type: system\n }\n Controller - satisfies -> Availability",
  usecase: "usecase-beta\n actor User\n actor Admin\n Login(Login)\n Audit(Audit)\n User --> Login\n Admin --> Audit\n Admin --> Login",
 })) {
  const elkResult = await renderDiagram(request(code));
  const peleResult = await renderDiagram({ ...request(code), layout: "pele" });
  check(`ELK changes ${kind} layout geometry`, svgGeometry(elkResult.svg) !== svgGeometry(peleResult.svg));
 }
 const elkKeyword = layoutSource.replace("flowchart", "flowchart-elk");
 const keywordRender = renderDiagram({ ...layoutRequest, code: elkKeyword, layout: "pele" });
 check("flowchart-elk still selects ELK", keywordRender instanceof Promise &&
  svgGeometry((await keywordRender).svg) === svgGeometry(elk.svg));
 const groupTitle = "A long subgraph title that must fit inside the group in a vertical layout";
 const nested = `flowchart TB
 subgraph G[${groupTitle}]
   A
 end
 G --> B`;
 for (const layout of ["elk", "dagre"] as const) {
  const result = await renderDiagram({ ...layoutRequest, code: nested, layout });
  const rendered = new DOMParser().parseFromString(result.svg, "image/svg+xml");
  const view = rendered.documentElement.getAttribute("viewBox")!.split(/\s+/).map(Number);
  const group = rendered.querySelector("rect")!;
  const title = Array.from(rendered.querySelectorAll("text")).find((el) => el.textContent === groupTitle);
  const width = Number(group.getAttribute("width"));
  const x = Number(group.getAttribute("x"));
  const tx = Number(title?.getAttribute("x"));
  check(`${layout}: group has room for a long title in a vertical layout`,
   !!title && width > 300 && Math.abs(x + width / 2 - tx) < 1 && x >= view[0] && x + width <= view[0] + view[2],
   { width, x, tx, view });
 }
 const mixed = `flowchart TB
 subgraph G[Local direction]
   direction LR
   A --> B
 end
 C --> D`;
 check("ELK falls back to Pele to preserve a differing subgraph direction",
  svgGeometry((await renderDiagram({ ...layoutRequest, code: mixed })).svg) ===
  svgGeometry((await renderDiagram({ ...layoutRequest, code: mixed, layout: "pele" })).svg));
 const plainLayout = { ...layoutRequest, plain: true, theme: null } as const;
 check("plain remains synchronous, independent of layout and compact settings",
  renderDiagram(plainLayout) === renderDiagram({ ...plainLayout, layout: "dagre", decisionShape: "compact" }) &&
  !(renderDiagram(plainLayout) instanceof Promise));
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
