import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://antemano.app"),
  title: "ANTEMANO — Inteligencia anticipatoria",
  description:
    "N3uralia ANTEMANO convierte señales tempranas en tiempo para actuar antes del impacto.",
  alternates: {
    canonical: "https://antemano.app",
  },
  openGraph: {
    title: "ANTEMANO — Inteligencia anticipatoria",
    description:
      "N3uralia ANTEMANO convierte señales tempranas en tiempo para actuar antes del impacto.",
    url: "https://antemano.app",
    siteName: "ANTEMANO",
    locale: "es_CL",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
