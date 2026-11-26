import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import DashboardPage from '@/app/dashboard/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
}));

describe('Phase 9 Responsive Desktop & Mobile Navigation + Multi-Device Isolation', () => {
  it('renders both desktop sidebar navigation and mobile bottom navigation landmarks', async () => {
    window.localStorage.setItem('sem_demo_mode', 'true');
    render(
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <DashboardPage />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByRole('navigation', { name: /Main Navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Mobile Navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add new energy device/i })).toBeInTheDocument();
  });
});
