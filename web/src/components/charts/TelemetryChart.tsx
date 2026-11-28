'use client';

import React, { useMemo, useState } from 'react';
import { formatKolkataTime } from '@sem/shared';

export interface ChartSeriesConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  data: Array<{ timestamp: string; value: number }>;
}

export function TelemetryChart({
  series,
  showMinMax = true,
  height = 290,
}: {
  series: ChartSeriesConfig[];
  showMinMax?: boolean;
  height?: number;
}) {
  const baseLength = series[0]?.data.length ?? 0;
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(100);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const slicedSeries = useMemo(() => {
    if (baseLength === 0) return series;
    const startIdx = Math.min(
      baseLength - 1,
      Math.max(0, Math.floor((rangeStart / 100) * (baseLength - 1))),
    );
    const endIdx = Math.max(
      startIdx + 1,
      Math.min(baseLength, Math.ceil((rangeEnd / 100) * baseLength)),
    );
    return series.map((s) => ({
      ...s,
      data: s.data.slice(startIdx, endIdx),
    }));
  }, [baseLength, rangeEnd, rangeStart, series]);

  const activeLen = slicedSeries[0]?.data.length ?? 0;

  // Compute global min/max across visible series
  const { minY, maxY } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const s of slicedSeries) {
      for (const pt of s.data) {
        mn = Math.min(mn, pt.value);
        mx = Math.max(mx, pt.value);
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return { minY: 0, maxY: 100 };
    if (mn === mx) return { minY: Math.max(0, mn - 5), maxY: mx + 5 };
    const pad = (mx - mn) * 0.14;
    return { minY: Math.max(0, mn - pad), maxY: mx + pad };
  }, [slicedSeries]);

  if (baseLength === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--sem-border)',
          borderRadius: 12,
          color: 'var(--sem-muted)',
          fontSize: 14,
        }}
      >
        No database telemetry readings found for the selected time window.
      </div>
    );
  }

  const width = 760;
  const padLeft = 54;
  const padRight = 22;
  const padTop = 32;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (idx: number, len: number) =>
    len <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (len - 1)) * plotW;
  const toY = (v: number) =>
    padTop + plotH - ((v - minY) / Math.max(1e-6, maxY - minY)) * plotH;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minY + ((maxY - minY) * i) / yTicks;
    return Math.round(val * 100) / 100;
  });

  const xTickIndices =
    activeLen <= 4
      ? Array.from({ length: activeLen }, (_, i) => i)
      : [0, Math.floor(activeLen * 0.33), Math.floor(activeLen * 0.66), activeLen - 1];

  const primaryUnit = slicedSeries[0]?.unit || '';
  const clampedHoverIdx = hoverIdx !== null && hoverIdx < activeLen ? hoverIdx : null;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', minWidth: 320 }}
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const norm = (relX - padLeft) / plotW;
            const idx = Math.round(norm * (activeLen - 1));
            if (idx >= 0 && idx < activeLen) setHoverIdx(idx);
          }}
        >
          {/* Unit Header */}
          <text x={14} y={18} fontSize="12" fontWeight="700" fill="var(--sem-muted)">
            ({primaryUnit})
          </text>

          {/* Horizontal Gridlines & Y Labels */}
          {yTickValues.map((val, idx) => {
            const y = toY(val);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="var(--sem-border)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--sem-muted)"
                >
                  {val >= 100 ? Math.round(val) : val}
                </text>
              </g>
            );
          })}

          {/* X Axis Ticks */}
          {xTickIndices.map((idx) => {
            const pt = slicedSeries[0].data[idx];
            if (!pt) return null;
            const x = toX(idx, activeLen);
            const tStr = formatKolkataTime(pt.timestamp);
            const parts = tStr.split(' ');
            return (
              <g key={idx}>
                <text x={x} y={height - 20} textAnchor="middle" fontSize="11" fill="var(--sem-muted)">
                  {parts[0]?.slice(0, 5)}
                </text>
                <text x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--sem-muted)">
                  {parts[1] || ''}
                </text>
              </g>
            );
          })}

          {/* Series Polylines & Min/Max Callouts */}
          {slicedSeries.map((s) => {
            if (s.data.length === 0) return null;
            const pathD = s.data
              .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, s.data.length).toFixed(1)} ${toY(pt.value).toFixed(1)}`)
              .join(' ');

            let minIdx = 0;
            let maxIdx = 0;
            for (let i = 1; i < s.data.length; i++) {
              if (s.data[i].value < s.data[minIdx].value) minIdx = i;
              if (s.data[i].value > s.data[maxIdx].value) maxIdx = i;
            }

            return (
              <g key={s.key}>
                <path d={pathD} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
                {showMinMax && s.data.length > 2 && (
                  <>
                    <circle
                      cx={toX(minIdx, s.data.length)}
                      cy={toY(s.data[minIdx].value)}
                      r="5"
                      fill="#F58220"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                    <text
                      x={toX(minIdx, s.data.length)}
                      y={Math.max(16, toY(s.data[minIdx].value) - 10)}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--sem-text)"
                    >
                      {s.data[minIdx].value} {s.unit}
                    </text>

                    <circle
                      cx={toX(maxIdx, s.data.length)}
                      cy={toY(s.data[maxIdx].value)}
                      r="5"
                      fill="var(--sem-primary)"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                    <text
                      x={toX(maxIdx, s.data.length)}
                      y={Math.max(16, toY(s.data[maxIdx].value) - 10)}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--sem-text)"
                    >
                      {s.data[maxIdx].value} {s.unit}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Crosshair Hover Line & Tooltip Box */}
          {clampedHoverIdx !== null && slicedSeries[0]?.data[clampedHoverIdx] && (
            <g>
              <line
                x1={toX(clampedHoverIdx, activeLen)}
                y1={padTop}
                x2={toX(clampedHoverIdx, activeLen)}
                y2={height - padBottom}
                stroke="var(--sem-divider)"
                strokeDasharray="4 3"
              />
              {(() => {
                const boxX = Math.min(width - 205, Math.max(padLeft + 6, toX(clampedHoverIdx, activeLen) - 95));
                const boxH = 26 + slicedSeries.length * 18;
                return (
                  <g transform={`translate(${boxX}, ${padTop + 4})`}>
                    <rect
                      width="196"
                      height={boxH}
                      rx="8"
                      fill="var(--sem-card)"
                      stroke="var(--sem-border)"
                    />
                    <text x="10" y="18" fontSize="11" fontWeight="700" fill="var(--sem-text)">
                      Time: {formatKolkataTime(slicedSeries[0].data[clampedHoverIdx].timestamp)}
                    </text>
                    {slicedSeries.map((s, si) => (
                      <g key={s.key} transform={`translate(10, ${34 + si * 18})`}>
                        <circle cx="4" cy="-4" r="4" fill={s.color} />
                        <text x="14" y="0" fontSize="11" fill="var(--sem-text)">
                          {s.label}: {s.data[clampedHoverIdx]?.value ?? '-'} {s.unit}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      {/* Time-Range Scrubber Slider matching AVR screenshot bottom slider */}
      <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--sem-surface)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sem-muted)', minWidth: 74 }}>
            {formatKolkataTime(slicedSeries[0]?.data[0]?.timestamp || '')}
          </span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              type="range"
              aria-label="Range start"
              min={0}
              max={Math.max(0, rangeEnd - 10)}
              value={rangeStart}
              onChange={(e) => setRangeStart(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--sem-secondary)' }}
            />
            <input
              type="range"
              aria-label="Range end"
              min={Math.min(100, rangeStart + 10)}
              max={100}
              value={rangeEnd}
              onChange={(e) => setRangeEnd(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--sem-primary)' }}
            />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sem-muted)', minWidth: 74, textAlign: 'right' }}>
            {formatKolkataTime(slicedSeries[0]?.data[activeLen - 1]?.timestamp || '')}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginTop: 12 }}>
        {slicedSeries.map((s) => (
          <div key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
            <span style={{ color: 'var(--sem-muted)', fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
        {showMinMax && (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F58220' }} />
              <span style={{ color: 'var(--sem-muted)', fontWeight: 600 }}>Min</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--sem-primary)' }} />
              <span style={{ color: 'var(--sem-muted)', fontWeight: 600 }}>Max</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
