import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import LoginPage from '@/app/login/page';
import RegisterPage from '@/app/register/page';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
  usePathname: () => '/login',
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>{ui}</DataProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('Phase 1 Web Auth, Design System & Demo Mode', () => {
  it('renders login form with email/mobile, password toggle, forgot link, and Demo Mode trigger', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText(/Email or Mobile Number/i)).toBeInTheDocument();
    const pwdInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    expect(pwdInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /Show password/i }));
    expect(pwdInput.type).toBe('text');

    expect(screen.getByRole('link', { name: /Forgot password/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try Interactive Demo Mode/i }));
    expect(window.localStorage.getItem('sem_demo_mode')).toBe('true');
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('validates password mismatch and terms acceptance on registration', () => {
    renderWithProviders(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Kishorekumar' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'k@example.com' } });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Secret1234' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'Different123' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Passwords do not match/i);
  });
});
