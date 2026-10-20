import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cladindin — finanças sem complicação",
    short_name: "Cladindin",
    description: "Gestão financeira pessoal e empresarial",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f2",
    theme_color: "#177a4c",
    lang: "pt-BR",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Novo lançamento", short_name: "Lançar", url: "/?novo=1" },
      { name: "Contas a pagar", short_name: "A pagar", url: "/?ir=a-pagar" },
    ],
  };
}
