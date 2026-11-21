let deferredPrompt = null;

globalThis.addEventListener?.('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

globalThis.addEventListener?.('appinstalled', () => { deferredPrompt = null; });

export async function installApp() {
  if (globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone) {
    return '이미 홈 화면에서 앱으로 사용하고 있어요.';
  }
  if (deferredPrompt) {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice.outcome === 'accepted' ? '홈 화면에 추가했어요.' : '설치를 취소했어요.';
  }
  if (/iphone|ipad|ipod/i.test(globalThis.navigator?.userAgent ?? '')) {
    return 'Safari의 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택해 주세요.';
  }
  return '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해 주세요.';
}

if ('serviceWorker' in (globalThis.navigator ?? {})) {
  globalThis.addEventListener?.('load', () => navigator.serviceWorker.register('/a/sw.js').catch(() => {}));
}
