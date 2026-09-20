import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Direct Shipper — who actually ships the freight you haul",
  description: "Connect your inbox. Direct Shipper reads every rate con, shows you what you really haul, and finds the shippers you can win direct.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
