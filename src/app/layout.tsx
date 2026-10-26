import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./restaurant.css";
import "./soft-ui.css";
import { OrderProvider } from "@/contexts/OrderContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import FloatingNav from "@/components/FloatingNav";
import MotionProvider from "@/components/MotionProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import PushNotificationProvider from "@/components/PushNotificationProvider";
import ConnectivityGuard from "@/components/ConnectivityGuard";

export const metadata: Metadata = {
  title: { default: "SelfOrder", template: "%s | SelfOrder" },
  description: "Sistem self-order restaurant modern",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F1E2B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('selforder_theme');if(t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }} />
        {/* Google Fonts loaded via link for better network resilience */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <PreferencesProvider><MotionProvider><AuthProvider><OrderProvider>
          <PushNotificationProvider><ConnectivityGuard>{children}<FloatingNav /></ConnectivityGuard></PushNotificationProvider>
        </OrderProvider></AuthProvider></MotionProvider></PreferencesProvider>
      </body>
    </html>
  );
}
