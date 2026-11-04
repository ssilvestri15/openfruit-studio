/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fruit: {
          bg: 'rgb(var(--fruit-bg) / <alpha-value>)',
          surface: 'rgb(var(--fruit-surface) / <alpha-value>)',
          surfaceHover: 'rgb(var(--fruit-surfaceHover) / <alpha-value>)',
          canvas: 'rgb(var(--fruit-canvas) / <alpha-value>)',
          editor: 'rgb(var(--fruit-editor) / <alpha-value>)',
          card: 'rgb(var(--fruit-card) / <alpha-value>)',
          overlay: 'rgb(var(--fruit-overlay) / <alpha-value>)',
          border: 'rgb(var(--fruit-border) / <alpha-value>)',
          borderMuted: 'rgb(var(--fruit-borderMuted) / <alpha-value>)',
          borderLight: 'rgb(var(--fruit-borderLight) / <alpha-value>)',
          text: 'rgb(var(--fruit-text) / <alpha-value>)',
          textMuted: 'rgb(var(--fruit-textMuted) / <alpha-value>)',
          textDim: 'rgb(var(--fruit-textDim) / <alpha-value>)',
          textSubtle: 'rgb(var(--fruit-textSubtle) / <alpha-value>)',
          accent: 'rgb(var(--fruit-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--fruit-accentHover) / <alpha-value>)',
          accentDark: 'rgb(var(--fruit-accentDark) / <alpha-value>)',
          accentBadge: 'rgb(var(--fruit-accentBadge) / <alpha-value>)',
          syntaxPurple: 'rgb(var(--fruit-syntaxPurple) / <alpha-value>)',
          syntaxBlue: 'rgb(var(--fruit-syntaxBlue) / <alpha-value>)',
          syntaxCoral: 'rgb(var(--fruit-syntaxCoral) / <alpha-value>)',
          diffGreen: 'rgb(var(--fruit-diffGreen) / <alpha-value>)',
          diffRed: 'rgb(var(--fruit-diffRed) / <alpha-value>)'
        }
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Space Mono"', 'Consolas', 'monospace']
      },
      boxShadow: {
        'luxury': '0 20px 50px rgba(0, 0, 0, 0.45), 0 0 1px 1px rgba(203, 222, 170, 0.08)',
        'popup': '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px #383C34',
        'subtle': '0 4px 20px rgba(0, 0, 0, 0.3)'
      }
    },
  },
  plugins: [],
}
