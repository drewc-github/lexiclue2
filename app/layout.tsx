import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lexiclues.com"),
  title: "LexiClue",
  description: "Daily word game",
  openGraph: {
    title: "LexiClue",
    description: "Daily word game",
    url: "https://lexiclues.com",
    siteName: "LexiClue",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LexiClue daily word game",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LexiClue",
    description: "Daily word game",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}