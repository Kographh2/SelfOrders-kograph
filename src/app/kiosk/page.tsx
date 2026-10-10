import type { Metadata, Viewport } from "next";
import KioskExperience from "@/components/kiosk/KioskExperience";

export const metadata: Metadata = { title: "KIOSK · Kographh", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, themeColor: "#102a32" };
export default function KioskPage() { return <KioskExperience />; }
