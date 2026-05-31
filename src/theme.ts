import type { Theme } from './settings';

/** Reflects the chosen theme onto <html>. 'auto' removes the attribute so the
 *  prefers-color-scheme media query governs; 'light'/'dark' force the palette. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-cae-theme');
  } else {
    root.setAttribute('data-cae-theme', theme);
  }
}
