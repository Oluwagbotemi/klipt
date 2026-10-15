export const THEME_STORAGE_KEY = "klipt-theme";

export type ThemePreference = "light" | "dark" | "system";

/**
 * Runs inline in <head> before first paint so the stored theme is applied
 * without a flash. Light is the default when nothing is stored.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
