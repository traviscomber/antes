import type { Metadata } from "next";
import "./globals.css";

const canonicalUrl = "https://www.antemano.app";

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  title: "ANTEMANO — Inteligencia anticipatoria",
  description:
    "N3uralia ANTEMANO convierte señales tempranas en tiempo para actuar antes del impacto.",
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: "ANTEMANO — Inteligencia anticipatoria",
    description:
      "N3uralia ANTEMANO convierte señales tempranas en tiempo para actuar antes del impacto.",
    url: canonicalUrl,
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
