export const THEME_STORAGE_KEY = "krino-theme";

/**
 * Runs before first paint: a stored light or dark choice wins, otherwise the system setting.
 * Inline and synchronous, so the page never flashes the wrong theme.
 */
export const THEME_INIT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});d.setAttribute('data-theme',t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))}catch(e){}`;
