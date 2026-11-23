import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from "./lib/preference";

export const themeBootScript = `
(function() {
  var theme = null;
  try {
    theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  } catch (e) {}
  var dark = theme === 'dark' ||
    (theme !== 'light' && matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches);
  document.documentElement.classList.toggle('dark', dark);
})();
`;
