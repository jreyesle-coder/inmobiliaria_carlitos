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
  title: "ERP Solares — Carlitos Inmobiliaria",
  description:
    "Administración y venta de solares del proyecto OASIS DE MACHIN.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-DO"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between px-6 py-4">
            <span className="text-lg font-semibold tracking-tight">
              ERP Solares
            </span>
            <span className="text-muted-foreground text-sm">
              OASIS DE MACHIN · Carlitos Inmobiliaria
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
          {children}
        </main>
        <footer className="text-muted-foreground border-t px-6 py-4 text-center text-xs">
          Uso interno · Montos en pesos dominicanos (RD$)
        </footer>
      </body>
    </html>
  );
}
