import type { Metadata } from "next";
import Link from "next/link";
import { Home } from "lucide-react";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BarraUsuario } from "@/components/barra-usuario";

// Fuente del tema "Verde terreno": Inter para toda la app.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Se conserva la mono para las utilidades `font-mono` que ya usa el proyecto.
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
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-lg font-semibold tracking-tight"
              >
                ERP Solares
              </Link>
              <Link
                href="/"
                className="border-primary/20 bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                Inicio
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground hidden text-sm md:inline">
                OASIS DE MACHIN · Carlitos Inmobiliaria
              </span>
              <BarraUsuario />
            </div>
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
