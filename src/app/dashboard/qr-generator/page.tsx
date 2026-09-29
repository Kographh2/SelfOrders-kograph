"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function QRGeneratorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/qr"); }, [router]);
  return null;
}
