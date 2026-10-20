import type { ReactNode } from "react";

export const metadata = {
  title: "Career Connect",
  description: "A private networking CRM for your job search, inside Claude and ChatGPT.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "48px auto", padding: "0 16px", lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
