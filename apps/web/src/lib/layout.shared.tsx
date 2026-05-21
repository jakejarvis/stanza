import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

// The stanza site header/footer wrap docs from __root, so Fumadocs renders no
// top nav of its own — only its sidebar + table of contents. Dark mode and
// search are owned by the site shell (ThemeProvider + registry palette), so
// Fumadocs' own theme switch and search trigger stay off.
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { enabled: false },
    themeSwitch: { enabled: false },
    searchToggle: { enabled: false },
  };
}
