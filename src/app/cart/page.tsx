import { Suspense } from "react";
import MenuPageContent from "../menu/MenuPageContent";
export const metadata = { title: "Keranjang" };
export default function Page() { return <Suspense fallback={<div className="consumer-page">Memuat...</div>}><MenuPageContent mode="cart"/></Suspense>; }
