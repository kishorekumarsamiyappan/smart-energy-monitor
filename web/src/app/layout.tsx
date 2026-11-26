import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';

export const metadata: Metadata = {
  title: 'Smart Energy Monitor — Single-Phase IoT & TNEB Billing',
  description:
    'Real-time single-phase electricity monitor with ESP32-S3, ADS131M02, MQTT TLS, and TNEB LT-IA billing estimator.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AuthProvider>
            <DataProvider>{children}</DataProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
