import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./restaurant.css";
import "./soft-ui.css";
import "@/lib/mascot/logo.css";
import "./brand.css";
import SiteBrandHeader from "@/components/SiteBrandHeader";
import { OrderProvider } from "@/contexts/OrderContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import FloatingNav from "@/components/FloatingNav";
import MotionProvider from "@/components/MotionProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import PushNotificationProvider from "@/components/PushNotificationProvider";
import ConnectivityGuard from "@/components/ConnectivityGuard";
import {getPublicSite} from '@/lib/public-site';
import {APP_NAME} from '@/lib/public-site-config';
import './public-ui.css';

export async function generateMetadata():Promise<Metadata>{
 const site=await getPublicSite();
 return {applicationName:APP_NAME,title:{default:site.title,template:`%s | ${APP_NAME}`},description:site.description,
  metadataBase:site.publicUrl?new URL(site.publicUrl):undefined,manifest:'/manifest.json',
  icons:{icon:[{url:'/favicon-48.png',sizes:'48x48',type:'image/png'},{url:'/favicon-96.png',sizes:'96x96',type:'image/png'}],shortcut:'/favicon.ico',apple:'/apple-touch-icon.png'},
  appleWebApp:{capable:true,title:APP_NAME,statusBarStyle:'default'},
  robots:{index:site.indexingEnabled,follow:site.indexingEnabled},verification:site.googleVerification?{google:site.googleVerification}:undefined,
  openGraph:{siteName:APP_NAME,title:site.title,description:site.description,locale:'id_ID',type:'website',...(site.publicUrl?{url:site.publicUrl,images:[{url:site.publicUrl+'/icon-512x512.png',width:512,height:512,alt:APP_NAME}]}:{})},
  twitter:{card:'summary',title:site.title,description:site.description},
 };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F1E2B",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site=await getPublicSite();
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('selforder_theme');if(t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }} />
        {/* Google Fonts loaded via link for better network resilience */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {site.publicUrl&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:APP_NAME,url:site.publicUrl}).replace(/</g,'\\u003c')}}/>}
        <PreferencesProvider><MotionProvider><AuthProvider><OrderProvider>
          <PushNotificationProvider><ConnectivityGuard><SiteBrandHeader/>{children}<FloatingNav /></ConnectivityGuard></PushNotificationProvider>
        </OrderProvider></AuthProvider></MotionProvider></PreferencesProvider>
      </body>
    </html>
  );
}
