export interface ThemeState {
  mode: 'solid' | 'gradient' | 'image';
  solidColor: string;
  gradientColors: string[];
  gradientAngle: number;
  backgroundImage: string | null;
  glassEnabled: boolean;
  glassColor: string;
  glassOpacity: number;
  glassBlur: number;
}

export const RAINBOW_PRESETS = [
  { name: '红', color: '#c0392b' },
  { name: '橙', color: '#d35400' },
  { name: '黄', color: '#b7950b' },
  { name: '绿', color: '#1e8449' },
  { name: '蓝', color: '#2471a3' },
  { name: '靛', color: '#2e3a6e' },
  { name: '紫', color: '#6c3483' },
  { name: '黑', color: '#1e1e2e' },
  { name: '白', color: '#f0f0f0' },
];

const BLACK_THEME = '#1e1e2e';
const WHITE_THRESHOLD = 140;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === nr) h = ((ng - nb) / d + (ng < nb ? 6 : 0)) / 6;
  else if (max === ng) h = ((nb - nr) / d + 2) / 6;
  else h = ((nr - ng) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const ns = s / 100;
  const nl = l / 100;
  const a = ns * Math.min(nl, 1 - nl);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = nl - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(c * 255);
  };
  const r = f(0).toString(16).padStart(2, '0');
  const g = f(8).toString(16).padStart(2, '0');
  const b = f(4).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function luminance(r: number, g: number, b: number): number {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  const R = rs <= 0.03928 ? rs / 12.92 : ((rs + 0.055) / 1.055) ** 2.4;
  const G = gs <= 0.03928 ? gs / 12.92 : ((gs + 0.055) / 1.055) ** 2.4;
  const B = bs <= 0.03928 ? bs / 12.92 : ((bs + 0.055) / 1.055) ** 2.4;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function deriveColors(baseColor: string): {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  isDark: boolean;
} {
  const [r, g, b] = hexToRgb(baseColor);
  const [h, s, l] = rgbToHsl(r, g, b);
  const isDark = l < 40;

  // For dark themes: bg = base, lighter elements for UI
  // For light themes: bg = base, darker elements for contrast
  const bg = baseColor;
  const bgSecondary = isDark
    ? hslToHex(h, s, Math.max(0, l - 6))
    : hslToHex(h, Math.min(100, s + 5), Math.max(0, l - 6));
  const bgTertiary = isDark
    ? hslToHex(h, Math.min(100, s + 3), Math.min(50, l + 10))
    : hslToHex(h, s, Math.max(0, l - 12));

  const text = isDark ? '#cdd6f4' : '#1e1e2e';
  const textSecondary = isDark ? '#a6adc8' : '#555555';
  const border = isDark ? '#45475a' : '#cccccc';
  const accent = isDark ? '#1e66f5' : '#1a56db';

  return { bg, bgSecondary, bgTertiary, text, textSecondary, border, accent, isDark };
}

export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return luminance(r, g, b) > 0.5;
}

export function ensureReadable(baseHex: string, isDark: boolean): string {
  const [r, g, b] = hexToRgb(baseHex);
  const l = luminance(r, g, b);
  const bgLum = isDark ? 0.1 : 0.85;
  if (Math.abs(l - bgLum) < 0.25) {
    if (isDark) {
      // Make color darker
      const [h, s] = rgbToHsl(r, g, b);
      return hslToHex(h, s, 25);
    } else {
      const [h, s] = rgbToHsl(r, g, b);
      return hslToHex(h, s, 80);
    }
  }
  return baseHex;
}

export function applyTheme(state: ThemeState): void {
  const root = document.documentElement;
  let bg: string;
  let bgSecondary: string;
  let bgTertiary: string;
  let text: string;
  let textSecondary: string;
  let border: string;
  let accent: string;
  let isDark: boolean;
  let gradientCSS = 'none';
  let imageCSS = 'none';
  let glassCSS = 'none';

  if (state.mode === 'gradient' && state.gradientColors.length >= 2) {
    const colors = state.gradientColors.join(', ');
    gradientCSS = `linear-gradient(${state.gradientAngle}deg, ${colors})`;
    const mid = state.gradientColors[Math.floor(state.gradientColors.length / 2)];
    const derived = deriveColors(mid);
    bg = derived.bg;
    bgSecondary = derived.bgSecondary;
    bgTertiary = derived.bgTertiary;
    text = derived.text;
    textSecondary = derived.textSecondary;
    border = derived.border;
    accent = derived.accent;
    isDark = derived.isDark;
  } else if (state.mode === 'image' && state.backgroundImage) {
    imageCSS = `url(${state.backgroundImage})`;
    // For image mode, use a dark overlay as base
    const derived = deriveColors('#1e1e2e');
    bg = 'transparent';
    bgSecondary = 'transparent';
    bgTertiary = 'rgba(30,30,46,0.75)';
    text = '#cdd6f4';
    textSecondary = '#a6adc8';
    border = 'rgba(69,71,90,0.5)';
    accent = '#1e66f5';
    isDark = true;

    if (state.glassEnabled) {
      const [gr, gg, gb] = hexToRgb(state.glassColor || '#1e1e2e');
      const a = state.glassOpacity;
      glassCSS = `background: rgba(${gr},${gg},${gb},${a}); backdrop-filter: blur(${state.glassBlur}px); -webkit-backdrop-filter: blur(${state.glassBlur}px);`;
    }
  } else {
    const derived = deriveColors(state.solidColor || BLACK_THEME);
    bg = derived.bg;
    bgSecondary = derived.bgSecondary;
    bgTertiary = derived.bgTertiary;
    text = derived.text;
    textSecondary = derived.textSecondary;
    border = derived.border;
    accent = derived.accent;
    isDark = derived.isDark;
  }

  root.style.setProperty('--app-bg', bg);
  root.style.setProperty('--app-bg-secondary', bgSecondary);
  root.style.setProperty('--app-bg-tertiary', bgTertiary);
  root.style.setProperty('--app-text', text);
  root.style.setProperty('--app-text-secondary', textSecondary);
  root.style.setProperty('--app-border', border);
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-is-dark', isDark ? '1' : '0');
  root.style.setProperty('--app-gradient', gradientCSS);
  root.style.setProperty('--app-image', imageCSS);
  root.style.setProperty('--app-glass', glassCSS);
}

export const DEFAULT_THEME: ThemeState = {
  mode: 'solid',
  solidColor: '#1e1e2e',
  gradientColors: ['#1e1e2e', '#313244'],
  gradientAngle: 135,
  backgroundImage: null,
  glassEnabled: true,
  glassColor: '#1e1e2e',
  glassOpacity: 0.6,
  glassBlur: 12,
};
