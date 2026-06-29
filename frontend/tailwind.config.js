/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        line: '#00B900',
        // accent สดตัวเดียวของแอป — ใช้กับปุ่ม/จุดที่อยากให้เด้งออกจากโทนเทา+teal
        coral: {
          DEFAULT: '#FB6F5C',
          foreground: '#FFFFFF',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) - 4px)',
        '2xl': 'var(--radius)',
        '3xl': 'calc(var(--radius) + 8px)',
        '4xl': 'calc(var(--radius) + 16px)',
      },
      // เงานุ่มอมเขียว — ทุกการ์ดที่ใช้ shadow-sm/shadow/md/lg ดูลอย สะอาด ไม่ทื่อ
      boxShadow: {
        sm: '0 1px 2px 0 hsl(150 40% 22% / 0.04), 0 2px 8px -3px hsl(150 45% 28% / 0.07)',
        DEFAULT: '0 2px 4px -1px hsl(150 40% 22% / 0.05), 0 6px 18px -5px hsl(150 45% 28% / 0.10)',
        md: '0 4px 8px -2px hsl(150 40% 22% / 0.06), 0 10px 26px -6px hsl(150 45% 28% / 0.12)',
        lg: '0 8px 16px -4px hsl(150 40% 22% / 0.08), 0 18px 42px -10px hsl(150 45% 28% / 0.14)',
      },
      fontFamily: {
        sans: ['Sarabun', 'sans-serif'],
      },
      keyframes: {
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'dot': {
          '0%, 80%, 100%': { opacity: '0.25', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.22s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'pop': 'pop 0.45s ease-out both',
        'dot': 'dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
