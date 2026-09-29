/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#F0F4F8",
          100: "#D9E4EE",
          200: "#B3C9DD",
          300: "#8DAEC9",
          400: "#5D8DAD",
          500: "#3E6E91",
          600: "#2E5370",
          700: "#1E3B52",
          800: "#162B3C",
          900: "#0F1E2B",
          950: "#080F16",
        },
        bone: {
          50:  "#FFFFFF",
          100: "#F5F8FF",
          200: "#E6EEFF",
        },
        gold: {
          DEFAULT: "#2563EB",
          50: "#EFF6FF",
          700: "#1D4ED8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        soft:    "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "soft-md": "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        "soft-lg": "0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
      },
    },
  },
  plugins: [],
};
