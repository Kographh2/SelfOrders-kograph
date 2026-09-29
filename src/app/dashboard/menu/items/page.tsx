"use client";
// Redirect to unified menu page
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function MenuItemsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/menu"); }, [router]);
  return null;
}
