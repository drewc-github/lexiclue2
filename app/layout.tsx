import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://lexiclues.com"),
  title: "Lexiclues – A Daily Vocabulary Game",
  description:
    "Learn five new words every day with Lexiclues, a quick daily vocabulary game featuring definitions, hints, and examples.",
  openGraph: {
    title: "Lexiclues – A Daily Vocabulary Game",
    description:
      "Learn five new words every day with Lexiclues, a quick daily vocabulary game featuring definitions, hints, and examples.",
    url: "https://lexiclues.com",
    siteName: "Lexiclues",
    images: [
      {
        url: "/lexiclues-share-image-v2.png",
        width: 1200,
        height: 630,
        alt: "LexiClue daily word game",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lexiclues – A Daily Vocabulary Game",
    description:
      "Learn five new words every day with Lexiclues, a quick daily vocabulary game featuring definitions, hints, and examples.",
    images: ["/lexiclues-share-image-v2.png"],
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
