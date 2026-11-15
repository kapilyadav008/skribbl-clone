/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#F7F4EE',  // warm sketchbook off-white
          pure:    '#FFFFFF',  // crisp sheet white
          warm:    '#EFEADF',  // parchment / card stock
          dark:    '#E2DACB',  // craft paper tone
          line:    '#D9D0BE',  // subtle notebook ruling
          light:   '#FAF8F5',  // soft sheet white
        },
        ink: {
          DEFAULT: '#18181B',  // deep charcoal ink black
          light:   '#3F3F46',  // graphite gray
          faint:   '#71717A',  // pencil sketch gray
          border:  '#27272A',  // crisp ink borders
        },
        cobalt: {
          light:   '#3B82F6',
          DEFAULT: '#1D4ED8',  // bold artist cobalt blue
          hover:   '#1E40AF',
          dark:    '#172554',
        },
        coral: {
          light:   '#FF7854',
          DEFAULT: '#EA580C',  // vibrant terracotta / warm coral
          hover:   '#C2410C',
        },
        lime: {
          light:   '#BEF264',
          DEFAULT: '#84CC16',  // fresh highlighter studio lime
          hover:   '#65A30D',
        },
        tape: {
          yellow:  '#FEF08A',  // masking tape yellow
          coral:   '#FED7AA',
          cyan:    '#CFFAFE',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        hand: ['"Caveat"', 'cursive', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'ink-sm': '2px 2px 0px #18181B',
        'ink':    '3px 3px 0px #18181B',
        'ink-lg': '5px 5px 0px #18181B',
        'ink-xl': '7px 7px 0px #18181B',
      },
    },
  },
  plugins: [],
}
