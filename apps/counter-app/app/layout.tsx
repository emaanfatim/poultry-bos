import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "./providers/AuthProvider";
import { I18nProvider } from "./providers/I18nProvider";
import { TillProvider } from "./providers/TillProvider";
import { ThemeProvider, NO_FLASH_THEME_SCRIPT } from "./providers/ThemeProvider";
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
  title: "BOS Counter Portal",
  description: "Cashier portal for Business Operating System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BOS Counter",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the persisted theme before first paint to avoid a
            flash of the default light/green theme on reload. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-[var(--background)] text-[var(--foreground)] antialiased`}
      >
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <TillProvider>{children}</TillProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}