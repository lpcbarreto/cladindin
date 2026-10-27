import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ErrorReporter } from "@/components/error-reporter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cladindin",
  description: "Gestão financeira pessoal e empresarial",
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
      </body>
    </html>
  );
}
