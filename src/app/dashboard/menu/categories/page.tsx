"use client";
// Redirect to unified categories page
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function MenuCategoriesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/categories"); }, [router]);
  return null;
}
