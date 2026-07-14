// Dark, gold-accented trading theme for Golden Heists / MADUMONEY SNIPER v5.0

export const Colors = {
  // Backgrounds
  bg: '#0B0D12',
  bgCard: '#12151C',
  bgCardElevated: '#1A1E27',
  bgInput: '#161A22',

  // Borders
  border: '#232733',
  borderActive: '#D4AF37',

  // Text
  text: '#F5F6F8',
  textSecondary: '#A3A9B7',
  textMuted: '#6B7280',

  // Brand / primary (gold)
  primary: '#D4AF37',
  primaryLight: '#2A2513',
  primaryGlow: '#3A320F',
  primaryText: '#0B0D12',

  // Status - success (green)
  success: '#22C55E',
  successBg: '#132A1B',
  successGlow: '#16351F',

  // Status - danger (red)
  danger: '#EF4444',
  dangerBg: '#2C1516',
  dangerGlow: '#351A1B',

  // Status - warning (amber)
  warning: '#F59E0B',
  warningBg: '#2C2110',

  // Status - info (blue)
  info: '#3B82F6',
  infoBg: '#131E2E',

  // Connection state (green dot / EA online)
  connected: '#22C55E',
  connectedBg: '#132A1B',

  // Buy / sell semantics (reuse success/danger tones)
  buy: '#22C55E',
  buyBg: '#132A1B',
  sell: '#EF4444',
  sellBg: '#2C1516',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

export const Radius = {
  sm: 6,
  md: 12,
  lg: 18,
} as const;
