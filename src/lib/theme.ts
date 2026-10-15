export const THEME_STORAGE_KEY = "klipt-theme";
export const SIDEBAR_STORAGE_KEY = "klipt-sidebar";

export type ThemePreference = "light" | "dark" | "system";

/**
 * Runs inline in <head> before first paint so stored UI preferences apply
 * without a flash: the theme (light by default) and a collapsed sidebar
 * (`data-sidebar="collapsed"` on <html>).
 */
export const preferencesInitScript = `(function(){var h=document.documentElement;try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);h.classList.toggle("dark",d)}catch(e){}try{if(localStorage.getItem("${SIDEBAR_STORAGE_KEY}")==="collapsed")h.dataset.sidebar="collapsed"}catch(e){}})()`;
