import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Extension Usage Tracker",
  description: "Dodo-backed credit gate for public browser extensions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
