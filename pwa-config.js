/**
 * PWA Configuration & Registration
 * Handles service worker, install prompt, and app shell
 */

const PWAConfig = {
  // Register service worker
  registerServiceWorker: async function() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Workers not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });
      console.log('[PWA] Service Worker registered');
      return registration;
    } catch (err) {
      console.error('[PWA] Service Worker registration failed:', err);
      return false;
    }
  },

  // Handle install prompt
  setupInstallPrompt: function() {
    let deferredPrompt = null;
    const installBtn = document.getElementById('install-app-btn');

    if (installBtn) {
      installBtn.style.display = 'none';
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      console.log('[PWA] Install prompt available');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install prompt outcome:', outcome);
        deferredPrompt = null;
        if (installBtn) installBtn.style.display = 'none';
      });
    }

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed');
      if (installBtn) installBtn.style.display = 'none';
    });
  },

  // Check if running as PWA
  isRunningAsPWA: function() {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  },

  // Detect online status
  setupOnlineDetection: function() {
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      document.documentElement.setAttribute('data-online', isOnline);
      console.log('[PWA]', isOnline ? 'Online' : 'Offline');
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  },

  // Initialize
  init: async function() {
    console.log('[PWA] Initializing...');
    await this.registerServiceWorker();
    this.setupInstallPrompt();
    this.setupOnlineDetection();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PWAConfig.init());
} else {
  PWAConfig.init();
}
