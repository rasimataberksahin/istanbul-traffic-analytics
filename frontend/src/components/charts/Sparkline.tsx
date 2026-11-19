interface SparklineProps {
  values: (number | null)[];
  /** "line" draws a soft area under a line, "bars" draws one column per value. */
  variant?: "line" | "bars";
  /** Index drawn as a marker (line) or in the accent color (bars). */
  highlight?: number | null;
  /** Indexes drawn in the second series color, such as months after a counting change. */
  muted?: (index: number) => boolean;
  label: string;
}

const WIDTH = 120;
const HEIGHT = 36;

/** A tiny trend graphic for stat tiles. The tile text carries the numbers, so this stays decorative to readers. */
export function Sparkline({ values, variant = "line", highlight = null, muted, label }: SparklineProps) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) {
    return null;
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const step = WIDTH / Math.max(values.length - 1, 1);
  const y = (value: number) => HEIGHT - 3 - ((value - min) / span) * (HEIGHT - 8);

  if (variant === "bars") {
    const width = WIDTH / values.length;
    return (
      <svg aria-label={label} className="sparkline" preserveAspectRatio="none" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {values.map((value, index) =>
          value === null ? null : (
            <rect
              className={index === highlight ? "spark-bar active" : muted?.(index) ? "spark-bar muted" : "spark-bar"}
              height={Math.max(HEIGHT - y(value) - 1, 2)}
              key={index}
              rx={1.2}
              width={Math.max(width - 1.6, 1)}
              x={index * width + 0.8}
              y={y(value)}
            />
          ),
        )}
      </svg>
    );
  }

  // Gaps split the line instead of being bridged.
  const segments: string[] = [];
  let current = "";
  values.forEach((value, index) => {
    if (value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${(index * step).toFixed(2)},${y(value).toFixed(2)}`;
  });
  if (current) segments.push(current);
  const line = segments.join("");
  const firstIndex = values.findIndex((value) => value !== null);
  const lastIndex = values.length - 1 - [...values].reverse().findIndex((value) => value !== null);
  const area = `${line}L${(lastIndex * step).toFixed(2)},${HEIGHT}L${(firstIndex * step).toFixed(2)},${HEIGHT}Z`;
  const marker = highlight !== null ? values[highlight] : null;

  return (
    <span className="sparkline-wrap">
      <svg aria-label={label} className="sparkline" preserveAspectRatio="none" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {segments.length === 1 ? <path className="spark-area" d={area} /> : null}
        <path className="spark-line" d={line} />
      </svg>
      {/* The marker is HTML so it stays round while the line stretches with the tile. */}
      {marker !== null && marker !== undefined && highlight !== null ? (
        <span
          aria-hidden="true"
          className="spark-dot"
          style={{ left: `${((highlight * step) / WIDTH) * 100}%`, top: `${(y(marker) / HEIGHT) * 100}%` }}
        />
      ) : null}
    </span>
  );
}
