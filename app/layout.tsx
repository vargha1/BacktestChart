import type { Metadata } from "next";
import "./globals.css";



export const metadata: Metadata = {
  title: "blueChart back test",
  description: "",
};

export default function RootLayout({children,}: Readonly<{children: React.ReactNode;}>) {
  return (
    <html lang="en" dir="rlt">
      <body cz-shortcut-listen="true" className="scrollbar scrollbar-w-2 scrollbar-thumb-[#707070] scrollbar-thumb-rounded-md">
        {children}
      </body>
    </html>
  );
}
