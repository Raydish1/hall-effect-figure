// Pure model of one hall-effect switch and the firmware that reads it. Lengths in mm, field in mT.
export const HE = {
  travel: 4.0,
  ap: { min: 0.1, max: 4.0, step: 0.1, start: 1.5 },
  rt: { min: 0.1, max: 2.0, step: 0.1, start: 0.3 },
  // Axially magnetised NdFeB cylinder in the foot of the stem.
  magnet: { radius: 1.5, length: 2.0, remanence: 1.2 },
  // Magnet face to the top of the sensor package at the bottom of travel, and package top to the sensing element.
  airGap: 1.2,
  die: 0.4,
  poll: 0.001,
};

export const gapAt = (depth) => HE.airGap + HE.die + (HE.travel - depth);

// On-axis field of a cylindrical magnet at distance g from its face: Br/2 · [(L+g)/√(R²+(L+g)²) − g/√(R²+g²)].
export function fieldAt(depth) {
  const g = gapAt(depth);
  const { radius, length, remanence } = HE.magnet;
  return 500 * remanence * ((length + g) / Math.hypot(radius, length + g) - g / Math.hypot(radius, g));
}

// The firmware's calibration: invert the field curve (it rises monotonically with depth).
export function depthFromField(field) {
  let low = 0;
  let high = HE.travel;
  if (field <= fieldAt(0)) return 0;
  if (field >= fieldAt(HE.travel)) return HE.travel;
  for (let step = 0; step < 40; step++) {
    const mid = (low + high) / 2;
    if (fieldAt(mid) < field) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export const firmware = () => ({ on: false, fresh: true, ext: 0, presses: 0, depth: 0, field: fieldAt(0) });

// One poll. With rapid trigger the key releases as soon as it rises `rt` from its deepest point and presses
// again as soon as it falls `rt` from its highest point, anywhere below the actuation point.
export function poll(fw, field, settings) {
  const depth = depthFromField(field);
  fw.depth = depth;
  fw.field = field;
  const ap = settings.ap - 1e-6;
  if (!settings.rapid) {
    if (!fw.on && depth >= ap) {
      fw.on = true;
      fw.presses++;
    } else if (fw.on && depth < ap) fw.on = false;
    fw.fresh = true;
    fw.ext = depth;
    return;
  }
  if (depth < ap) {
    fw.on = false;
    fw.fresh = true;
    fw.ext = depth;
  } else if (fw.on) {
    if (depth <= fw.ext - settings.rt + 1e-6) {
      fw.on = false;
      fw.fresh = false;
      fw.ext = depth;
    } else fw.ext = Math.max(fw.ext, depth);
  } else if (fw.fresh || depth >= fw.ext + settings.rt - 1e-6) {
    fw.on = true;
    fw.fresh = false;
    fw.ext = depth;
    fw.presses++;
  } else fw.ext = Math.min(fw.ext, depth);
}

// Where the next change of state happens while rapid trigger is in charge, or null.
export function nextLevel(fw, settings) {
  if (!settings.rapid || fw.depth < settings.ap - 1e-6 || (!fw.on && fw.fresh)) return null;
  return fw.on ? fw.ext - settings.rt : fw.ext + settings.rt;
}

// The idle tour: a full press, uneven bounces near the bottom, a long lift and a press back down, a rocking
// half press, a full release and a light tap. Each keyframe is a turn of the finger, so the key eases in and out of it.
const TOUR_KEYS = [
  [0, 0], [0.6, 0], [1.0, 4.0], [1.3, 4.0], [1.55, 3.2], [1.8, 4.0], [1.98, 3.65], [2.16, 3.95], [2.55, 2.3],
  [2.9, 3.85], [3.08, 3.5], [3.3, 4.0], [3.8, 1.3], [4.2, 3.1], [4.38, 2.7], [4.56, 3.3], [4.72, 2.95], [5.15, 0],
  [5.55, 0], [5.75, 0.7], [5.95, 0], [6.15, 0.45], [6.35, 0], [7.2, 0],
];
export const TOUR = TOUR_KEYS[TOUR_KEYS.length - 1][0];
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export function tourAt(t) {
  for (let i = 1; i < TOUR_KEYS.length; i++) {
    const [t1, d1] = TOUR_KEYS[i];
    if (t <= t1) {
      const [t0, d0] = TOUR_KEYS[i - 1];
      return d0 + (d1 - d0) * ease((t - t0) / (t1 - t0));
    }
  }
  return 0;
}
