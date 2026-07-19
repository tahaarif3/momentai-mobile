const hooks = {};
let currentScreen = 'home';

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

export function showScreen(name, params) {
  if (name === currentScreen && !params) return;

  const prev = currentScreen;
  hooks[prev]?.onLeave?.(params);

  document.querySelectorAll('[data-screen].screen').forEach((el) => {
    el.classList.toggle('screen--active', el.dataset.screen === name);
  });
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);

  currentScreen = name;
  hooks[name]?.onEnter?.(params);
}

export function initRouter(initialScreen = 'home') {
  document.querySelectorAll('[data-screen].screen').forEach((el) => {
    el.classList.toggle('screen--active', el.dataset.screen === initialScreen);
  });
  document.body.dataset.screen = initialScreen;
  currentScreen = initialScreen;
  hooks[initialScreen]?.onEnter?.();
}
