import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANTES — Inteligencia anticipatoria",
  description:
    "N3uralia ANTES convierte señales tempranas en tiempo para actuar antes del impacto.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
