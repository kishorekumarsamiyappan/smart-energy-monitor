import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import EnergyHistoryPage from '@/app/history/page';
import { buildCsvFromTelemetry } from '@/lib/export-utils';
import { generateDemoTelemetrySeries } from '@sem/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/history',
}));

describe('Phase 5 Energy History & Report Exports', () => {
  it('renders 6 metric tabs, date filters, stats strip, and switches metric tab', async () => {
    window.localStorage.setItem('sem_demo_mode', 'true');
    render(
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <EnergyHistoryPage />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByRole('tab', { name: 'Voltage' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Current' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active Power' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Energy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Power Factor' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Frequency' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Frequency' }));
    expect(screen.getByRole('tab', { name: 'Frequency' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Total Consumption/i)).toBeInTheDocument();
  });

  it('builds CSV export with Asia/Kolkata timestamps and physical unit headers', () => {
    const pts = generateDemoTelemetrySeries('DEMO-SEM-001', 1);
    const csv = buildCsvFromTelemetry('DEMO-SEM-001', pts);
    expect(csv).toContain('Timestamp (Asia/Kolkata)');
    expect(csv).toContain('Voltage (V)');
    expect(csv).toContain('Energy (kWh)');
    expect(csv).toContain('DEMO-SEM-001');
  });
});
