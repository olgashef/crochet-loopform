import { useState } from 'react';
import { Palette } from 'lucide-react';

const themes = ['neutral', 'dark', 'sage', 'ocean', 'rose'] as const;
type Theme = typeof themes[number];
const storageKey = 'loopform-dashboard-theme';
export function initializeTheme(): Theme {
  let value: string | null = null;
  try { value = localStorage.getItem(storageKey); } catch { /* Storage can be unavailable. */ }
  const theme = themes.includes(value as Theme) ? value as Theme : 'neutral';
  document.documentElement.dataset.theme = theme;
  return theme;
}
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme || 'neutral') as Theme);
  return <label className="theme-picker" title="Dashboard color scheme">
    <Palette size={16} aria-hidden="true" />
    <span className="visually-hidden">Dashboard color scheme</span>
    <select value={theme} onChange={event => {
      const next = event.target.value as Theme;
      document.documentElement.dataset.theme = next;
      setTheme(next);
      try { localStorage.setItem(storageKey, next); } catch { /* Keep the session preference. */ }
    }}>{themes.map(option => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select>
  </label>;
}
