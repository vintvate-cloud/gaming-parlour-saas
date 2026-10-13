/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        base: "#0f172a",
        panel: "#1e293b",
        panelLight: "#28344a",
        border: "#334155",
        accent: "#f97316",
        accentDark: "#ea580c",
      },
    },
  },
  plugins: [],
};
