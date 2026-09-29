import { Suspense } from "react";
import type { Metadata } from "next";
import MenuPageContent from "./MenuPageContent";

export const metadata: Metadata = {
  title: "Menu",
  description: "Lihat dan pesan menu restaurant langsung dari meja Anda",
};

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f5f8ff] dark:bg-[#020817]">
          <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <MenuPageContent />
    </Suspense>
  );
}
