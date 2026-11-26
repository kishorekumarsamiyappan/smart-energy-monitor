import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export function BrandLogo({ variant = 'light', compact = false }: BrandLogoProps) {
  const fg = variant === 'light' ? '#FFFFFF' : '#29378F';
  const accent = variant === 'light' ? '#F58220' : '#4054B2';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width="36"
        height="36"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="10"
          stroke={fg}
          strokeWidth="2.5"
          fill={variant === 'light' ? 'rgba(255,255,255,0.12)' : '#E9EAF8'}
        />
        <path
          d="M22.5 8L12.5 21.5H20L17.5 32L27.5 18.5H20L22.5 8Z"
          fill={accent}
          stroke={fg}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: '0.02em',
              color: fg,
            }}
          >
            SMART ENERGY
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: '0.14em',
              color: variant === 'light' ? 'rgba(255,255,255,0.82)' : '#4054B2',
            }}
          >
            MONITOR • TNEB
          </span>
        </div>
      )}
    </div>
  );
}
