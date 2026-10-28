import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
export const metadata: Metadata = { title: 'VSTMailer · Your email, under your control', description: 'The independent email platform by Velion Smart Technologies.' };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}><body>{children}</body></html>; }
