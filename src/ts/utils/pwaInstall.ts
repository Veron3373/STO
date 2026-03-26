type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listenersBound = false;

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || !!nav.standalone
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isSafariOnIOS(): boolean {
  const ua = navigator.userAgent;
  const isSafari =
    /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua);
  return isIOS() && isSafari;
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
    navigator.userAgent,
  );
}

function shouldShowInstallButton(): boolean {
  if (!isMobileDevice()) return false;
  if (isStandalone()) return false;
  if (isIOS()) return true;
  return !!deferredPrompt;
}

function bindGlobalInstallListeners(onStateChange: () => void): void {
  if (listenersBound) return;
  listenersBound = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    onStateChange();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    onStateChange();
  });
}

export function initPWAInstallButton(button: HTMLButtonElement): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const updateVisibility = () => {
    button.style.display = shouldShowInstallButton() ? "inline-flex" : "none";
  };

  bindGlobalInstallListeners(updateVisibility);
  updateVisibility();

  if ((button as HTMLButtonElement & { __pwaBound?: boolean }).__pwaBound) {
    return;
  }
  (button as HTMLButtonElement & { __pwaBound?: boolean }).__pwaBound = true;

  button.addEventListener("click", async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        deferredPrompt = null;
        updateVisibility();
      }
      return;
    }

    if (isSafariOnIOS()) {
      alert(
        "Щоб встановити застосунок на iPhone:\n\n1. Натисніть Поділитися (квадрат зі стрілкою).\n2. Оберіть 'На початковий екран'.\n3. Натисніть 'Додати'.",
      );
      return;
    }

    if (isIOS()) {
      alert(
        "Для iPhone відкрийте сайт у Safari, потім: Поділитися -> На початковий екран.",
      );
      return;
    }

    alert(
      "Якщо системне вікно не з'явилось, встановіть застосунок через меню браузера: 'Додати на головний екран'.",
    );
  });
}
