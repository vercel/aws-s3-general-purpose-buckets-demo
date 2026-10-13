import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reelfind — S3 Movie Poster Search",
  description: "Search the TMDB 5000 movie collection, indexed in Amazon S3."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
