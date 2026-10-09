import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';

import '../../../src/app/globals.css';

export const metadata: Metadata = {
  description: '沉浸式大纲笔记与结构化个人知识库。',
  title: 'STILL',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
