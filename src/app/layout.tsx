import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Share My UL — Unused UL Ticket Sharing',
  description: 'Personal UL ticket sharing for students in our WhatsApp group. Check availability and request a share.',
  keywords: 'UL ticket, Uppsala, student, ticket sharing',
  openGraph: {
    title: 'Share My UL',
    description: 'Sharing my unused UL ticket with students in our group.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-neutral-50 text-neutral-900 antialiased min-h-screen" suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
