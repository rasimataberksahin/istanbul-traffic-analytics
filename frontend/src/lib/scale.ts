export interface NiceScale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(rawStep: number): number {
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Expands a data range to round axis values. */
export function niceScale(minimum: number, maximum: number, tickCount = 5): NiceScale {
  const low = minimum === maximum ? minimum - 1 : minimum;
  const high = minimum === maximum ? maximum + 1 : maximum;
  const step = niceStep((high - low) / (tickCount - 1));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const steps = Math.round((max - min) / step);
  const ticks = Array.from({ length: steps + 1 }, (_, index) => Number((min + index * step).toFixed(6)));
  return { min, max, ticks };
}

export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (value: number) => (d0 === d1 ? r0 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0));
}

/** Builds an SVG path and starts a new segment after every missing value. */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let path = "";
  let drawing = false;
  for (const point of points) {
    if (!point) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    drawing = true;
  }
  return path;
}

export function classOf(value: number, thresholds: number[]): number {
  const index = thresholds.findIndex((threshold) => value < threshold);
  return index === -1 ? thresholds.length + 1 : index + 1;
}

export const HEAT_THRESHOLDS = [45, 50, 55, 60, 65, 70];
export const CONGESTION_THRESHOLDS = [-0.2, -0.05, 0.05, 0.2, 0.35, 0.5];

/** Class 1 is the slowest traffic and class 7 the fastest. */
export const heatClass = (speed: number) => classOf(speed, HEAT_THRESHOLDS);

/** Class 4 is neutral. Higher classes mean a slower evening than night. */
export const congestionClass = (index: number) => classOf(index, CONGESTION_THRESHOLDS);

export const CHANGE_THRESHOLDS = [-6, -3, -1, 1, 3, 6];

/** Class 7 is a strong slowdown and class 1 a strong speed-up, matching the congestion colors. */
export const changeClass = (change: number) => 8 - classOf(change, CHANGE_THRESHOLDS);
