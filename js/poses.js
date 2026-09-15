// Poze za igru "Prođi kroz zid".
// Uglovi su u stepenima, u KOORDINATAMA EKRANA (x desno, y DOLE):
//   0 = desno, 90 = dole, -90 = gore, 180 = levo.
// Pošto je slika ogledalo, igrač samo ponavlja ono što vidi.
//
// A = ruka/noga na LEVOJ strani ekrana, B = na DESNOJ strani ekrana.
// Svaki par je [ugao nadlaktice/butine, ugao podlaktice/potkolenice].

export const POSES = [
  // ---------- LAKO ----------
  { name: 'T-POZA', diff: 1, armA: [180, 180], armB: [0, 0], legA: [93, 93], legB: [87, 87] },
  { name: 'RUKE GORE', diff: 1, armA: [-120, -120], armB: [-60, -60], legA: [93, 93], legB: [87, 87] },
  { name: 'MIRNO', diff: 1, armA: [103, 100], armB: [77, 80], legA: [93, 93], legB: [87, 87] },
  { name: 'ŠIROKE NOGE', diff: 1, armA: [180, 180], armB: [0, 0], legA: [115, 115], legB: [65, 65] },
  { name: 'ZVEZDA', diff: 1, armA: [-138, -138], armB: [-42, -42], legA: [113, 113], legB: [67, 67] },

  // ---------- SREDNJE ----------
  { name: 'KAKTUS', diff: 2, armA: [180, -90], armB: [0, -90], legA: [93, 93], legB: [87, 87] },
  { name: 'JEDNA GORE', diff: 2, armA: [-90, -90], armB: [0, 0], legA: [93, 93], legB: [87, 87] },
  { name: 'DRUGA GORE', diff: 2, armA: [180, 180], armB: [-90, -90], legA: [93, 93], legB: [87, 87] },
  { name: 'DIJAGONALA', diff: 2, armA: [-105, -105], armB: [75, 75], legA: [105, 105], legB: [87, 87] },
  { name: 'RUKE NA GLAVI', diff: 2, armA: [168, -62], armB: [12, -118], legA: [93, 93], legB: [87, 87] },
  { name: 'OBE U LEVO', diff: 2, armA: [175, 175], armB: [168, 168], legA: [100, 100], legB: [80, 80] },
  { name: 'OBE U DESNO', diff: 2, armA: [12, 12], armB: [5, 5], legA: [100, 100], legB: [80, 80] },

  // ---------- TEŠKO ----------
  { name: 'ČUČANJ', diff: 3, armA: [172, 172], armB: [8, 8], legA: [128, 58], legB: [52, 122] },
  { name: 'NOGA U STRANU', diff: 3, armA: [180, 180], armB: [0, 0], legA: [132, 132], legB: [87, 87] },
  { name: 'DRUGA NOGA', diff: 3, armA: [180, 180], armB: [0, 0], legA: [93, 93], legB: [48, 48] },
  { name: 'ČAJNIK', diff: 3, armA: [150, -100], armB: [-35, -35], legA: [100, 100], legB: [80, 80] },
  { name: 'SKI-POZA', diff: 3, armA: [-150, -170], armB: [-30, -10], legA: [118, 72], legB: [62, 108] },
  { name: 'RASKORAK + GORE', diff: 3, armA: [-100, -140], armB: [-80, -40], legA: [122, 122], legB: [58, 58] },
  { name: 'RUKE UKRŠTENE', diff: 3, armA: [55, 5], armB: [125, 175], legA: [96, 96], legB: [84, 84] },
  { name: 'RUKA NA KUKU', diff: 3, armA: [160, 72], armB: [-60, -60], legA: [97, 97], legB: [83, 83] },
  { name: 'DRUGA NA KUKU', diff: 3, armA: [-120, -120], armB: [20, 108], legA: [97, 97], legB: [83, 83] },
  { name: 'BOLT', diff: 3, armA: [-38, -38], armB: [148, 28], legA: [112, 112], legB: [74, 74] },
  { name: 'SLOVO V DOLE', diff: 3, armA: [128, 128], armB: [52, 52], legA: [124, 124], legB: [56, 56] },
  { name: 'W POZA', diff: 3, armA: [-160, -32], armB: [-20, -148], legA: [95, 95], legB: [85, 85] },
  { name: 'SAVIJENA NOGA', diff: 3, armA: [180, 180], armB: [0, 0], legA: [122, 18], legB: [86, 86] },
  { name: 'BOČNO ISTEZANJE', diff: 3, armA: [-98, -142], armB: [96, 96], legA: [95, 95], legB: [85, 85] },
  { name: 'JUNAK', diff: 3, armA: [160, 72], armB: [20, 108], legA: [118, 118], legB: [62, 62] },
  { name: 'MAHANJE', diff: 3, armA: [-102, -58], armB: [20, 108], legA: [96, 96], legB: [84, 84] },
  { name: 'STRELICA GORE', diff: 3, armA: [-100, -100], armB: [-80, -80], legA: [93, 93], legB: [87, 87] },
  { name: 'LETENJE', diff: 3, armA: [158, 158], armB: [22, 22], legA: [100, 100], legB: [80, 80] },
  { name: 'POLA KAKTUSA', diff: 3, armA: [180, -90], armB: [0, 0], legA: [95, 95], legB: [85, 85] },
  { name: 'DRUGA POLA', diff: 3, armA: [180, 180], armB: [0, -90], legA: [95, 95], legB: [85, 85] },
  { name: 'POLA ZVEZDE', diff: 3, armA: [-138, -138], armB: [0, 0], legA: [113, 113], legB: [87, 87] },
  { name: 'MAČKA', diff: 3, armA: [-135, -45], armB: [-45, -135], legA: [97, 97], legB: [83, 83] },

  // ---------- LUDO ----------
  { name: 'DISKO', diff: 4, armA: [-52, -52], armB: [126, 126], legA: [116, 116], legB: [78, 78] },
  { name: 'DISKO OBRNUTO', diff: 4, armA: [54, 54], armB: [-128, -128], legA: [102, 102], legB: [64, 64] },
  { name: 'ROBOT', diff: 4, armA: [180, -90], armB: [0, 90], legA: [95, 95], legB: [85, 85] },
  { name: 'ROBOT NAOPAKO', diff: 4, armA: [180, 90], armB: [0, -90], legA: [95, 95], legB: [85, 85] },
  { name: 'ZMIJA', diff: 4, armA: [155, -95], armB: [25, 95], legA: [100, 100], legB: [80, 80] },
  { name: 'ČUČANJ + GORE', diff: 4, armA: [-118, -118], armB: [-62, -62], legA: [130, 54], legB: [50, 126] },
  { name: 'ČUČANJ + NAPRED', diff: 4, armA: [174, 174], armB: [6, 6], legA: [133, 50], legB: [47, 130] },
  { name: 'ŠKARE', diff: 4, armA: [180, 180], armB: [0, 0], legA: [76, 76], legB: [104, 104] },
  { name: 'ORAO', diff: 4, armA: [-162, -162], armB: [-18, -18], legA: [136, 136], legB: [44, 44] },
  { name: 'PATKA', diff: 4, armA: [148, 98], armB: [32, 82], legA: [122, 122], legB: [58, 58] },
  { name: 'K POZA', diff: 4, armA: [-90, -90], armB: [38, 38], legA: [94, 94], legB: [52, 52] },
  { name: 'K NAOPAKO', diff: 4, armA: [142, 142], armB: [-90, -90], legA: [128, 128], legB: [86, 86] },
  { name: 'VETRENJAČA', diff: 4, armA: [-142, -142], armB: [38, 38], legA: [104, 104], legB: [66, 66] },
  { name: 'ČAJNIK NA OBE', diff: 4, armA: [158, 70], armB: [22, 110], legA: [118, 118], legB: [62, 62] },
  { name: 'LOMLJENE RUKE', diff: 4, armA: [-150, -35], armB: [-30, 95], legA: [110, 110], legB: [70, 70] },
  { name: 'SKIJAŠ DESNO', diff: 4, armA: [-20, -20], armB: [-5, -5], legA: [124, 66], legB: [58, 112] },
  { name: 'SKIJAŠ LEVO', diff: 4, armA: [-175, -175], armB: [-160, -160], legA: [122, 68], legB: [56, 114] },
  { name: 'JELKA', diff: 4, armA: [140, 140], armB: [40, 40], legA: [134, 134], legB: [46, 46] },
  { name: 'KUNG FU', diff: 4, armA: [-158, -82], armB: [30, 100], legA: [128, 38], legB: [86, 86] },
  { name: 'BALERINA', diff: 4, armA: [-115, -55], armB: [-65, -125], legA: [136, 136], legB: [85, 85] },
  { name: 'ŠIROKO V', diff: 4, armA: [-155, -155], armB: [-25, -25], legA: [128, 128], legB: [52, 52] },
  { name: 'SLOVO Z', diff: 4, armA: [175, -30], armB: [10, 150], legA: [98, 98], legB: [82, 82] },
  { name: 'ZAVRNUTO', diff: 4, armA: [-70, -170], armB: [-110, -10], legA: [103, 103], legB: [77, 77] },
  { name: 'ČUČANJ U STRANU', diff: 4, armA: [-28, -28], armB: [-12, -12], legA: [130, 54], legB: [50, 126] },
  { name: 'RASKORAK + KAKTUS', diff: 4, armA: [180, -90], armB: [0, -90], legA: [126, 126], legB: [54, 54] },
  { name: 'PROPELER', diff: 4, armA: [-115, -25], armB: [65, 155], legA: [100, 100], legB: [80, 80] },
  { name: 'SLOMLJENO V', diff: 4, armA: [-140, -70], armB: [-40, -110], legA: [116, 116], legB: [64, 64] },
  { name: 'ČOVEK PAUK', diff: 4, armA: [-160, -100], armB: [-20, -80], legA: [140, 92], legB: [40, 88] },
  { name: 'PADOBRANAC', diff: 4, armA: [-170, -118], armB: [-10, -62], legA: [126, 70], legB: [54, 110] },
  { name: 'STOP', diff: 4, armA: [112, 8], armB: [68, 172], legA: [104, 104], legB: [76, 76] },
  { name: 'TRČANJE', diff: 4, armA: [-62, -112], armB: [112, 62], legA: [122, 58], legB: [84, 84] },
  { name: 'TRČANJE NAOPAKO', diff: 4, armA: [68, 118], armB: [-118, -68], legA: [96, 96], legB: [58, 122] }
];

// Dužine segmenata u jedinicama trupa (rastojanje sredina-ramena -> sredina-kukova = 1).
export const BODY = {
  shoulder: 0.44,   // pola širine ramena
  hipHalf: 0.20,
  upperArm: 0.62,
  foreArm: 0.58,
  thigh: 0.80,
  shin: 0.78,
  headUp: 0.40      // koliko je centar glave iznad linije ramena
};

const RAD = Math.PI / 180;

// Napravi tačke skeleta poze u normalizovanom prostoru (sredina kukova = 0,0; y ide DOLE).
export function buildPose(p) {
  const S = { x: 0, y: -1 };            // sredina ramena
  const H = { x: 0, y: 0 };             // sredina kukova
  const step = (from, len, deg) => ({ x: from.x + len * Math.cos(deg * RAD), y: from.y + len * Math.sin(deg * RAD) });

  const shoA = { x: -BODY.shoulder, y: -1 };
  const shoB = { x: BODY.shoulder, y: -1 };
  const hipA = { x: -BODY.hipHalf, y: 0 };
  const hipB = { x: BODY.hipHalf, y: 0 };

  const elbA = step(shoA, BODY.upperArm, p.armA[0]);
  const wriA = step(elbA, BODY.foreArm, p.armA[1]);
  const elbB = step(shoB, BODY.upperArm, p.armB[0]);
  const wriB = step(elbB, BODY.foreArm, p.armB[1]);

  const kneA = step(hipA, BODY.thigh, p.legA[0]);
  const ankA = step(kneA, BODY.shin, p.legA[1]);
  const kneB = step(hipB, BODY.thigh, p.legB[0]);
  const ankB = step(kneB, BODY.shin, p.legB[1]);

  const head = { x: 0, y: -1 - BODY.headUp };

  return {
    name: p.name, diff: p.diff, head: head,
    bones: [
      [shoA, shoB], [shoA, hipA], [shoB, hipB], [hipA, hipB],
      [S, H],
      [shoA, elbA], [elbA, wriA],
      [shoB, elbB], [elbB, wriB],
      [hipA, kneA], [kneA, ankA],
      [hipB, kneB], [kneB, ankB],
      [S, { x: head.x, y: head.y + 0.18 }]
    ],
    joints: { shoA, shoB, hipA, hipB, elbA, wriA, elbB, wriB, kneA, ankA, kneB, ankB, S, H, head }
  };
}

// Najmanje rastojanje tačke do duži.
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const dd = dx * dx + dy * dy;
  let t = dd === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / dd;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Koliko je tačka "unutar" rupe: <=0 znači unutra.
export function holeDepth(pose, x, y, holeR, headR) {
  let best = Infinity;
  for (const b of pose.bones) {
    const d = segDist(x, y, b[0].x, b[0].y, b[1].x, b[1].y) - holeR;
    if (d < best) best = d;
  }
  const dh = Math.hypot(x - pose.head.x, y - pose.head.y) - headR;
  return Math.min(best, dh);
}
