/**
 * Push Notification Client
 * Handles subscription and permission requests
 */

const PushClient = {
  pushServerUrl: process.env.PUSH_SERVER_URL || 'http://localhost:3001',

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  },

  async getSubscriptionStatus() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return subscription ? true : false;
    } catch (err) {
      console.error('[Push] Status check failed:', err);
      return false;
    }
  },

  async subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] Push Notifications not supported');
      return false;
    }

    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.warn('[Push] Notification permission denied');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const response = await fetch(`${this.pushServerUrl}/public-key`);
      const { publicKey } = await response.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });

      await fetch(`${this.pushServerUrl}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      console.log('[Push] Subscribed successfully');
      return true;
    } catch (err) {
      console.error('[Push] Subscription failed:', err);
      return false;
    }
  },

  async unsubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        console.log('[Push] Not currently subscribed');
        return false;
      }

      await fetch(`${this.pushServerUrl}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed');
      return true;
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
      return false;
    }
  },

  updateUI(isSubscribed) {
    const btn = document.getElementById('push-toggle');
    if (!btn) return;

    if (isSubscribed) {
      btn.textContent = '🔔 Disable Notifications';
      btn.classList.add('active');
    } else {
      btn.textContent = '🔕 Enable Notifications';
      btn.classList.remove('active');
    }
  },

  setupButton() {
    const btn = document.getElementById('push-toggle');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const isSubscribed = await this.getSubscriptionStatus();
      if (isSubscribed) {
        await this.unsubscribe();
        this.updateUI(false);
      } else {
        const success = await this.subscribe();
        this.updateUI(success);
      }
    });

    // Initial UI update
    this.getSubscriptionStatus().then((status) => this.updateUI(status));
  },

  init() {
    console.log('[Push] Initializing...');
    this.setupButton();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PushClient.init());
} else {
  PushClient.init();
}
