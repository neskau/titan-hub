import type { Config } from "tailwindcss";

// Identidade Titan: vinho escuro, vermelho e grafite (manual de marca)
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        vinho: { DEFAULT: "#3D000E", escuro: "#2A0710" },
        titan: { DEFAULT: "#93090F", claro: "#B0141B", tinta: "#F7E6E7" },
        grafite: "#333333",
        fundo: "#F6F3F3",
        linha: "#E8DFE0",
        suave: "#6E6466",
      },
      fontFamily: {
        sans: ["\"Titillium Web\"", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
