const hooks = {};
const TAB_SCREENS = ['home', 'moments', 'discover', 'profile'];
const MODAL_SCREENS = ['capture', 'picker', 'loading', 'playlist', 'share', 'paywall'];

let currentScreen = 'home';
let prevTab = 'home';

export function isTabScreen(name) {
  return TAB_SCREENS.includes(name);
}

export function getPrevTab() {
  return prevTab;
}

export function getCurrentScreen() {
  return currentScreen;
}

export function currentScreenName() {
  return currentScreen;
}

export function registerScreen(name, { onEnter, onLeave, onShow, onHide } = {}) {
  hooks[name] = {
    onEnter: onEnter || onShow,
    onLeave: onLeave || onHide,
  };
}

function syncChrome(name) {
  document.querySelectorAll('[data-screen].screen').forEach((el) => {
    el.classList.toggle('screen--active', el.dataset.screen === name);
  });
  document.body.dataset.screen = name;
  document.body.classList.toggle('modal-open', MODAL_SCREENS.includes(name));

  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.classList.toggle('tab-item--active', el.dataset.tab === name);
  });

  window.scrollTo(0, 0);
}

export function showScreen(name, params) {
  if (name === currentScreen && !params) return;

  if (isTabScreen(name)) {
    prevTab = name;
  } else if (isTabScreen(currentScreen)) {
    prevTab = currentScreen;
  }

  const prev = currentScreen;
  hooks[prev]?.onLeave?.(params);

  syncChrome(name);
  currentScreen = name;
  hooks[name]?.onEnter?.(params);
}

export function goBackToTab() {
  showScreen(prevTab);
}

export function openModal(name, params) {
  showScreen(name, params);
}

export function initRouter(initialScreen = 'home') {
  prevTab = isTabScreen(initialScreen) ? initialScreen : 'home';
  syncChrome(initialScreen);
  currentScreen = initialScreen;
  hooks[initialScreen]?.onEnter?.();
}
