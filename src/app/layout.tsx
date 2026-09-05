import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "AQUA VISION · See what the seafloor hides",
  description:
    "Aqua Vision reads side-scan sonar the way an operator would: ghost gear, wrecks, and man-made debris, then pins each contact for cleanup.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${instrument.variable} h-full antialiased`}
    >
        <body className="min-h-full flex flex-col bg-[#eef1f6] text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
