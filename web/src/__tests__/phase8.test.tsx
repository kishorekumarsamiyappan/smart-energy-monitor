import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import AlertsPage from '@/app/alerts/page';
import ProfilePage from '@/app/profile/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile',
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

describe('Phase 8 Alerts, Theme Switching & Profile', () => {
  it('renders alerts, electrical safety notice, acknowledges alert, and adds rule', async () => {
    renderDemo(<AlertsPage />);
    expect(await screen.findByText(/Advisory Monitoring Only/i)).toBeInTheDocument();

    const ackButtons = screen.getAllByRole('button', { name: /Acknowledge/i });
    fireEvent.click(ackButtons[0]);
    expect(await screen.findByText('ACKNOWLEDGED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Alert Rule/i }));
    expect(await screen.findByText(/Saved high power rule/i)).toBeInTheDocument();
  });

  it('toggles Light/Dark theme and opens Privacy Policy on Profile page', async () => {
    renderDemo(<ProfilePage />);
    expect(await screen.findByText(/App : V1.0.0/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Theme Mode/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('sem_theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: /Privacy Policy/i }));
    expect(screen.getByText(/Row Level Security/i)).toBeInTheDocument();
  });
});
