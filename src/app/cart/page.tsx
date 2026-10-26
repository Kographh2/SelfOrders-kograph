import { Suspense } from "react";
import MenuLoading from "@/components/MenuLoading";
import MenuPageContent from "../menu/MenuPageContent";
export const metadata = { title: "Keranjang" };
export default function Page() { return <Suspense fallback={<MenuLoading/>}><MenuPageContent mode="cart"/></Suspense>; }
