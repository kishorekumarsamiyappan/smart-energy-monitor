'use client';

import React from 'react';

export function StatusBadge({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  label: string;
}) {
  const palette: Record<typeof tone, { bg: string; color: string; dot: string }> = {
    success: { bg: 'rgba(27, 158, 75, 0.14)', color: 'var(--sem-success)', dot: 'var(--sem-success)' },
    warning: { bg: 'rgba(245, 130, 32, 0.15)', color: 'var(--sem-warning)', dot: 'var(--sem-warning)' },
    error: { bg: 'rgba(217, 48, 37, 0.14)', color: 'var(--sem-error)', dot: 'var(--sem-error)' },
    info: { bg: 'var(--sem-lavender)', color: 'var(--sem-primary)', dot: 'var(--sem-secondary)' },
    neutral: { bg: 'rgba(170, 178, 181, 0.2)', color: 'var(--sem-muted)', dot: 'var(--sem-muted)' },
  };
  const style = palette[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        backgroundColor: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: style.dot,
        }}
      />
      {label}
    </span>
  );
}

/**
 * Semi-circular arc gauge matching the orange gauge widget in the AVR reference screenshots.
 */
export function PowerGaugeArc({
  value,
  max = 7000,
  unit = 'W',
  label = 'Active Load',
  color = '#F58220',
}: {
  value: number;
  max?: number;
  unit?: string;
  label?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const angle = -180 + clamped * 180; // -180 (left) to 0 (right)
  const rad = (angle * Math.PI) / 180;
  const cx = 42;
  const cy = 40;
  const r = 28;
  const needleX = cx + (r - 6) * Math.cos(rad);
  const needleY = cy + (r - 6) * Math.sin(rad);

  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width="84" height="48" viewBox="0 0 84 48" aria-label={`${label}: ${value} ${unit}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--sem-border)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="var(--sem-text)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="3.2" fill="var(--sem-card)" stroke="var(--sem-text)" strokeWidth="2" />
      </svg>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sem-muted)' }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sem-text)' }}>
          {value.toLocaleString('en-IN')} {unit}
        </div>
      </div>
    </div>
  );
}

export function SegmentedPillTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: 4,
        borderRadius: 12,
        backgroundColor: 'var(--sem-lavender)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              flex: '1 1 auto',
              padding: '8px 12px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: isActive ? '#29378F' : 'transparent',
              color: isActive ? '#FFFFFF' : 'var(--sem-primary)',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
