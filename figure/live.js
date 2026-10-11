const P = DATA.P;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector(`[data-part="${name}"]`);
const stems = [...svg.querySelectorAll('[data-part="stem"]'), part("cap")];
const springBack = part("spring-back");
const springFront = part("spring-front");
const led = part("led");
const apMarkEl = part("ap-mark");
const rtMarkEl = part("rt-mark");
const oled = {
  depth: part("oled-depth"),
  field: part("oled-field"),
  bar: part("oled-bar"),
  ap: part("oled-ap"),
  set: part("oled-set"),
  on: part("oled-on"),
  count: part("oled-count"),
};
const readout = document.querySelector("[data-readout]");
const announce = document.querySelector(".hx-live");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const tenthOf = (value) => Math.round(value * 10) / 10;

const settings = { ap: HE.ap.start, rt: HE.rt.start, rapid: true };
const fw = firmware();
let depth = 0;
let target = 0;
let touring = !still.matches;
let clock = 0;
let loop = 0;
let dragging = null;
let holding = false;
let frame = 0;
let last = 0;
let visible = false;
let idle = 0;

const scaleZ = (d) => DATA.strip.zero - d;
const onStrip = (points) => pathOf(points.map(([x, z]) => iso([x, DATA.strip.y, z], P)), false);
const apPath = (d) => {
  const z = scaleZ(d);
  const { x1 } = DATA.strip;
  return onStrip([[x1, z], [x1 - 0.9, z + 0.4], [x1 - 0.9, z - 0.4]]) + "Z";
};
const rtPath = (d) => onStrip([[DATA.strip.x0, scaleZ(d)], [DATA.strip.x0 + 1.9, scaleZ(d)]]);

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
function setAttr(el, name, value) {
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function describe() {
  const text = `${fw.depth.toFixed(1)} mm, key ${fw.on ? "down" : "up"}, ${fw.presses} ${fw.presses === 1 ? "press" : "presses"}`;
  stage.setAttribute("aria-valuenow", fw.depth.toFixed(1));
  stage.setAttribute("aria-valuetext", text);
}

function showSettings() {
  setText(document.querySelector('[data-out="ap"]'), `${settings.ap.toFixed(1)} mm`);
  setText(document.querySelector('[data-out="rt"]'), `${settings.rt.toFixed(1)} mm`);
  const rapid = document.querySelector('[data-act="rapid"]');
  rapid.setAttribute("aria-pressed", String(settings.rapid));
  setText(rapid, settings.rapid ? "on" : "off");
  setText(oled.set, `AP ${settings.ap.toFixed(1)}  RT ${settings.rapid ? settings.rt.toFixed(1) : "off"}`);
  const x = DATA.bar.x + (settings.ap / HE.travel) * DATA.bar.w;
  setAttr(oled.ap, "d", `M${x.toFixed(2)} ${DATA.bar.y0}V${DATA.bar.y1}`);
  setAttr(apMarkEl, "d", apPath(settings.ap));
}

let wasOn = false;
function draw() {
  const move = translateAlong(P, [0, 0, -depth]);
  for (const el of stems) setAttr(el, "transform", move);
  const coil = coilZ(DATA.CX, DATA.CY, DATA.spring.r, DATA.spring.z0, DATA.spring.top - depth, DATA.spring.turns, P);
  setAttr(springBack, "d", coil.back);
  setAttr(springFront, "d", coil.front);

  setText(oled.depth, fw.depth.toFixed(2));
  setText(oled.field, `${fw.field.toFixed(1)} mT`);
  setAttr(oled.bar, "width", ((fw.depth / HE.travel) * DATA.bar.w).toFixed(2));
  setText(oled.count, `x${fw.presses}`);
  if (fw.on !== wasOn) {
    wasOn = fw.on;
    for (const el of [oled.on, led]) fw.on ? el.setAttribute("data-on", "") : el.removeAttribute("data-on");
    describe();
  }
  const next = nextLevel(fw, settings);
  if (next === null || next < 0 || next > HE.travel) setAttr(rtMarkEl, "style", "opacity:0");
  else {
    setAttr(rtMarkEl, "style", "opacity:1");
    setAttr(rtMarkEl, "d", rtPath(next));
  }
  setText(readout, `${fw.depth.toFixed(2)} mm · ${fw.field.toFixed(1)} mT · ${fw.on ? "down" : "up"} · ${fw.presses} ${fw.presses === 1 ? "press" : "presses"}`);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    clock += dt;
    const round = Math.floor(clock / TOUR);
    if (round !== loop) {
      loop = round;
      fw.presses = 0;
    }
    target = tourAt(clock - round * TOUR);
  }
  const before = depth;
  const tau = touring ? 0.012 : 0.035;
  depth = calm ? target : depth + (target - depth) * (1 - Math.exp(-dt / tau));
  if (Math.abs(target - depth) < 0.002) depth = target;
  // The firmware polls the sensor once a millisecond.
  const polls = Math.max(1, Math.round(dt / HE.poll));
  for (let i = 1; i <= polls; i++) poll(fw, fieldAt(before + ((depth - before) * i) / polls), settings);
  draw();
  const settled = !touring && depth === target;
  if (settled) describe();
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
const quiet = () => {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (dragging || still.matches) return;
    touring = true;
    holding = false;
    clock = 0;
    loop = 0;
    fw.presses = 0;
    run();
  }, 3600);
};
const takeOver = () => {
  if (touring) {
    touring = false;
    target = depth;
  }
  quiet();
  run();
};

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

// Drag: one screen pixel down is one pixel of the key's travel on screen.
const pxPerMm = () => screenRise(1, P) * (svg.getBoundingClientRect().width / svg.viewBox.baseVal.width);
function startDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  takeOver();
  dragging = { id: event.pointerId, y: event.clientY, from: holding ? target : depth };
  holding = false;
  try {
    stage.setPointerCapture(event.pointerId);
  } catch (error) {}
}
part("hit").addEventListener("pointerdown", startDrag);
stage.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && !dragging) startDrag(event);
});
stage.addEventListener("pointermove", (event) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  target = clamp(dragging.from + (event.clientY - dragging.y) / pxPerMm(), 0, HE.travel);
  quiet();
  run();
});
const letGo = (event) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  dragging = null;
  target = 0; // the switch spring returns the key
  quiet();
  run();
};
stage.addEventListener("pointerup", letGo);
stage.addEventListener("pointercancel", letGo);

stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 1 : HE.ap.step;
  const from = holding ? target : depth;
  let to = null;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") to = from + step;
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = from - step;
  if (event.key === "End") to = HE.travel;
  if (event.key === "Home" || event.key === "Escape") to = 0;
  if (to === null) return;
  event.preventDefault();
  takeOver();
  holding = to > 0;
  target = clamp(tenthOf(to), 0, HE.travel);
  run();
});

let said = 0;
function say(text) {
  clearTimeout(said);
  said = setTimeout(() => (announce.textContent = text), 700);
}
document.querySelector(".hx-controls").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "theme") return cycleTheme(button);
  if (act === "ap-") settings.ap = tenthOf(clamp(settings.ap - HE.ap.step, HE.ap.min, HE.ap.max));
  if (act === "ap+") settings.ap = tenthOf(clamp(settings.ap + HE.ap.step, HE.ap.min, HE.ap.max));
  if (act === "rt-") settings.rt = tenthOf(clamp(settings.rt - HE.rt.step, HE.rt.min, HE.rt.max));
  if (act === "rt+") settings.rt = tenthOf(clamp(settings.rt + HE.rt.step, HE.rt.min, HE.rt.max));
  if (act === "rapid") settings.rapid = !settings.rapid;
  fw.presses = 0;
  fw.fresh = true;
  showSettings();
  say(`Actuation ${settings.ap.toFixed(1)} millimetres, rapid trigger ${settings.rapid ? `on at ${settings.rt.toFixed(1)} millimetres` : "off"}`);
  draw();
  run();
});

function themeOf(pref) {
  return pref === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : pref;
}
function cycleTheme(button) {
  const order = ["auto", "light", "dark"];
  const pref = order[(order.indexOf(document.body.dataset.pref || "auto") + 1) % order.length];
  document.body.dataset.pref = pref;
  document.body.dataset.theme = themeOf(pref);
  button.textContent = pref;
  try {
    localStorage.setItem("hx-theme", pref);
  } catch (error) {}
}
if (DATA.theme === "auto") {
  const button = document.querySelector('[data-act="theme"]');
  if (button) button.textContent = document.body.dataset.pref || "auto";
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if ((document.body.dataset.pref || "auto") === "auto") document.body.dataset.theme = themeOf("auto");
  });
}

poll(fw, fieldAt(0), settings);
showSettings();
draw();
describe();
