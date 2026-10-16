"use client";

import { useEffect } from "react";

export default function PushNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "/push-sw.js"
        );
        console.log("Service Worker registered:", registration.scope);

        const subscription = "PushManager" in window ? await registration.pushManager.getSubscription() : null;
        if (!subscription) {
          console.log("Push subscription not yet enabled (user has not granted notification permission)");
        } else {
          console.log("Push subscription active");
        }
      } catch (error) {
        console.error("Service Worker registration failed:", error);
      }
    };

    registerSW();
  }, []);

  return <>{children}</>;
}
