"use client";

import { ReactNode, Suspense } from "react";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/AuthContext";
import PushNotificationProvider from "@/components/PushNotificationProvider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <PushNotificationProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#fff",
              color: "#1f2937",
              borderRadius: "12px",
              boxShadow:
                "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            },
            success: {
              duration: 3000,
              icon: "✅",
            },
            error: {
              duration: 4000,
              icon: "⚠️",
            },
          }}
        />
        {children}
      </PushNotificationProvider>
    </AuthProvider>
  );
}
