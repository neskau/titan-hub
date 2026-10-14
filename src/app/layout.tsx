import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Titan Distribuidora Solar",
  description: "Portal do integrador e gestão comercial da Titan Distribuidora Solar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
