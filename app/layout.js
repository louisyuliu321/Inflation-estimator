import "./globals.css";

export const metadata = {
  title: "NHCCI Inflation Factor",
  description: "Live NHCCI inflation factor lookup sourced from U.S. DOT Open Data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
