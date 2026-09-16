// Poređenje poze igrača sa zadatom pozom — po položaju zglobova.
// Koristi se u bonus delu druge verzije trke.
// Sve je normalizovano na dužinu trupa i centrirano na kukove, pa ne zavisi
// ni od udaljenosti od kamere ni od mesta u kadru.

// A = leva strana EKRANA = igračeva leva strana (slika je ogledalo).
const JOINTS = [
  ['elbA', 13, 1.0], ['wriA', 15, 1.4],
  ['elbB', 14, 1.0], ['wriB', 16, 1.4],
  ['kneA', 25, 0.8], ['ankA', 27, 1.0],
  ['kneB', 26, 0.8], ['ankB', 28, 1.0],
  ['head', 0, 0.4]
];

const BONES = [
  [11, 13, 'elbA'], [13, 15, 'wriA'],
  [12, 14, 'elbB'], [14, 16, 'wriB'],
  [23, 25, 'kneA'], [25, 27, 'ankA'],
  [24, 26, 'kneB'], [26, 28, 'ankB'],
  [11, 12, null], [11, 23, null], [12, 24, null], [23, 24, null]
];

const vis = p => p && (p.visibility === undefined || p.visibility > 0.4);

// Osnovne mere tela u pikselima ekrana.
export function readBody(lms, toScreen) {
  if (!lms) return null;
  for (const i of [11, 12, 23, 24]) if (!vis(lms[i])) return null;
  const px = {};
  for (let i = 0; i < lms.length; i++) px[i] = toScreen(lms[i].x, lms[i].y);
  const cx = (px[23].x + px[24].x) / 2, cy = (px[23].y + px[24].y) / 2;
  const sx = (px[11].x + px[12].x) / 2, sy = (px[11].y + px[12].y) / 2;
  return { px: px, lms: lms, center: { x: cx, y: cy }, unit: Math.max(24, Math.hypot(sx - cx, sy - cy)) };
}

/**
 * Koliko igrač pogađa pozu: 0..1.
 * sig = koliko prašta (u dužinama trupa); 0.5 je blago.
 */
export function matchPose(body, pose, sig) {
  if (!body || !pose) return { fit: 0, segs: [] };
  const S = sig || 0.5;
  const sc = {};
  let ss = 0, sw = 0;
  for (const [key, li, w] of JOINTS) {
    if (!vis(body.lms[li])) continue;
    const t = key === 'head' ? pose.head : pose.joints[key];
    const x = (body.px[li].x - body.center.x) / body.unit;
    const y = (body.px[li].y - body.center.y) / body.unit;
    const d = Math.hypot(x - t.x, y - t.y) / S;
    const v = Math.exp(-d * d);
    sc[key] = v;
    ss += w * v; sw += w;
  }
  const segs = [];
  for (const [a, b, key] of BONES) {
    if (!vis(body.lms[a]) || !vis(body.lms[b])) continue;
    segs.push({ a: body.px[a], b: body.px[b], frac: key ? (sc[key] === undefined ? 0 : sc[key]) : -1 });
  }
  return { fit: sw ? ss / sw : 0, segs: segs };
}
