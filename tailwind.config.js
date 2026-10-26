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
        blue: {50:'#eff3f7',100:'#e1e8f0',200:'#c6d3e1',300:'#a3b8cd',400:'#7794b0',500:'#496f92',600:'#2e5370',700:'#1e3b52',800:'#162b3c',900:'#142b45',950:'#0c1828'},
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
          DEFAULT: "#2e5370",
          50: "#eff3f7",
          700: "#1e3b52",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
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
