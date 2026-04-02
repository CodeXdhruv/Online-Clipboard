export const metadata = {
  title: 'Online Clipboard',
  description: 'Shared, instant, zero-auth clipboard service',
  viewport: 'width=device-width, initial-scale=1',
  charset: 'utf-8',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
