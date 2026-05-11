const primary = '#20a7c9';
const primaryLight = '#5fc4df';
const primaryDark = '#1589a6';

export const supersetPalette = {
  mode: 'light' as const,
  primary: {
    main: primary,
    light: primaryLight,
    dark: primaryDark,
    container: '#d4f0f7',
    onContainer: '#0a4b5c',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#444444',
    light: '#666666',
    dark: '#222222',
    container: '#e8e8e8',
    onContainer: '#1a1a1a',
    contrastText: '#ffffff',
  },
  error: {
    main: '#e0432e',
    light: '#fce9e9',
    container: '#fce9e9',
    onContainer: '#8b1a0e',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#ff7f44',
    contrastText: '#000000',
  },
  success: {
    main: '#5ac189',
    light: '#e6f4ea',
    container: '#e6f4ea',
    onContainer: '#1a5c3a',
    contrastText: '#ffffff',
  },
  info: {
    main: '#66bcfe',
    contrastText: '#ffffff',
  },
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
  },
  surface: {
    main: '#ffffff',
    variant: '#f0f4f5',
  },
  text: {
    primary: '#1a1a1a',
    secondary: '#5f6368',
    disabled: '#9aa0a6',
  },
  divider: '#e0e0e0',
  outline: '#dadce0',
  action: {
    hover: 'rgba(32, 167, 201, 0.08)',
    selected: 'rgba(32, 167, 201, 0.12)',
    focus: 'rgba(32, 167, 201, 0.14)',
    disabled: 'rgba(0,0,0,0.26)',
    disabledBackground: 'rgba(0,0,0,0.12)',
  },
  bg: {
    page: '#f5f5f5',
    sidebar: '#f8f9fa',
    card: '#ffffff',
    header: '#f0f4f5',
    hover: 'rgba(32, 167, 201, 0.08)',
    selected: 'rgba(32, 167, 201, 0.12)',
    muted: 'rgba(0,0,0,0.04)',
  },
  border: {
    light: 'rgba(0,0,0,0.06)',
    medium: 'rgba(0,0,0,0.12)',
    strong: 'rgba(0,0,0,0.15)',
  },
  shadow: {
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 4px 8px rgba(0,0,0,0.12)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
    card: '0 1px 3px rgba(0,0,0,0.08)',
    cardHover: '0 4px 8px rgba(0,0,0,0.12)',
  },
  status: {
    success: '#5ac189',
    successBg: 'rgba(90, 193, 137, 0.1)',
    warning: '#ff7f44',
    warningBg: 'rgba(255, 127, 68, 0.1)',
    error: '#e0432e',
    errorBg: 'rgba(224, 67, 46, 0.1)',
  },
};
