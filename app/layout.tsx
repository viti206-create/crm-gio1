export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          background: "#050408",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 16,
        }}
      >
        {children}
      </body>
    </html>
  );
}