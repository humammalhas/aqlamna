/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: [
          '"IBM Plex Sans Arabic"',
          '"Noto Sans Arabic"',
          "Amiri",
          "Tajawal",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"Cascadia Code"',
          '"Fira Code"',
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
