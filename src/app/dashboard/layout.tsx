"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, useRole } from "@/contexts/AuthContext";
import Sidebar from "@/components/dashboard/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isStaff } = useRole();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/login?redirect=" + encodeURIComponent(pathname));
    }
    if (!isLoading && isAuthenticated && !isStaff) {
      router.replace("/menu");
    }
  }, [isLoading, isAuthenticated, isStaff, router, pathname]);

  if (isLoading || !isAuthenticated || !isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone-50">
        <div className="w-10 h-10 border-[3px] border-navy-200 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bone-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
