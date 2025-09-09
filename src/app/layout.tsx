import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ticketmatch",
  description: "Trade tickets with data and automation - An mbamove company",
  openGraph: {
    title: 'Ticketmatch',
    description: 'Trade tickets with data and automation - An mbamove company',
    images: [
      { url: '/ticketmatch-banner.png' },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ticketmatch',
    description: 'Trade tickets with data and automation - An mbamove company',
    images: ['/ticketmatch-banner.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/ticketmatch-banner.png', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
