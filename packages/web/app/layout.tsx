import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PAINRADAR',
  description: 'Pipeline status and cluster explorer',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="h">
          <a href="/" className="brand">
            PAINRADAR
          </a>
          <nav>
            <a href="/">Dashboard</a>
            <a href="/clusters">Clusters</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
