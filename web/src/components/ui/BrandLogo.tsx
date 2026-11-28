import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export function BrandLogo({ variant = 'light', compact = false }: BrandLogoProps) {
  const fg = variant === 'light' ? '#FFFFFF' : 'var(--sem-primary)';
  const accent = '#F58220';
  const pulse = '#1B9E4B';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width="38"
        height="38"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="semShieldGrad" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1B256B" />
            <stop offset="100%" stopColor="#4054B2" />
          </linearGradient>
        </defs>
        <path
          d="M12 3H28L37 12V28L28 37H12L3 28V12L12 3Z"
          fill={variant === 'light' ? 'rgba(255,255,255,0.14)' : 'url(#semShieldGrad)'}
          stroke={fg}
          strokeWidth="2.2"
        />
        <path
          d="M7 22H13L16 14L20.5 27L24 18L27 22H33"
          stroke={accent}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="31.5" cy="9.5" r="2.6" fill={pulse} stroke="#FFFFFF" strokeWidth="1" />
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
