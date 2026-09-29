import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import PushNotificationProvider from "@/components/PushNotificationProvider";

export const metadata: Metadata = {
  title: { default: "SelfOrder", template: "%s | SelfOrder" },
  description: "Sistem self-order restaurant modern",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0F1E2B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('selforder_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
        {/* Google Fonts loaded via link for better network resilience */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <PushNotificationProvider>{children}</PushNotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
