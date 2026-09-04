import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useLanguage, useT } from "../i18n";

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartSpec {
  type: "line" | "bar";
  title: string;
  xLabel: string;
  yLabel: string;
  labels: string[];
  series: ChartSeries[];
}

const maxPoints = 100;
const maxSeries = 6;
const seriesColorClasses = [
  "text-viz-series-1",
  "text-viz-series-2",
  "text-viz-series-3",
  "text-viz-series-4",
  "text-viz-series-5",
  "text-viz-series-6",
] as const;

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximum ? trimmed : null;
}

export function parseChartSpec(source: string): ChartSpec | null {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  const { type } = input;
  const title = text(input.title, 120);
  const xLabel = text(input.xLabel, 80);
  const yLabel = text(input.yLabel, 80);
  if (
    (type !== "line" && type !== "bar") ||
    !title ||
    !xLabel ||
    yLabel == null ||
    yLabel === ""
  ) {
    return null;
  }
  if (
    !Array.isArray(input.labels) ||
    input.labels.length === 0 ||
    input.labels.length > maxPoints
  ) {
    return null;
  }
  const labels = input.labels.map((label) => text(label, 80));
  if (labels.some((label) => label === null)) {
    return null;
  }
  if (
    !Array.isArray(input.series) ||
    input.series.length === 0 ||
    input.series.length > maxSeries
  ) {
    return null;
  }
  const series: ChartSeries[] = [];
  for (const candidate of input.series) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return null;
    }
    const item = candidate as Record<string, unknown>;
    const name = text(item.name, 80);
    if (
      !name ||
      !Array.isArray(item.values) ||
      item.values.length !== labels.length
    ) {
      return null;
    }
    const values = item.values.map(Number);
    if (values.some((number) => !Number.isFinite(number))) {
      return null;
    }
    series.push({ name, values });
  }
  return {
    labels: labels as string[],
    series,
    title,
    type,
    xLabel,
    yLabel,
  };
}

function compactLabel(value: string): string {
  return value.length > 13 ? `${value.slice(0, 12)}…` : value;
}

function paddedDomain(
  spec: ChartSpec,
  visible: readonly number[]
): [number, number] {
  const values = visible.flatMap((index) => spec.series[index]?.values ?? []);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (spec.type === "bar") {
    const low = Math.min(0, minimum);
    const high = Math.max(0, maximum);
    return low === high ? [low - 1, high + 1] : [low, high];
  }
  const span = maximum - minimum;
  const pad = span === 0 ? Math.max(Math.abs(maximum) * 0.08, 1) : span * 0.08;
  return [minimum - pad, maximum + pad];
}

export function ChartBlock({ spec }: { readonly spec: ChartSpec }) {
  const t = useT();
  const { locale } = useLanguage();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(680);
  const [visible, setVisible] = useState(() => spec.series.map(() => true));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const measure = () =>
      setWidth(
        Math.max(320, Math.round(root.getBoundingClientRect().width || 680))
      );
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setVisible(spec.series.map(() => true)), [spec]);

  const visibleIndexes = visible.flatMap((shown, index) =>
    shown ? [index] : []
  );
  const effectiveIndexes = visibleIndexes.length > 0 ? visibleIndexes : [0];
  const [domainMin, domainMax] = paddedDomain(spec, effectiveIndexes);
  const isNarrow = width < 480;
  const height = isNarrow ? 250 : 280;
  const margin = { bottom: 58, left: isNarrow ? 58 : 68, right: 14, top: 18 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const y = (value: number) =>
    margin.top + ((domainMax - value) / (domainMax - domainMin)) * plotHeight;
  const x = (index: number) =>
    margin.left + ((index + 0.5) / spec.labels.length) * plotWidth;
  const tickCount = 5;
  const yTicks = Array.from(
    { length: tickCount },
    (_, index) =>
      domainMin + ((domainMax - domainMin) * index) / (tickCount - 1)
  );
  const xStep = Math.max(1, Math.ceil(spec.labels.length / (isNarrow ? 4 : 8)));
  const xTicks = spec.labels.flatMap((label, index) =>
    index % xStep === 0 || index === spec.labels.length - 1
      ? [{ index, label }]
      : []
  );
  const barBand = (plotWidth / spec.labels.length) * 0.72;
  const barWidth = Math.max(
    2,
    Math.min(34, barBand / Math.max(1, visibleIndexes.length))
  );
  const zeroY = y(Math.min(domainMax, Math.max(domainMin, 0)));
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });
  const summary = t("chart.summary", {
    points: spec.labels.length,
    series: spec.series.length,
    title: spec.title,
    type: t(spec.type === "line" ? "chart.type.line" : "chart.type.bar"),
  });

  return (
    <figure ref={rootRef} className="my-4 min-w-0" data-chart-block>
      <figcaption className="text-foreground mb-2 font-medium">
        {spec.title}
      </figcaption>
      {spec.series.length > 1 ? (
        <div
          className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1"
          aria-label={t("chart.series")}
        >
          {spec.series.map((series, index) => (
            <Button
              key={series.name}
              type="button"
              variant="ghost"
              size="compact"
              focusStyle="inset"
              aria-pressed={visible[index]}
              className={cn(
                "text-callout text-foreground flex items-center gap-1.5 disabled:opacity-50",
                visible[index] ? "opacity-100" : "opacity-50"
              )}
              onClick={() =>
                setVisible((current) =>
                  current.map((value, itemIndex) =>
                    itemIndex === index ? !value : value
                  )
                )
              }
            >
              <span
                className={cn(
                  "size-2 rounded-full bg-current",
                  seriesColorClasses[index]
                )}
                aria-hidden="true"
              />
              {series.name}
            </Button>
          ))}
        </div>
      ) : null}
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full overflow-visible"
      >
        <title>{spec.title}</title>
        <desc>{summary}</desc>
        <rect
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          fill="none"
          className="stroke-border"
          strokeWidth="1"
          data-chart-frame
        />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth="1"
              opacity="0.55"
            />
            <text
              x={margin.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-callout"
            >
              {numberFormatter.format(tick)}
            </text>
          </g>
        ))}
        {xTicks.map(({ label, index }) => (
          <text
            key={`${label}-${index}`}
            x={x(index)}
            y={margin.top + plotHeight + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-callout"
          >
            {compactLabel(label)}
          </text>
        ))}
        <text
          data-axis="x"
          className="axis-title fill-foreground text-callout"
          x={margin.left + plotWidth / 2}
          y={height - 8}
          textAnchor="middle"
        >
          {spec.xLabel}
        </text>
        <text
          data-axis="y"
          className="axis-title fill-foreground text-callout"
          transform={`translate(14 ${margin.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {spec.yLabel}
        </text>

        {spec.type === "line"
          ? spec.series.map((series, seriesIndex) => {
              if (!visible[seriesIndex]) {
                return null;
              }
              const path = series.values
                .map(
                  (value, index) =>
                    `${index === 0 ? "M" : "L"}${x(index)},${y(value)}`
                )
                .join(" ");
              return (
                <g
                  key={series.name}
                  className={seriesColorClasses[seriesIndex]}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  {series.values.map((value, index) => (
                    <circle
                      key={index}
                      cx={x(index)}
                      cy={y(value)}
                      r="3"
                      fill="currentColor"
                    >
                      <title>{`${series.name}, ${spec.labels[index]}: ${numberFormatter.format(value)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })
          : spec.series.map((series, seriesIndex) => {
              const visiblePosition = visibleIndexes.indexOf(seriesIndex);
              if (visiblePosition === -1) {
                return null;
              }
              return (
                <g
                  key={series.name}
                  className={seriesColorClasses[seriesIndex]}
                  fill="currentColor"
                >
                  {series.values.map((value, index) => {
                    const valueY = y(value);
                    const left =
                      x(index) -
                      (barWidth * visibleIndexes.length) / 2 +
                      visiblePosition * barWidth;
                    const top = Math.min(valueY, zeroY);
                    const barHeight = Math.max(1, Math.abs(zeroY - valueY));
                    return (
                      <rect
                        key={index}
                        x={left}
                        y={top}
                        width={barWidth - 1}
                        height={barHeight}
                      >
                        <title>{`${series.name}, ${spec.labels[index]}: ${numberFormatter.format(value)}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
      </svg>
    </figure>
  );
}
