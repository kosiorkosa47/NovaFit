import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";

import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import "@/app/globals.css";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"]
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ecfdf5" },
    { media: "(prefers-color-scheme: dark)", color: "#022c22" }
  ]
};

export const metadata: Metadata = {
  title: "Nova Health Agent",
  description:
    "Personalized multi-agent AI wellness coaching powered by Amazon Nova. Share how you feel via text or voice, and receive adaptive health plans.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nova Health"
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
      </head>
      <body className={`${font.variable} bg-background font-sans text-foreground antialiased`}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <DeepLinkHandler />
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
