import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-family-body',
});

export const metadata: Metadata = {
  title: 'Bulk Domain Checker & Domain Name Generator | Find Available Domains Fast',
  description: 'Check domain availability in bulk, generate domain name ideas, and review available or taken domains for your next website, startup, or brand.',
  keywords: ['bulk domain checker', 'domain name generator', 'domain availability checker', 'available domain names', 'domain ideas', 'Sameer Khanal'],
  openGraph: {
    title: 'Bulk Domain Checker & Domain Name Generator | Find Available Domains Fast',
    description: 'Check domain availability in bulk and generate domain name ideas for your next brand or website.',
    url: 'https://bulkdomainchecker.vercel.app',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bulk Domain Checker & Domain Name Generator | Find Available Domains Fast',
    description: 'Check domain availability in bulk and generate domain name ideas for your next brand or website.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
