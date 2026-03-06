import "./globals.css";
import React from "react";

export const metadata = {
  title: "CRM GIO",
  description: "Sistema CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}