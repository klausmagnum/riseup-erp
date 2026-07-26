import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TF ERP Contabil",
  description: "Sistema de rotinas para escritório de contabilidade",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <head>
        <script src="/erp-integration.js" async></script>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
