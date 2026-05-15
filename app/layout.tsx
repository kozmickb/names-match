import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/components/user-provider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Names Match",
  description: "Swipe baby names together until you both like one.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Names Match", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fef3c7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-amber-50 text-stone-900 flex flex-col">
        <UserProvider>
          {children}
        </UserProvider>
        <Toaster position="top-center" richColors closeButton={false} />
      </body>
    </html>
  );
}
