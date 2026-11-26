import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import BillingPage from '@/app/billing/page';
import ManualReadingPage from '@/app/manual-reading/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/billing',
}));

function renderDemo(ui: React.ReactElement) {
  window.localStorage.setItem('sem_demo_mode', 'true');
  return render(
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>{ui}</DataProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('Phase 6 Web TNEB Billing & Manual Meter Reading', () => {
  it('renders TNEB LT-IA billing estimator, slab breakdown, and billing history cards', async () => {
    renderDemo(<BillingPage />);
    expect(await screen.findByText(/TNEB \/ TNPDCL LT-IA Billing/i)).toBeInTheDocument();
    expect(screen.getByText(/Slab-by-Slab Calculation/i)).toBeInTheDocument();
    expect(screen.getByText(/Billing History/i)).toBeInTheDocument();
    expect(screen.getByText(/Advisory Estimate Only/i)).toBeInTheDocument();
  });

  it('detects manual vs ESP32 discrepancy and preserves both records on save', async () => {
    renderDemo(<ManualReadingPage />);
    expect(await screen.findByText(/Manual EB Meter Reading/i)).toBeInTheDocument();

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1000' } });
    fireEvent.change(inputs[1], { target: { value: '1500' } });

    expect(screen.getAllByText(/500 kWh/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Readings disagree/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Manual Reading/i }));
    expect(await screen.findByText(/Both manual and ESP32 records preserved/i)).toBeInTheDocument();
  });
});
