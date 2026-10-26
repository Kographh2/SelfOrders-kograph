import { Suspense } from "react";
import type { Metadata } from "next";
import MenuPageContent from "./MenuPageContent";
import MenuLoading from "@/components/MenuLoading";

export const metadata: Metadata = {
  title: "Menu",
  description: "Lihat dan pesan menu restaurant langsung dari meja Anda",
};

export default function MenuPage() {
  return (
    <Suspense
      fallback={<MenuLoading/>}
    >
      <MenuPageContent />
    </Suspense>
  );
}
