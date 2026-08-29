import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { TooltipProvider } from '@/components/ui/tooltip';

import '../../../src/app/globals.css';

export const metadata: Metadata = {
  description: 'A local-first outliner built on Plate.',
  title: 'Local Tana',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
