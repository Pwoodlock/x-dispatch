/**
 * Own-aircraft map symbol.
 *
 * One generic airplane and one generic helicopter, drawn in code. The
 * symbol is rendered once into a canvas, a light body with a navy edge, so
 * it stays crisp at any heading and reads on every basemap. No SDF: the
 * outline is in the pixels.
 */

export type OwnshipIconKind = 'airplane' | 'helicopter';

export const OWNSHIP_ICON_ID: Record<OwnshipIconKind, string> = {
  airplane: 'ownship-airplane',
  helicopter: 'ownship-helicopter',
};

/** One registered image per symbol and colour scheme, so switching schemes never redraws an image a layer still uses. */
export function ownshipIconId(kind: OwnshipIconKind, scheme: OwnshipColorScheme): string {
  return `${OWNSHIP_ICON_ID[kind]}-${scheme}`;
}

/** On-screen size of the symbol in CSS pixels, the same at every zoom. */
export type OwnshipSize = 'small' | 'medium' | 'large';
export const OWNSHIP_SIZES: readonly OwnshipSize[] = ['small', 'medium', 'large'];
export const OWNSHIP_SIZE_PX: Record<OwnshipSize, number> = { small: 32, medium: 44, large: 60 };

export interface OwnshipStyle {
  size: OwnshipSize;
  color: OwnshipColorScheme;
  /** Ground shadow that drifts away from the symbol with height above ground. */
  altitudeCues: boolean;
}

export const DEFAULT_OWNSHIP_STYLE: OwnshipStyle = {
  size: 'medium',
  color: 'magenta',
  altitudeCues: true,
};

/** The symbol's shadow on the ground, one per kind. */
export function ownshipShadowId(kind: OwnshipIconKind): string {
  return `${OWNSHIP_ICON_ID[kind]}-shadow`;
}

/** Canvas edge in CSS pixels; the symbol fills it with a small margin for the outline. */
export const OWNSHIP_ICON_SIZE = 64;
export const OWNSHIP_ICON_PIXEL_RATIO = 2;
const EDGE_WIDTH = 2;

/** Colour schemes the pilot can pick; online traffic is green and cyan, so each is a light body with a dark edge. */
export type OwnshipColorScheme = 'white' | 'magenta' | 'orange';
export const OWNSHIP_COLOR_SCHEMES: readonly OwnshipColorScheme[] = ['white', 'magenta', 'orange'];

export interface OwnshipColors {
  fill: string;
  edge: string;
  /** The anchor ring and data label. */
  accent: string;
}

// --xp-cyan-deepest from index.css
const NAVY = '#07283D';
const WHITE = '#F8FAFC';
// Farthest in OKLab from every ground, traffic colour and chart marking the map shows.
const MAGENTA = '#E040FB';
const ORANGE = '#FB923C';
const SHADOW_COLORS: OwnshipColors = { fill: '#000000', edge: '#000000', accent: '#000000' };

export const OWNSHIP_COLORS: Record<OwnshipColorScheme, OwnshipColors> = {
  white: { fill: WHITE, edge: NAVY, accent: WHITE },
  magenta: { fill: MAGENTA, edge: NAVY, accent: MAGENTA },
  orange: { fill: ORANGE, edge: NAVY, accent: ORANGE },
};

/** The scheme's colours, or the default's for a value saved by an older build. */
export function ownshipColors(scheme: string): OwnshipColors {
  return (
    OWNSHIP_COLORS[scheme as OwnshipColorScheme] ?? OWNSHIP_COLORS[DEFAULT_OWNSHIP_STYLE.color]
  );
}

export function isOwnshipColorScheme(value: unknown): value is OwnshipColorScheme {
  return typeof value === 'string' && value in OWNSHIP_COLORS;
}

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
export function createOwnshipIcon(
  kind: OwnshipIconKind,
  scheme: OwnshipColorScheme = 'magenta'
): OwnshipIconImage {
  return renderOwnship(kind, ownshipColors(scheme));
}

/** The symbol as a flat black silhouette, drawn on the ground under the aircraft. */
export function createOwnshipShadow(kind: OwnshipIconKind): OwnshipIconImage {
  return renderOwnship(kind, SHADOW_COLORS);
}

function renderOwnship(kind: OwnshipIconKind, colors: OwnshipColors): OwnshipIconImage {
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

  ctx.fillStyle = colors.fill;
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = EDGE_WIDTH * OWNSHIP_ICON_PIXEL_RATIO;
  ctx.lineJoin = 'round';
  if (kind === 'helicopter') drawHelicopter(ctx, px);
  else drawAirplane(ctx, px);

  return {
    ...blank,
    data: new Uint8Array(ctx.getImageData(0, 0, px, px).data.buffer),
  };
}
