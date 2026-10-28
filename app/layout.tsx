import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ErrorReporter } from "@/components/error-reporter";
import { CookieNotice } from "@/components/cookie-notice";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Cladindin — suas finanças, num só lugar",
  description: "Importe extratos, controle contas a pagar, cartões e metas, e veja relatórios claros das suas finanças pessoais e da sua pequena empresa.",
  openGraph: { type: "website", locale: "pt_BR", siteName: "Cladindin" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Cladindin", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0f9d6e" };

// Aplica o tema antes da pintura para evitar flash
const themeScript = `try{var t=localStorage.getItem('tema');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
        <ErrorReporter />
        <CookieNotice />
      </body>
    </html>
  );
}
