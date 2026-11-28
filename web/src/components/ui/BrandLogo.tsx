import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export function BrandLogo({ variant = 'light', compact = false }: BrandLogoProps) {
  const fg = variant === 'light' ? '#FFFFFF' : 'var(--sem-primary)';
  const size = compact ? 34 : 40;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{
          borderRadius: compact ? 9 : 11,
          boxShadow: '0 2px 8px rgba(245, 130, 32, 0.22)',
          flexShrink: 0,
        }}
      >
        <defs>
          <linearGradient id="semApkCrestGrad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#29378F" />
            <stop offset="100%" stopColor="#4054B2" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="16"
          fill="url(#semApkCrestGrad)"
          stroke="#F58220"
          strokeWidth="2.8"
        />
        <circle cx="32" cy="32" r="21.76" stroke="rgba(255,255,255,0.28)" strokeWidth="2.2" />
        <path d="M35.84 15.36L23.04 33.28H32.64L28.16 48.64L41.6 30.72H31.36Z" fill="#F58220" />
      </svg>
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.08 }}>
          <span
            style={{
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: '0.1em',
              color: fg,
            }}
          >
            SEM
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 9.5,
              letterSpacing: '0.14em',
              color: variant === 'light' ? 'rgba(255,255,255,0.82)' : 'var(--sem-secondary)',
            }}
          >
            ENERGY MONITOR
          </span>
        </div>
      )}
    </div>
  );
}
