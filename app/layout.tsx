import type { ReactNode } from "react";

export const metadata = {
  title: "Career Connect",
  description: "A private networking CRM for your job search, inside Claude and ChatGPT.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          input { border: 1px solid #8a8a8a; border-radius: 6px; font: inherit; }
          input:focus { outline: 2px solid #2563eb; outline-offset: 1px; }
          button { font: inherit; border: 1px solid #555; border-radius: 6px; background: #f3f3f3; cursor: pointer; }
        `}</style>
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "48px auto", padding: "0 16px", lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
