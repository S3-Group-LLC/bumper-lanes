import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Project",
  description: "Built with Bumper Lanes by S3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-black/10 bg-white">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-bold">
              My Project
            </Link>
            <Link href="/status" className="text-sm text-accent underline-offset-4 hover:underline">
              Status
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-grow px-4 py-10">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-black/50">
          Built with{" "}
          <a href="https://hellos3.com/bumper-lanes" className="underline">
            Bumper Lanes by S3
          </a>
        </footer>
      </body>
    </html>
  );
}
