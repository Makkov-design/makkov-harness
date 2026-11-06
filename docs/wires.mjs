// Generates the hero's "neural wires": routed lines that converge on the mark, with packets travelling along them.
// Writes img/wires.svg (inlined into index.html by the build step below). Run: node wires.mjs
import fs from "node:fs";
const W = 1800, H = 720, cx = 900, cy = 360; // the mark sits at cx, cy
const routes = [
  [0, 110, 420, 200, [-150, -70]], [0, 250, 360, 290, [-165, -30]], [0, 360, 470, 360, [-172, 0]],
  [0, 480, 380, 430, [-165, 32]], [0, 620, 500, 520, [-150, 72]], [W, 90, 1420, 180, [150, -72]],
  [W, 280, 1460, 320, [168, -24]], [W, 460, 1450, 410, [166, 30]], [W, 640, 1390, 540, [150, 76]],
];
let lines = "", nodes = "", packets = "";
routes.forEach(([x0, y0, bx, my, [dx, dy]], i) => {
  const ex = cx + dx, ey = cy + dy, dir = x0 === 0 ? 1 : -1;
  const pts = [[x0, y0], [bx - dir * 60, y0], [bx, my], [ex - dir * 40, my], [ex, ey]];
  const d = "M" + pts.map((p) => p.join(" ")).join(" L");
  lines += `<path id="w${i}" d="${d}" class="${i % 3 ? "wire" : "wire wire--strong"}"/>`;
  nodes += `<circle cx="${pts[2][0]}" cy="${pts[2][1]}" r="4" class="node"/><rect x="${pts[1][0] - 3}" y="${pts[1][1] - 3}" width="6" height="6" class="node"/>`;
  const dur = (7 + (i % 4) * 1.6).toFixed(1), begin = (i * 0.9).toFixed(1);
  packets += `<circle r="${i % 3 ? 2.4 : 3.2}" class="packet${i % 2 ? " packet--opal" : ""}"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath href="#w${i}"/></animateMotion></circle>`;
});
// tick marks and short dashes, like the banner's instrumentation
let deco = "";
[].forEach(([x, y]) => { for (let k = 0; k < 9; k++) deco += `<rect x="${x + k * 7}" y="${y}" width="1.6" height="12" class="tick"/>`; });
const svg = `<svg class="wires routing-diagram" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false"><g fill="none">${lines}</g>${nodes}${deco}<g class="packets">${packets}</g></svg>`;
fs.writeFileSync(new URL("./img/wires.svg", import.meta.url), svg);
console.log("wires", routes.length, svg.length, "bytes");
