/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    screens: {
      xs: '475px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1400px',
      ultra: '1920px'
    },
    extend: {
      fontFamily: {
        sans: ['Roboto', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      colors: {
        border: 'var(--mui-palette-divider)',
        ring: 'var(--mui-palette-primary-main)',
        background: 'var(--mui-palette-background-default)',
        foreground: 'var(--mui-palette-text-primary)',
        primary: {
          DEFAULT: 'var(--mui-palette-primary-main)',
          foreground: 'var(--mui-palette-primary-contrastText)',
        },
        secondary: {
          DEFAULT: 'var(--mui-palette-secondary-main)',
          foreground: 'var(--mui-palette-secondary-contrastText)',
        },
        destructive: {
          DEFAULT: 'var(--mui-palette-error-main)',
          foreground: 'var(--mui-palette-error-contrastText)',
        },
        muted: {
          DEFAULT: 'var(--mui-palette-bg-muted)',
          foreground: 'var(--mui-palette-text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--mui-palette-tertiary-main)',
          foreground: 'var(--mui-palette-tertiary-contrastText)',
        },
        success: 'var(--mui-palette-success-main)',
        warning: 'var(--mui-palette-warning-main)',
        error: 'var(--mui-palette-error-main)',
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem'
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        'accordion-down': 'accordion-down 150ms ease-out',
        'accordion-up': 'accordion-up 150ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-in-up': 'fadeInUp 200ms ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')],
};
