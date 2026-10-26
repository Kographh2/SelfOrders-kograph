import { Suspense } from "react";
import type { Metadata } from "next";
import MenuPageContent from "./MenuPageContent";
import MenuLoading from "@/components/MenuLoading";
import {getPublicSite} from "@/lib/public-site";

export async function generateMetadata():Promise<Metadata>{
  const site=await getPublicSite();
  return {
  title: {absolute:site.title},
  description: site.description,
  alternates:site.publicUrl?{canonical:site.publicUrl+"/menu"}:undefined,
};
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={<MenuLoading/>}
    >
      <MenuPageContent />
    </Suspense>
  );
}
