import { iso, pathOf, cameraOf } from "../.claude/skills/anatomy/kit/iso-kit.mjs";

// A vertical coil spring with a closed (ground) turn at each end, split into the half behind the axis and the
// half in front of it, so the stem can be painted between them.
export function coilZ(cx, cy, r, z0, z1, turns, P, perTurn = 32) {
  const { sinA, cosA } = cameraOf(P);
  const points = [];
  const add = (angle, z) => points.push([iso([cx + r * Math.cos(angle), cy + r * Math.sin(angle), z], P), Math.cos(angle) * cosA + Math.sin(angle) * sinA > 0]);
  for (let i = 0; i <= perTurn; i++) add((2 * Math.PI * i) / perTurn, z0);
  const count = Math.round(turns * perTurn);
  for (let i = 1; i <= count; i++) add((2 * Math.PI * turns * i) / count, z0 + ((z1 - z0) * i) / count);
  for (let i = 1; i <= perTurn; i++) add(2 * Math.PI * turns + (2 * Math.PI * i) / perTurn, z1);
  const runs = { true: [], false: [] };
  let run = [points[0][0]];
  let side = points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [point, front] = points[i];
    if (front !== side) {
      const edge = [(run[run.length - 1][0] + point[0]) / 2, (run[run.length - 1][1] + point[1]) / 2];
      run.push(edge);
      runs[side].push(pathOf(run));
      run = [edge];
      side = front;
    }
    run.push(point);
  }
  runs[side].push(pathOf(run));
  return { back: runs.false.join(""), front: runs.true.join("") };
}
