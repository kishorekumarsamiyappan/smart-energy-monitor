import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import DashboardPage from '@/app/dashboard/page';
import MonitoringPage from '@/app/monitoring/page';
import DevicesPage from '@/app/devices/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useParams: () => ({ deviceId: 'DEMO-SEM-001' }),
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

describe('Phase 2 Web Dashboard, Monitoring & Devices', () => {
  it('renders live device cards on dashboard and filters by search', async () => {
    renderDemo(<DashboardPage />);
    expect(await screen.findByText(/Main Home DB \(Demo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/First Floor AC Sub-Meter \(Demo\)/i)).toBeInTheDocument();

    const search = screen.getByLabelText(/Search devices/i);
    fireEvent.change(search, { target: { value: 'DEMO-SEM-002' } });
    expect(screen.queryByText(/Main Home DB \(Demo\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/First Floor AC Sub-Meter \(Demo\)/i)).toBeInTheDocument();
  });

  it('renders monitoring measurement cards and interactive Min/Max chart', async () => {
    renderDemo(<MonitoringPage />);
    expect(await screen.findByText(/Electrical Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Line Voltage/i)).toBeInTheDocument();
    expect(screen.getByText(/Power Quality/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Range start/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Min \/ Max/i })).toBeInTheDocument();
  });

  it('lists devices and allows renaming in Demo Mode', async () => {
    renderDemo(<DevicesPage />);
    expect(await screen.findByText(/My Energy Devices/i)).toBeInTheDocument();
    const renameButtons = screen.getAllByRole('button', { name: /Rename/i });
    fireEvent.click(renameButtons[0]);
    const input = screen.getByLabelText(/New device name/i);
    fireEvent.change(input, { target: { value: 'Renamed Main DB' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(await screen.findByText(/Renamed Main DB/i)).toBeInTheDocument();
  });
});
