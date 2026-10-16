/**
 * Own-aircraft map symbol.
 *
 * One generic airplane and one generic helicopter, drawn in code — the
 * per-type silhouettes in `aircraft-shapes/` are for traffic. The symbol is
 * rendered once into a canvas: deep-navy body with a cyan edge (the panel
 * palette), so it stays crisp at any heading and reads on every basemap.
 * No SDF: the outline is in the pixels.
 */

export type OwnshipIconKind = 'airplane' | 'helicopter';

export const OWNSHIP_ICON_ID: Record<OwnshipIconKind, string> = {
  airplane: 'ownship-airplane',
  helicopter: 'ownship-helicopter',
};

/** Canvas edge in CSS pixels; the symbol fills it with a small margin for the outline. */
export const OWNSHIP_ICON_SIZE = 64;
export const OWNSHIP_ICON_PIXEL_RATIO = 2;
// --xp-cyan-deepest / --primary from index.css
const BODY_FILL = '#07283D';
const EDGE_STROKE = '#1DA0F2';
const EDGE_WIDTH = 2;

type Point = readonly [number, number];

/** Right half of the airplane, nose up, in a 0..1 box; mirrored to close the polygon. */
const AIRPLANE_RIGHT_HALF: readonly Point[] = [
  [0.5, 0.03],
  [0.555, 0.12],
  [0.56, 0.36],
  [0.96, 0.57],
  [0.97, 0.64],
  [0.56, 0.56],
  [0.55, 0.8],
  [0.72, 0.9],
  [0.72, 0.95],
  [0.52, 0.91],
  [0.5, 0.98],
];

/** Full closed outline, right half then the mirrored left half walking back up. */
export function airplaneOutline(): Point[] {
  const right = AIRPLANE_RIGHT_HALF;
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [1 - x, y] as Point);
  return [...right, ...left];
}

export interface OwnshipIconImage {
  width: number;
  height: number;
  data: Uint8Array;
  pixelRatio: number;
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: readonly Point[], s: number): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * s, y * s) : ctx.lineTo(x * s, y * s)));
  ctx.closePath();
}

function drawAirplane(ctx: CanvasRenderingContext2D, s: number): void {
  tracePolygon(ctx, airplaneOutline(), s);
  ctx.fill();
  ctx.stroke();
}

function drawHelicopter(ctx: CanvasRenderingContext2D, s: number): void {
  // Rotor first: two outlined blades through the hub, under the cabin.
  const r = 0.42 * s;
  const w = 0.09 * s;
  ctx.save();
  ctx.translate(0.5 * s, 0.42 * s);
  ctx.rotate(Math.PI / 4);
  for (const angle of [0, Math.PI / 2]) {
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-r, -w / 2, r * 2, w, w / 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // Tail boom + fin, then the cabin on top of both.
  tracePolygon(
    ctx,
    [
      [0.47, 0.55],
      [0.53, 0.55],
      [0.52, 0.86],
      [0.64, 0.9],
      [0.64, 0.95],
      [0.5, 0.93],
      [0.47, 0.95],
    ],
    s
  );
  ctx.fill();
  ctx.stroke();
  // Cabin.
  ctx.beginPath();
  ctx.ellipse(0.5 * s, 0.42 * s, 0.14 * s, 0.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Rasterise the symbol. Returns a transparent image when no 2D canvas is
 * available (unit tests run in Node) so the layer can still be built.
 */
export function createOwnshipIcon(kind: OwnshipIconKind): OwnshipIconImage {
  const px = OWNSHIP_ICON_SIZE * OWNSHIP_ICON_PIXEL_RATIO;
  const blank: OwnshipIconImage = {
    width: px,
    height: px,
    data: new Uint8Array(px * px * 4),
    pixelRatio: OWNSHIP_ICON_PIXEL_RATIO,
  };
  if (typeof document === 'undefined') return blank;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blank;

  ctx.fillStyle = BODY_FILL;
  ctx.strokeStyle = EDGE_STROKE;
  ctx.lineWidth = EDGE_WIDTH * OWNSHIP_ICON_PIXEL_RATIO;
  ctx.lineJoin = 'round';
  if (kind === 'helicopter') drawHelicopter(ctx, px);
  else drawAirplane(ctx, px);

  return {
    ...blank,
    data: new Uint8Array(ctx.getImageData(0, 0, px, px).data.buffer),
  };
}
