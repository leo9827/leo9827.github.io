import * as params from '@params';

// Debug utility
const debug = (message) => console.log(`[DarkMode Debug] ${message}`);

// SVG icons
const sunIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>';
const moonIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>';

document.addEventListener("DOMContentLoaded", function() {
  const themeSwitch = document.querySelector('.theme-switch');
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(isDark) {
    debug(`Applying theme: ${isDark ? 'dark' : 'light'}`);
    if (isDark) {
      document.documentElement.setAttribute('data-dark-mode', '');
      themeSwitch.innerHTML = moonIcon;
    } else {
      document.documentElement.removeAttribute('data-dark-mode');
      themeSwitch.innerHTML = sunIcon;
    }
  }

  function initializeTheme() {
    const isDark = darkModeMediaQuery.matches;
    debug(`Initializing theme: ${isDark ? 'dark' : 'light'}`);
    applyTheme(isDark);
  }

  function toggleTheme() {
    const isDark = !document.documentElement.hasAttribute('data-dark-mode');
    debug(`Manually toggling theme to: ${isDark ? 'dark' : 'light'}`);
    applyTheme(isDark);
  }

  // 初始化
  initializeTheme();

  // 事件监听
  themeSwitch.addEventListener('click', toggleTheme);
  darkModeMediaQuery.addEventListener('change', (e) => {
    debug(`System theme changed to: ${e.matches ? 'dark' : 'light'}`);
    applyTheme(e.matches);
  });
});