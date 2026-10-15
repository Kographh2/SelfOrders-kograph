import { Suspense } from "react";
import MenuPageContent from "../menu/MenuPageContent";
export const metadata = { title: "Cari menu" };
export default function Page() { return <Suspense fallback={<div className="consumer-page">Memuat...</div>}><MenuPageContent mode="search"/></Suspense>; }
