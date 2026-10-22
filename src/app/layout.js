import { Roboto } from 'next/font/google';
import Providers from './providers';
import './globals.css';

// Same typeface as the FitShield website.
const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-roboto',
  display: 'swap',
});

export const metadata = {
  title: 'Fitshield Asset Management',
  description: 'Manage company assets and employees',
  // Served from public/ so the URL has no cache-busting query string (app/icon.svg would add one).
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
