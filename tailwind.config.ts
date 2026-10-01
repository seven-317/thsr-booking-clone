import type {Config} from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        thsr: {
          orange: '#F15A24',
          'orange-hover': '#FF6B2C',
          'orange-active': '#D94D1F',
          dark: '#333333',
          text: '#4A4A4A',
          muted: '#6B6B6B',
          background: '#F5F5F5',
          surface: '#FFFFFF',
          border: '#D8D8D8',
          footer: '#707075',
          'footer-dark': '#626268'
        }
      },
      fontFamily: {
        sans: [
          'Arial',
          '"Noto Sans TC"',
          '"Microsoft JhengHei"',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

export default config;
