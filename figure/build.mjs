import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { HE, fieldAt } from "./model.mjs";
import { coilZ } from "./coil.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name) => process.argv.includes(name);
const theme = arg("--light") ? "light" : arg("--dark") ? "dark" : "auto";
const OUT = theme === "auto" ? "hall-effect-switch.html" : `hall-effect-switch-${theme}.html`;

// World units are millimetres; z = 0 is the top of the PCB.
const WIDTH = 600;
const HEIGHT = 350;

const PITCH = 19.05;
const KEYS = [-PITCH, 0, PITCH];
const CY = 0;
const CX = PITCH;
const YC = CY + 1.6; // the section plane through the third switch
const X0 = PITCH / 2; // the second section plane, between switches two and three

const OUTER = { x0: -33.05, x1: 33.05, y0: -15, y1: 30 };
const WELL = { x0: -29.5, x1: 29.5, y0: -10.5, y1: 10.5 };
const BOTTOM = -5;
const FLOOR = -3.5;
const RIM = 9;
const BOARD = { x0: -29.3, x1: 29.3, y0: -10.3, y1: 10.3 };
const PCB = [-1.6, 0];
const PLATE = [5, 6.5];
const LOWER = [0, 6.5]; // bottom housing, through the plate
const UPPER = [6.5, 12]; // top housing
const ROOF = 11;
const CAP = { z: 16.5, h: 7.5 };

// The stem at rest (depth 0); everything on it moves down by the depth.
const MAGNET = { r: 1.5, z0: 2.2 + HE.travel, z1: 4.2 + HE.travel };
const POLE = { r: 2.0, z0: MAGNET.z1, z1: 10 };
const SHOULDER = { r: 3.6, z0: 10, z1: 11 };
const COLUMN = { r: 2.4, z0: 11, z1: 13 };
const CROSS = { z0: 13, z1: 16.9 };
const SPRING = { r: 2.6, z0: 1.2, turns: 6 };
const SENSOR = { w: 2.9, d: 1.6, h: 1.0 };

const OLED = { x0: -14, x1: 6, y0: 13, y1: 26, z: 8.4 };
const ACTIVE = { x: -13, y: 14.7, w: 18, h: 9.6 };
const KNOB = { x: -24, y: 20, r: 5.2 };
const LED = [-16.2, 27.3];
const STRIP = { x0: 30.0, x1: 32.6, z0: 1.4, z1: 7.0, t: 0.35 };

const P = k.fitProjection(
  [
    ...k.boxCorners({ x: OUTER.x0, y: OUTER.y0, w: OUTER.x1 - OUTER.x0, d: OUTER.y1 - OUTER.y0, r: 0 }, BOTTOM - 1.2, RIM),
    ...KEYS.flatMap((x) => k.boxCorners({ x: x - 9, y: CY - 9, w: 18, d: 18, r: 0 }, CAP.z, CAP.z + CAP.h)),
    [KNOB.x, KNOB.y + KNOB.r, 16],
  ],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 56 },
);
const CAM = k.cameraOf(P);
const VIEW = [CAM.cosA * CAM.cosE, CAM.sinA * CAM.cosE, CAM.sinE];

const at = (point) => k.iso(point, P);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const path = (points3, closed = true) => k.pathOf(points3.map(at), closed);
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const quadY = (x0, x1, z0, z1, y) => path([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const quadX = (y0, y1, z0, z1, x) => path([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);

// Like k.solidSvg, with section faces (`cut`) painted over the sides before the creases and the outline.
function solid(paths, { tone = "hi", crease = "faint", lit = false, cut = "", inner = "" } = {}) {
  const parts = [`<path class="iso-fill" d="${paths.fill}"/>`];
  paths.shades.forEach((d, shade) => d && parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`));
  parts.push(`<path class="iso-top" d="${paths.top}"/>`);
  if (cut) parts.push(`<path class="hx-cut" d="${cut}"/>`);
  if (crease !== "none" && paths.crease) parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
  if (crease !== "none" && paths.bevel) parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
  parts.push(inner);
  parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
  return `<g class="iso-solid"${lit ? " data-lit" : ""}>${parts.join("")}</g>`;
}
const box = (x0, x1, y0, y1, z0, z1, bevel = 0) => k.extrude(rect(x0, x1, y0, y1), z0, z1 - z0, P, { convex: true, bevel });
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

// A tapered solid between two floor rings with the same number of points (a keycap).
function frustum(below, above, z0, z1) {
  const n = below.length;
  const B = below.map(([x, y]) => [x, y, z0]);
  const T = above.map(([x, y]) => [x, y, z1]);
  const cx = below.reduce((s, p) => s + p[0], 0) / n;
  const cy = below.reduce((s, p) => s + p[1], 0) / n;
  const shades = [[], [], [], []];
  const crease = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const u = [B[j][0] - B[i][0], B[j][1] - B[i][1], 0];
    const v = [T[i][0] - B[i][0], T[i][1] - B[i][1], T[i][2] - B[i][2]];
    let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const mid = [(B[i][0] + B[j][0]) / 2 - cx, (B[i][1] + B[j][1]) / 2 - cy];
    if (nrm[0] * mid[0] + nrm[1] * mid[1] < 0) nrm = nrm.map((c) => -c);
    if (nrm[0] * VIEW[0] + nrm[1] * VIEW[1] + nrm[2] * VIEW[2] <= 1e-9) continue;
    const h = Math.hypot(nrm[0], nrm[1]) || 1;
    const lit = ((nrm[0] / h) * -CAM.sinA + (nrm[1] / h) * CAM.cosA + 1) / 2;
    shades[Math.min(3, Math.max(0, Math.floor(lit * 4)))].push(path([B[i], B[j], T[j], T[i]]));
    crease.push(path([T[i], T[j]], false));
  }
  const outline = k.pathOf(hull([...B, ...T].map(at)), true);
  return { fill: outline, outline, crease: crease.join(""), top: path(T), shades: shades.map((list) => list.join("")) };
}

const plus = (cx, cy, arm, half) => [
  [cx - half, cy - arm], [cx + half, cy - arm], [cx + half, cy - half], [cx + arm, cy - half], [cx + arm, cy + half], [cx + half, cy + half],
  [cx + half, cy + arm], [cx - half, cy + arm], [cx - half, cy + half], [cx - arm, cy + half], [cx - arm, cy - half], [cx - half, cy - half],
];

// ---------- the case: one aluminium C-shaped prism (deck at the back, walls round a key well), cut at the front right ----------
const CASE_RING = [
  [OUTER.x0, OUTER.y0], [OUTER.x1, OUTER.y0], [OUTER.x1, YC], [WELL.x1, YC], [WELL.x1, WELL.y0], [WELL.x0, WELL.y0],
  [WELL.x0, WELL.y1], [X0, WELL.y1], [X0, OUTER.y1], [OUTER.x0, OUTER.y1],
];

function feet() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: OUTER.x0, y: OUTER.y0, w: OUTER.x1 - OUTER.x0, d: OUTER.y1 - OUTER.y0, r: 3 }, BOTTOM - 1.2, RIM - BOTTOM, P)}"/>`];
  for (const [x, y] of byDepth([[-29, -11.5], [29, -11.5], [-29, 26.6], [5, 26.6]])) {
    out.push(solid(k.cylinder(x, y, 2.6, BOTTOM - 1.2, 1.2, P, 24), { tone: "lo" }));
  }
  return out.join("");
}

function caseBack() {
  const out = [];
  const body = k.extrude(CASE_RING, BOTTOM, RIM - BOTTOM, P, { convex: false });
  out.push(solid(body, { tone: "mid" }));
  // screws in the rim, and a groove round the deck
  const screws = [[-31.3, -13.3], [31.3, -13.3]];
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.0, RIM, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, RIM])), { size: 0.5 }));
  return out.join("");
}

// The display window, the encoder knob and the status light on the deck.
function deck() {
  const out = [];
  const { x0, x1, y0, y1, z } = OLED;
  const window = path([[x0, y0, RIM], [x1, y0, RIM], [x1, y1, RIM], [x0, y1, RIM]]);
  out.push(`<clipPath id="hx-window"><path d="${window}"/></clipPath>`);
  out.push(`<g clip-path="url(#hx-window)">`);
  out.push(`<path class="hx-glass" d="${path([[x0 - 1, y0 - 1, z], [x1 + 1, y0 - 1, z], [x1 + 1, y1 + 1, z], [x0 - 1, y1 + 1, z]])}"/>`);
  out.push(`<g transform="${k.topMatrix([ACTIVE.x, ACTIVE.y], z, P, "x")}">${oled()}</g>`);
  out.push(`<path class="iso-shade" data-shade="1" d="${quadY(x0, x1, z, RIM, y0)}"/>`);
  out.push(`<path class="iso-shade" data-shade="2" d="${quadX(y0, y1, z, RIM, x0)}"/>`);
  out.push(`</g>`);
  out.push(L(window, { tone: "lo" }));
  out.push(L(k.planOutline({ x: x0 - 1.4, y: y0 - 1.4, w: x1 - x0 + 2.8, d: y1 - y0 + 2.8, r: 1.2 }, RIM, P, 4), { tone: "faint" }));
  // status light: a light pipe in the deck
  out.push(`<path class="hx-led" data-part="led" d="${k.ring(LED[0], LED[1], 0.75, RIM, P, 20)}"/>`);
  out.push(L(k.ring(LED[0], LED[1], 1.3, RIM, P, 24), { tone: "faint" }));
  // encoder: nut, washer and a knurled knob with a pointer
  const { x, y, r } = KNOB;
  out.push(solid(k.cylinder(x, y, r + 1.0, RIM, 0.5, P, 48), { tone: "mid" }));
  out.push(solid(k.cylinder(x, y, 3.6, RIM + 0.5, 0.8, P, 6), { tone: "mid" }));
  const top = 16;
  out.push(
    solid(k.cylinder(x, y, r, RIM + 1.3, top - RIM - 1.3, P, 64, 0.5), {
      tone: "mid",
      inner: L(k.knurl(x, y, r, RIM + 2.3, top - 1.2, 60, P, 0), { tone: "lo" }) + L(k.sideArc(x, y, r, RIM + 2.3, P, 48) + k.sideArc(x, y, r, top - 1.2, P, 48), { tone: "faint" }),
    }),
  );
  out.push(L(k.ring(x, y, r - 1.3, top, P, 48), { tone: "faint" }));
  out.push(L(k.lineOnTop([x, y], [x - 2.7, y + 2.7], top, P), { tone: "hi", free: "end" }));
  out.push(D([at([x, y, top])], { size: 0.55, tone: "hi" }));
  return out.join("");
}

function oled() {
  const { w } = ACTIVE;
  const bar = { x: 0.6, y: 5.0, w: w - 1.2, h: 1.5 };
  const ap = bar.x + (HE.ap.start / HE.travel) * bar.w;
  return [
    `<text class="hx-px" data-part="oled-depth" x="0.6" y="3.3" font-size="3.0">0.00</text>`,
    `<text class="hx-px" x="7.8" y="3.3" font-size="1.4">mm</text>`,
    `<text class="hx-px" data-part="oled-field" x="${w - 0.6}" y="3.3" font-size="1.4" text-anchor="end">${fieldAt(0).toFixed(1)} mT</text>`,
    `<rect class="hx-px-line" x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}"/>`,
    `<rect class="hx-px" data-part="oled-bar" x="${bar.x}" y="${bar.y}" width="0" height="${bar.h}"/>`,
    `<path class="hx-px-line" data-part="oled-ap" d="M${ap.toFixed(2)} ${bar.y - 0.5}V${bar.y + bar.h + 0.5}"/>`,
    `<text class="hx-px" data-part="oled-set" x="0.6" y="9.1" font-size="1.3">AP ${HE.ap.start.toFixed(1)}  RT ${HE.rt.start.toFixed(1)}</text>`,
    `<rect class="hx-px-line" data-part="oled-on" x="12.5" y="7.95" width="1.25" height="1.25"/>`,
    `<text class="hx-px" data-part="oled-count" x="${w - 0.6}" y="9.1" font-size="1.3" text-anchor="end">x0</text>`,
  ].join("");
}

// ---------- inside, below the plate ----------
const WELL_FLOOR = [[WELL.x0, WELL.y0], [WELL.x1, WELL.y0], [WELL.x1, YC], [X0, YC], [X0, WELL.y1], [WELL.x0, WELL.y1]];
const BOARD_RING = [[BOARD.x0, BOARD.y0], [BOARD.x1, BOARD.y0], [BOARD.x1, YC], [X0, YC], [X0, BOARD.y1], [BOARD.x0, BOARD.y1]];
const PLATE_RING = [
  [BOARD.x0, BOARD.y0], [BOARD.x1, BOARD.y0], [BOARD.x1, YC], [CX + 7, YC], [CX + 7, CY - 7], [CX - 7, CY - 7], [CX - 7, YC], [X0, YC], [X0, BOARD.y1], [BOARD.x0, BOARD.y1],
];
const cutsOf = (z0, z1, xRight, yFront, extra = "") => quadY(X0, xRight, z0, z1, YC) + quadX(YC, yFront, z0, z1, X0) + extra;

function inside() {
  const out = [];
  out.push(solid(k.extrude(WELL_FLOOR, BOTTOM, FLOOR - BOTTOM, P, { convex: false }), { tone: "mid", cut: cutsOf(BOTTOM, FLOOR, WELL.x1, WELL.y1) }));
  for (const [x, y] of byDepth([[24.5, CY - 1.8], [6.4, CY + 7.2], [-20, CY - 4]])) {
    out.push(solid(k.cylinder(x, y, 1.4, FLOOR, PCB[0] - FLOOR, P, 20), { tone: "lo" }));
  }
  // PCB, with its copper core drawn on the section
  const core = path([[BOARD.x1, YC, -0.8], [X0, YC, -0.8], [X0, BOARD.y1, -0.8]], false);
  out.push(solid(k.extrude(BOARD_RING, PCB[0], PCB[1] - PCB[0], P, { convex: false }), { tone: "lo", cut: cutsOf(PCB[0], PCB[1], BOARD.x1, BOARD.y1), inner: L(core, { tone: "faint" }) }));
  // traces and vias, then the parts on the board
  const vias = [[10.8, CY + 0.4], [8.3, CY + 7.6]];
  out.push(L(path([[10.8, CY - 3.1, 0], [10.8, CY + 0.4 - 0.55, 0]], false) + path([[8.3, CY + 4.6, 0], [8.3, CY + 7.6 - 0.55, 0]], false) + path([[10.8, CY - 4.4, 0], [10.8, CY - 6.8, 0], [CX - 6, CY - 6.8, 0]], false), { tone: "lo" }));
  out.push(L(vias.map(([x, y]) => k.ring(x, y, 0.55, 0, P, 14)).join(""), { tone: "mid" }));
  out.push(D(vias.map(([x, y]) => at([x, y, 0])), { size: 0.35, tone: "mid" }));
  for (const [x, y] of [[10.8, CY - 3.75], [8.3, CY + 4]]) out.push(capacitor(x, y));
  out.push(sensor(CX, CY));
  // housings of the two whole switches, below the plate
  for (const x of KEYS.slice(0, 2)) out.push(solid(box(x - 7, x + 7, CY - 7, CY + 7, LOWER[0], LOWER[1]), { tone: "hi" }));
  out.push(solid(k.extrude(PLATE_RING, PLATE[0], PLATE[1] - PLATE[0], P, { convex: false }), { tone: "mid", cut: quadY(X0, CX - 7, PLATE[0], PLATE[1], YC) + quadY(CX + 7, BOARD.x1, PLATE[0], PLATE[1], YC) + quadX(YC, BOARD.y1, PLATE[0], PLATE[1], X0) }));
  return out.join("");
}

function capacitor(x, y) {
  const body = solid(box(x - 0.25, x + 0.25, y - 0.5, y + 0.5, 0, 0.5), { tone: "mid" });
  const caps = [y - 0.5, y + 0.5].map((yy) => solid(box(x - 0.27, x + 0.27, yy - 0.12, yy + 0.12, 0, 0.52), { tone: "mid", crease: "none" }));
  return body + caps.join("");
}

function sensor(x, y) {
  const out = [];
  const leads = [[x - 0.95, y - SENSOR.d / 2 - 0.55, y - SENSOR.d / 2], [x + 0.95, y - SENSOR.d / 2 - 0.55, y - SENSOR.d / 2], [x, y + SENSOR.d / 2, y + SENSOR.d / 2 + 0.55]];
  for (const [lx, a, b] of leads) out.push(solid(box(lx - 0.2, lx + 0.2, a, b, 0, 0.3), { tone: "mid", crease: "none" }));
  out.push(solid(box(x - SENSOR.w / 2, x + SENSOR.w / 2, y - SENSOR.d / 2, y + SENSOR.d / 2, 0, SENSOR.h, 0.12), { tone: "hi", crease: "lo" }));
  out.push(D([at([x - 0.9, y - 0.35, SENSOR.h])], { size: 0.45, tone: "mid" }));
  return out.join("");
}

// ---------- the third switch, cut through at y = YC ----------
function lowerHousing() {
  const out = [];
  const [z0, z1] = LOWER;
  out.push(solid(box(CX - 7, CX + 7, CY - 7, CY - 6, z0, z1), { tone: "hi" }));
  out.push(solid(box(CX - 7, CX - 6, CY - 6, YC, z0, z1), { tone: "hi", cut: quadY(CX - 7, CX - 6, z0, z1, YC) }));
  const f = 1.2;
  out.push(solid(box(CX - 6, CX + 6, CY - 6, CY - 2, z0, f), { tone: "hi" }));
  out.push(solid(box(CX - 6, CX - 2, CY - 2, YC, z0, f), { tone: "hi", cut: quadY(CX - 6, CX - 2, z0, f, YC) }));
  out.push(solid(box(CX + 2, CX + 6, CY - 2, YC, z0, f), { tone: "hi", cut: quadY(CX + 2, CX + 6, z0, f, YC) }));
  return out.join("");
}
const lowerRight = () => solid(box(CX + 6, CX + 7, CY - 6, YC, LOWER[0], LOWER[1]), { tone: "hi", cut: quadY(CX + 6, CX + 7, LOWER[0], LOWER[1], YC) });

function upperBack() {
  const out = [];
  const [z0] = UPPER;
  out.push(solid(box(CX - 7.5, CX + 7.5, CY - 7.5, CY - 6.5, z0, ROOF), { tone: "hi" }));
  out.push(solid(box(CX - 7.5, CX - 6.5, CY - 6.5, YC, z0, ROOF), { tone: "hi", cut: quadY(CX - 7.5, CX - 6.5, z0, ROOF, YC) }));
  return out.join("");
}
// The roof behind and left of the stem opening: over the shoulder, so painted after it.
function roofBack() {
  return (
    solid(box(CX - 7.5, CX + 7.5, CY - 7.5, CY - 2.8, ROOF, UPPER[1], 0.3), { tone: "hi", inner: lightPipe(CX) }) +
    solid(box(CX - 7.5, CX - 2.8, CY - 2.8, YC, ROOF, UPPER[1], 0.3), { tone: "hi", cut: quadY(CX - 7.5, CX - 2.8, ROOF, UPPER[1], YC) })
  );
}
function upperFront() {
  const out = [];
  out.push(solid(box(CX + 6.5, CX + 7.5, CY - 6.5, YC, UPPER[0], ROOF), { tone: "hi", cut: quadY(CX + 6.5, CX + 7.5, UPPER[0], ROOF, YC) }));
  out.push(solid(box(CX + 2.8, CX + 7.5, CY - 2.8, YC, ROOF, UPPER[1], 0.3), { tone: "hi", cut: quadY(CX + 2.8, CX + 7.5, ROOF, UPPER[1], YC) }));
  return out.join("");
}
const lightPipe = (x) => L(k.planOutline({ x: x - 2.5, y: CY - 6.2, w: 5, d: 1.6, r: 0.5 }, UPPER[1], P, 3), { tone: "faint" });

// The moving stem, built at rest and moved down by the depth.
function stemLower() {
  const out = [];
  out.push(solid(k.cylinder(CX, CY, MAGNET.r, MAGNET.z0, MAGNET.z1 - MAGNET.z0, P, 40), { tone: "hi", lit: true, inner: L(k.sideArc(CX, CY, MAGNET.r, (MAGNET.z0 + MAGNET.z1) / 2, P, 24), { tone: "mid" }) }));
  out.push(solid(k.cylinder(CX, CY, POLE.r, POLE.z0, POLE.z1 - POLE.z0, P, 40), { tone: "hi" }));
  return out.join("");
}
const shoulder = () => solid(k.cylinder(CX, CY, SHOULDER.r, SHOULDER.z0, SHOULDER.z1 - SHOULDER.z0, P, 48), { tone: "hi" });
function stemUpper(x = CX, whole = false) {
  const out = [];
  const column = whole ? [UPPER[1], COLUMN.z1] : [COLUMN.z0, COLUMN.z1];
  out.push(solid(k.cylinder(x, CY, COLUMN.r, column[0], column[1] - column[0], P, 40), { tone: "hi" }));
  out.push(solid(k.extrude(plus(x, CY, 2.0, 0.65), CROSS.z0, CROSS.z1 - CROSS.z0, P, { convex: false }), { tone: "hi" }));
  return out.join("");
}

function wholeUpper(x) {
  const roof = L(k.planOutline({ x: x - 2.8, y: CY - 2.8, w: 5.6, d: 5.6, r: 0.4 }, UPPER[1], P, 3), { tone: "lo" }) + lightPipe(x);
  return solid(box(x - 7.5, x + 7.5, CY - 7.5, CY + 7.5, UPPER[0], UPPER[1], 0.3), { tone: "hi", inner: roof }) + stemUpper(x, true);
}

function keycap(x, tone) {
  const below = k.roundedPlan({ x: x - 9, y: CY - 9, w: 18, d: 18, r: 1.2 }, 4);
  const above = k.roundedPlan({ x: x - 6.4, y: CY - 7.6, w: 12.8, d: 13.4, r: 2.2 }, 4);
  const top = CAP.z + CAP.h;
  const dish = L(k.planOutline({ x: x - 5.4, y: CY - 6.6, w: 10.8, d: 11.4, r: 1.8 }, top, P, 4), { tone: "faint" });
  return solid(frustum(below, above, CAP.z, top), { tone, crease: "lo", inner: dish });
}


// Keep the part of a 3D polygon on the near side of y = Y removed (y <= Y stays).
function clipY(poly, Y) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ina = a[1] <= Y + 1e-9;
    const inb = b[1] <= Y + 1e-9;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (Y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, Y, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}
const onPlane = (points, Y) => points.filter((p) => Math.abs(p[1] - Y) < 1e-6);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// The faces of a frustum as 3D quads, each with its outward normal.
function frustumFaces(below, above, z0, z1) {
  const n = below.length;
  const cx = below.reduce((s, p) => s + p[0], 0) / n;
  const cy = below.reduce((s, p) => s + p[1], 0) / n;
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = [[...below[i], z0], [...below[j], z0], [...above[j], z1], [...above[i], z1]];
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], 0];
    const v = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (nrm[0] * ((q[0][0] + q[1][0]) / 2 - cx) + nrm[1] * ((q[0][1] + q[1][1]) / 2 - cy) < 0) nrm = nrm.map((c) => -c);
    if (Math.hypot(...nrm) < 1e-9) continue;
    faces.push({ q, nrm });
  }
  return faces;
}
const shadeOfNormal = (nrm) => {
  const h = Math.hypot(nrm[0], nrm[1]) || 1;
  return Math.min(3, Math.max(0, Math.floor((((nrm[0] / h) * -CAM.sinA + (nrm[1] / h) * CAM.cosA + 1) / 2) * 4)));
};
// A planar polygon on y = Y, ordered round its centre in (x, z).
const sectionOf = (points) => {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cz = points.reduce((s, p) => s + p[2], 0) / points.length;
  const unique = points.filter((p, i) => points.findIndex((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < 1e-4) === i);
  return unique.sort((a, b) => Math.atan2(a[2] - cz, a[0] - cx) - Math.atan2(b[2] - cz, b[0] - cx));
};

// The third keycap, cut on the same plane as its switch: a shell with a stem socket inside.
function cutKeycap(x) {
  const Y = YC;
  const z0 = CAP.z;
  const z1 = CAP.z + CAP.h;
  const wall = 1.2;
  const roof = 1.6;
  const below = k.roundedPlan({ x: x - 9, y: CY - 9, w: 18, d: 18, r: 1.2 }, 4);
  const above = k.roundedPlan({ x: x - 6.4, y: CY - 7.6, w: 12.8, d: 13.4, r: 2.2 }, 4);
  // inner surface: the outer one moved in by the wall, ending under the roof
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const t = (z1 - roof - z0) / (z1 - z0);
  const belowIn = k.roundedPlan({ x: x - 9 + wall, y: CY - 9 + wall, w: 18 - 2 * wall, d: 18 - 2 * wall, r: 0.6 }, 4);
  const aboveIn = below.map((p, i) => lerp(p, above[i], t)).map(([px, py]) => [x + (px - x) * ((12.8 * t + 18 * (1 - t) - 2 * wall) / (12.8 * t + 18 * (1 - t))), CY + (py - CY) * ((13.4 * t + 18 * (1 - t) - 2 * wall) / (13.4 * t + 18 * (1 - t)))]);
  const outer = frustumFaces(below, above, z0, z1);
  const inner = frustumFaces(belowIn, aboveIn, z0, z1 - roof);
  const shades = [[], [], [], []];
  const crease = [];
  const all = [];
  const cutOuter = [];
  for (const { q, nrm } of outer) {
    const c = clipY(q, Y);
    if (c.length < 3) continue;
    all.push(...c);
    cutOuter.push(...onPlane(c, Y));
    if (dot3(nrm, VIEW) <= 1e-9) continue;
    shades[shadeOfNormal(nrm)].push(path(c));
    const edge = clipY([q[3], q[2], q[2]], Y);
    if (edge.length >= 2) crease.push(path([edge[0], edge[1]], false));
  }
  const topPoly = clipY(above.map(([px, py]) => [px, py, z1]), Y);
  all.push(...topPoly);
  cutOuter.push(...onPlane(topPoly, Y));
  const cutInner = [];
  const cavity = [[], [], [], []];
  for (const { q, nrm } of inner) {
    const c = clipY(q, Y);
    if (c.length < 3) continue;
    cutInner.push(...onPlane(c, Y));
    if (dot3(nrm, VIEW) < 0) cavity[shadeOfNormal(nrm.map((v) => -v))].push(path(c));
  }
  const ceiling = clipY(aboveIn.map(([px, py]) => [px, py, z1 - roof]), Y);
  cutInner.push(...onPlane(ceiling, Y));
  const outerSection = sectionOf(cutOuter);
  const innerSection = sectionOf(cutInner);
  const hullPath = k.pathOf(hull(all.map(at)), true);
  const opening = path(innerSection);
  // the socket: a round boss under the roof, cut through like the rest
  const socketRing = k.circleRing(x, CY, 2.75, 40).filter(([, py]) => py <= Y).concat([[x + Math.sqrt(2.75 ** 2 - (Y - CY) ** 2), Y], [x - Math.sqrt(2.75 ** 2 - (Y - CY) ** 2), Y]]);
  const socketPlan = sectionOf(socketRing.map(([px, py]) => [px, Y, py])).map(([px, , py]) => [px, py]);
  const sz0 = z0 + 1.0;
  const sz1 = z1 - roof;
  const halfW = Math.sqrt(2.75 ** 2 - (Y - CY) ** 2);
  const socket = solid(k.extrude(socketPlan, sz0, sz1 - sz0, P, { convex: true }), {
    tone: "hi",
    cut: quadY(x - halfW, x + halfW, sz0, sz1, Y),
    inner: L(path([[x - 2.0, Y, sz0], [x - 2.0, Y, sz0 + 3.6]], false) + path([[x + 2.0, Y, sz0], [x + 2.0, Y, sz0 + 3.6]], false) + path([[x - 2.0, Y, sz0 + 3.6], [x + 2.0, Y, sz0 + 3.6]], false), { tone: "lo" }),
  });
  return [
    `<g class="iso-solid">`,
    `<path class="iso-fill" d="${hullPath}"/>`,
    ...shades.map((list, shade) => (list.length ? `<path class="iso-shade" data-shade="${shade}" d="${list.join("")}"/>` : "")),
    `<path class="iso-top" d="${path(topPoly)}"/>`,
    `<path class="hx-cut" fill-rule="evenodd" d="${path(outerSection)}${path(innerSection)}"/>`,
    `<clipPath id="hx-cavity"><path d="${opening}"/></clipPath>`,
    `<g clip-path="url(#hx-cavity)"><path class="iso-fill" d="${opening}"/>`,
    ...cavity.map((list, shade) => (list.length ? `<path class="iso-shade" data-shade="${shade}" d="${list.join("")}"/>` : "")),
    socket,
    `</g>`,
    L(crease.join(""), { tone: "lo", className: "iso-crease" }),
    L(k.pathOf(clipY(k.roundedPlan({ x: x - 5.4, y: CY - 6.6, w: 10.8, d: 11.4, r: 1.8 }, 4).map(([px, py]) => [px, py, z1]), Y).map(at), false), { tone: "faint" }),
    L(opening, { tone: "lo" }),
    `<path class="iso-line iso-edge" data-tone="hi" d="${hullPath}"/>`,
    `</g>`,
  ].join("");
}

// ---------- the walls in front of the section, redrawn over the inside ----------
function caseFront() {
  const out = [];
  const sides = [];
  const shadeOf = (nx, ny) => Math.min(3, Math.max(0, Math.floor(((nx * -CAM.sinA + ny * CAM.cosA + 1) / 2) * 4)));
  const right = { x0: WELL.x1, x1: OUTER.x1, y0: OUTER.y0, y1: YC };
  const front = { x0: OUTER.x0, x1: X0, y0: WELL.y1, y1: OUTER.y1 };
  const faces = [
    [quadX(right.y0, right.y1, BOTTOM, RIM, right.x1), shadeOf(1, 0), false],
    [quadY(right.x0, right.x1, BOTTOM, RIM, YC), shadeOf(0, 1), true],
    [quadX(front.y0, front.y1, BOTTOM, RIM, X0), shadeOf(1, 0), true],
    [quadY(front.x0, front.x1, BOTTOM, RIM, front.y1), shadeOf(0, 1), false],
  ];
  const cut = quadY(X0, right.x1, BOTTOM, FLOOR, YC) + quadY(right.x0, right.x1, FLOOR, RIM, YC) + quadX(YC, front.y1, BOTTOM, FLOOR, X0) + quadX(front.y0, front.y1, FLOOR, RIM, X0);
  const tops = path([[right.x0, WELL.y0, RIM], [right.x1, WELL.y0, RIM], [right.x1, YC, RIM], [right.x0, YC, RIM]]) + path([[WELL.x0, front.y0, RIM], [X0, front.y0, RIM], [X0, front.y1, RIM], [WELL.x0, front.y1, RIM]]);
  out.push(`<g class="iso-solid">`);
  out.push(`<path class="iso-fill" d="${faces.map((f) => f[0]).join("")}${tops}"/>`);
  for (const [d, shade] of faces) sides.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
  out.push(sides.join(""));
  out.push(`<path class="iso-top" d="${tops}"/>`);
  out.push(`<path class="hx-cut" d="${cut}"/>`);
  const crease = path([[right.x1, right.y0, RIM], [right.x1, YC, RIM], [WELL.x1, YC, RIM]], false) + path([[X0, WELL.y1, RIM], [X0, OUTER.y1, RIM], [OUTER.x0, OUTER.y1, RIM]], false);
  out.push(L(crease, { tone: "faint", className: "iso-crease" }));
  const edges =
    path([[right.x1, right.y0, BOTTOM], [right.x1, YC, BOTTOM], [X0, YC, BOTTOM], [X0, OUTER.y1, BOTTOM], [OUTER.x0, OUTER.y1, BOTTOM]], false) +
    path([[right.x1, right.y0, BOTTOM], [right.x1, right.y0, RIM]], false) +
    path([[OUTER.x0, OUTER.y1, BOTTOM], [OUTER.x0, OUTER.y1, RIM]], false) +
    path([[WELL.x1, WELL.y0, RIM], [WELL.x1, YC, RIM], [WELL.x1, YC, FLOOR]], false) +
    path([[WELL.x0, WELL.y1, RIM], [X0, WELL.y1, RIM], [X0, WELL.y1, FLOOR]], false);
  out.push(L(edges, { tone: "mid", className: "iso-edge" }));
  out.push(`</g>`);
  // screws in the front rims
  const screws = [[31.3, -5.5], [-31.3, 28.3], [7.7, 28.3]];
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.0, RIM, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, RIM])), { size: 0.5 }));
  out.push(deck());
  out.push(usb());
  out.push(scale());
  return out.join("");
}

// A USB-C receptacle in the right-hand side.
function usb() {
  const x = OUTER.x1;
  const stadium = (cy, cz, half, r) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 10;
      pts.push([x, cy + half + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / 10;
      pts.push([x, cy - half + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return path(pts);
  };
  const slot = stadium(-6.5, 2, 2.85, 1.6);
  return `<path class="hx-hole" d="${slot}"/>` + L(slot, { tone: "lo" }) + L(stadium(-6.5, 2, 2.6, 0.35), { tone: "faint" }) + L(stadium(-6.5, 2, 3.6, 2.4), { tone: "faint" });
}

// An engraved travel scale on the section face beside the cut switch: zero where the magnet's face sits at rest.
const scaleZ = (depth) => MAGNET.z0 - depth;
function scale() {
  const { x0, x1, z0, z1, t } = STRIP;
  const y = YC + t;
  const out = [solid(k.extrude(rect(x0, x1, YC, y), z0, z1 - z0, P, { convex: true }), { tone: "mid" })];
  const minor = [];
  const major = [];
  for (let i = 0; i <= 8; i++) {
    const z = scaleZ(i / 2);
    (i % 2 ? minor : major).push(path([[x0, y, z], [x0 + (i % 2 ? 0.8 : 1.3), y, z]], false));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(`<path class="hx-mark" data-part="ap-mark" d="${apMark(HE.ap.start)}"/>`);
  out.push(`<path class="iso-line" data-tone="hi" data-part="rt-mark" style="opacity:0" d="${rtMark(2)}"/>`);
  return out.join("");
}
function apMark(depth) {
  const z = scaleZ(depth);
  const y = YC + STRIP.t;
  return path([[STRIP.x1, y, z], [STRIP.x1 - 0.9, y, z + 0.4], [STRIP.x1 - 0.9, y, z - 0.4]]);
}
function rtMark(depth) {
  const z = scaleZ(depth);
  const y = YC + STRIP.t;
  return path([[STRIP.x0, y, z], [STRIP.x0 + 1.9, y, z]], false);
}

// ---------- assemble, back to front ----------
const spring = coilZ(CX, CY, SPRING.r, SPRING.z0, SHOULDER.z0, SPRING.turns, P);
const capBelow = k.roundedPlan({ x: CX - 9, y: CY - 9, w: 18, d: 18, r: 1.2 }, 4);
const capAbove = k.roundedPlan({ x: CX - 6.4, y: CY - 7.6, w: 12.8, d: 13.4, r: 2.2 }, 4);
const capPoints = [0, HE.travel].flatMap((d) => [...capBelow.map(([x, y]) => at([x, y, CAP.z - d])), ...capAbove.map(([x, y]) => at([x, y, CAP.z + CAP.h - d]))]);
const hit = k.pathOf(hull(capPoints), true);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A small three-key aluminium macropad with its front right corner cut away through the third switch. Inside, the switch stem carries a small magnet above a hall-effect sensor on the circuit board. As the key goes down the magnet comes closer to the sensor, the field it reads grows, and the firmware turns that field back into a depth; a display on the case shows the depth, the field and every registered press.",
  body: [
    feet(),
    caseBack(),
    inside(),
    lowerHousing(),
    KEYS.slice(0, 2).map((x) => wholeUpper(x)).join(""),
    upperBack(),
    `<path class="iso-line" data-tone="faint" data-part="spring-back" d="${spring.back}"/>`,
    `<g data-part="stem">${stemLower()}</g>`,
    `<path class="iso-line" data-tone="lo" data-part="spring-front" d="${spring.front}"/>`,
    `<g data-part="stem">${shoulder()}</g>`,
    roofBack(),
    `<g data-part="stem">${stemUpper()}</g>`,
    lowerRight(),
    upperFront(),
    caseFront(),
    keycap(KEYS[0], "mid"),
    keycap(KEYS[1], "mid"),
    `<g data-part="cap">${cutKeycap(CX)}</g>`,
    `<path class="hx-hit" data-part="hit" d="${hit}"/>`,
  ],
});

const CSS = `
.iso{--hx-cut:#1f1f1f;--hx-glass:#050505;--hx-px:#e6edf5;--hx-hole:#060606}
.iso[data-theme="light"]{--hx-cut:#e3e3df;--hx-glass:#1a1b1d;--hx-px:#f2f6fb;--hx-hole:#46464a}
.hx-cut{fill:var(--hx-cut);stroke:none}
.hx-glass{fill:var(--hx-glass);stroke:none}
.hx-px{fill:var(--hx-px);stroke:none;font-family:var(--anatomy-mono)}
.hx-px-line{fill:none;stroke:var(--hx-px);stroke-width:.6px}
rect.hx-px-line[data-on]{fill:var(--hx-px)}
.hx-hole{fill:var(--hx-hole);stroke:none}
.hx-led{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);transition:fill 60ms}
.hx-led[data-on]{fill:var(--anatomy-lit);stroke:var(--anatomy-lit)}
.hx-mark{fill:var(--anatomy-lit);stroke:none}
.hx-hit{fill:transparent;stroke:none;cursor:ns-resize;touch-action:none;pointer-events:all}
.iso-stage{position:relative;outline:none;touch-action:pan-y}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.hx-controls{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:14px;font-family:var(--anatomy-mono);font-size:11.5px;color:var(--anatomy-text)}
.hx-ctl{display:inline-flex;align-items:center;gap:8px}
.hx-ctl>span{color:var(--anatomy-muted);text-transform:uppercase;letter-spacing:.08em;font-size:10.5px}
.hx-ctl output{min-width:52px;text-align:center;font-variant-numeric:tabular-nums;color:var(--anatomy-strong)}
.hx-ctl button{font:inherit;color:var(--anatomy-strong);background:var(--anatomy-card);border:0;box-shadow:0 0 0 1px var(--anatomy-mid);min-width:26px;height:24px;padding:0 8px;cursor:pointer}
.hx-ctl button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.hx-ctl button:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:3px}
.hx-ctl button[aria-pressed="false"]{color:var(--anatomy-muted)}
@media (max-width:560px){.iso-plate{overflow:hidden}.iso-stage .iso-svg{width:124%;margin:0 -12%}}
`;

const strip = (file) =>
  readFileSync(join(HERE, file), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/^export /gm, "");

const DATA = {
  P,
  CX,
  CY,
  spring: { r: SPRING.r, z0: SPRING.z0, top: SHOULDER.z0, turns: SPRING.turns },
  bar: { x: 0.6, w: ACTIVE.w - 1.2, y0: 4.5, y1: 7.0 },
  strip: { ...STRIP, y: YC + STRIP.t, zero: MAGNET.z0 },
  theme,
};

const live = `
${strip("model.mjs")}
${strip("coil.mjs")}
const DATA = ${JSON.stringify(DATA)};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;

const controls = `<div class="hx-controls" role="group" aria-label="Firmware settings">
<div class="hx-ctl"><span>Actuation</span><button type="button" data-act="ap-" aria-label="Raise actuation point">−</button><output data-out="ap">${HE.ap.start.toFixed(1)} mm</output><button type="button" data-act="ap+" aria-label="Lower actuation point">+</button></div>
<div class="hx-ctl"><span>Rapid trigger</span><button type="button" data-act="rapid" aria-pressed="true">on</button></div>
<div class="hx-ctl"><span>Sensitivity</span><button type="button" data-act="rt-" aria-label="Finer rapid trigger">−</button><output data-out="rt">${HE.rt.start.toFixed(1)} mm</output><button type="button" data-act="rt+" aria-label="Coarser rapid trigger">+</button></div>
${theme === "auto" ? `<div class="hx-ctl"><span>Theme</span><button type="button" data-act="theme">auto</button></div>` : ""}
</div>`;

let figure = k.plateHtml({
  fig: "Fig 1",
  title: "Hall-effect switch",
  hint: "Drag the keycap",
  readout: `0.00 mm · ${fieldAt(0).toFixed(1)} mT · up · 0 presses`,
  keys: [
    { mark: "lit", label: "Magnet in the stem: it moves 4.0 mm toward the sensor" },
    { mark: "raised", label: "Hall sensor on the PCB, switch housing cut in half" },
    { mark: "flat", label: "Section faces" },
  ],
  caption:
    "The stem carries a small magnet. As the key goes down, the magnet's face closes from 5.6 to 1.6 mm above the sensing element. The field rises from about 9 to 116 mT, much faster near the bottom, and the firmware polls it every millisecond and inverts the curve to get depth. Any depth from 0.1 to 4.0 mm can be the actuation point, in 0.1 mm steps. With rapid trigger on, the key releases as soon as it rises by the sensitivity from its deepest point and presses again as soon as it falls by the same amount, so short bounces near the bottom each count as a new press. With rapid trigger off, the key has to come back above the actuation point first. The field comes from the on-axis formula for a 3 × 2 mm NdFeB magnet; the scale on the section reads the magnet's travel.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Key depth. Drag the keycap, or use the up and down arrows; Shift for 1 mm steps, Escape to let go." aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" aria-valuetext="0.0 mm, key up">${svg}</div><span class="hx-live" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></span>`,
});
figure = figure.replace(`<figcaption class="iso-legend">`, `${controls}<figcaption class="iso-legend">`);

let html = k.pageHtml({ title: "Hall-effect switch", theme: theme === "auto" ? "dark" : theme, body: figure, script: kitScript() + live, width: 820 });
html = html.replace("</style>", `${CSS}</style>`);
if (theme === "auto") {
  const boot = `<script>(function(){var m="auto";try{m=localStorage.getItem("hx-theme")||"auto"}catch(e){}var t=m==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;document.body.setAttribute("data-theme",t);document.body.setAttribute("data-pref",m)})()</script>`;
  html = html.replace(/(<body[^>]*>)/, `$1${boot}`);
}
writeFileSync(join(HERE, OUT), html);
console.log("wrote", OUT, (html.length / 1024).toFixed(0) + " KB");
