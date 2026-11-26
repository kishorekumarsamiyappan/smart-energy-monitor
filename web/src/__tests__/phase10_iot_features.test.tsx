import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import DashboardPage from '@/app/dashboard/page';
import DeviceRelaysPage from '@/app/devices/[deviceId]/relays/page';
import DeviceSettingsPage from '@/app/devices/[deviceId]/settings/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/devices/DEMO-SEM-001/relays',
  useParams: () => ({ deviceId: 'DEMO-SEM-001' }),
}));

function renderWithProviders(node: React.ReactNode) {
  window.localStorage.setItem('sem_demo_mode', 'true');
  return render(
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>{node}</DataProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('Phase 10 Web IoT Controls: FOTA, Multi-Relay Offline Schedules, and LEDs', () => {
  it('renders GitHub FOTA badge and primary Relay CH1 controls on Dashboard', async () => {
    renderWithProviders(<DashboardPage />);
    const badges = await screen.findAllByText(/Update v1\.3\.0 Ready/i);
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Relay CH1:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Relays/i }).length).toBeGreaterThan(0);
  });

  it('supports confirmed Relay CH1, reserved GPIO validation, adding CH2, and offline IST schedules', async () => {
    renderWithProviders(<DeviceRelaysPage />);
    expect(await screen.findByText(/CONFIRMED DEFAULT RELAY/i)).toBeInTheDocument();

    // Reject reserved SPI pin GPIO 12
    fireEvent.change(screen.getByLabelText(/Relay Name/i), { target: { value: 'Invalid Pin Load' } });
    fireEvent.change(screen.getByLabelText(/ESP32-S3 GPIO Pin/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Add New Relay/i }));
    expect(await screen.findByText(/reserved for ADS131M02 SPI/i)).toBeInTheDocument();

    // Add valid relay CH2 on GPIO 5 (CH1 is on GPIO 4)
    fireEvent.change(screen.getByLabelText(/Relay Name/i), { target: { value: 'Geyser Contactor' } });
    fireEvent.change(screen.getByLabelText(/ESP32-S3 GPIO Pin/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Add New Relay/i }));
    expect(await screen.findByText('Geyser Contactor')).toBeInTheDocument();
    expect(screen.getByText('CH2')).toBeInTheDocument();

    // Save offline schedule on CH1
    fireEvent.click(screen.getByRole('button', { name: /Save Offline Schedule/i }));
    expect(await screen.findByText(/Offline schedule saved and pushed to ESP32-S3 NVS/i)).toBeInTheDocument();
  });

  it('configures Status LED (Inbuilt RGB / Single GPIO), Consumption Pulse LED, and installs GitHub FOTA release', async () => {
    renderWithProviders(<DeviceSettingsPage />);

    // Open I/O Configuration tab
    fireEvent.click(await screen.findByRole('button', { name: /I\/O Configuration/i }));
    const ledSelect = await screen.findByLabelText(/Device Status LED Mode/i);
    fireEvent.change(ledSelect, { target: { value: 'single_gpio' } });
    fireEvent.change(screen.getByLabelText(/External Pulse GPIO Pin/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/Pulse Constant \(imp\/kWh\)/i), { target: { value: '1600' } });
    fireEvent.click(screen.getByRole('button', { name: /Save I\/O & LED Config/i }));
    expect(await screen.findByText(/Status LED, and Pulse LED configuration pushed/i)).toBeInTheDocument();

    // Open Firmware & GitHub FOTA tab and install release
    fireEvent.click(screen.getByRole('button', { name: /Firmware & GitHub FOTA/i }));
    const installBtn = await screen.findByRole('button', { name: /Install \/ Update Firmware/i });
    fireEvent.click(installBtn);
    expect(await screen.findByText(/UP TO DATE/i)).toBeInTheDocument();
    expect(screen.getAllByText(/v1\.3\.0/i).length).toBeGreaterThan(0);
  });
});
