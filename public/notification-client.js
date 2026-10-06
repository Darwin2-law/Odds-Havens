/**
 * OddsHaven Notification Client
 * Manages push subscriptions, preferences, and real-time notifications
 */

class NotificationManager {
  constructor(apiBase = '') {
    this.apiBase = apiBase;
    this.subscription = null;
    this.serviceWorkerReady = false;
    this.init();
  }

  async init() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      this.serviceWorkerReady = true;
      console.log('Service Worker registered:', registration);

      // Check if already subscribed
      const currentSubscription = await registration.pushManager.getSubscription();
      if (currentSubscription) {
        this.subscription = currentSubscription;
        this.syncWithServer();
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  /**
   * Request notification permission and subscribe to push
   */
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      return { success: false, error: 'Notifications not supported' };
    }

    if (Notification.permission === 'granted') {
      return await this.subscribe();
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        return await this.subscribe();
      }
    }

    return { success: false, error: 'Permission denied' };
  }

  /**
   * Subscribe this device to push notifications
   */
  async subscribe() {
    if (!this.serviceWorkerReady) {
      return { success: false, error: 'Service Worker not ready' };
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          document.querySelector('meta[name="push-key"]')?.content || ''
        )
      });

      this.subscription = subscription;

      // Send subscription to server
      const response = await fetch(`${this.apiBase}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to register subscription on server');
      }

      const data = await response.json();
      return { success: true, subscriptionId: data.subscriptionId, ...data };
    } catch (error) {
      console.error('Subscription failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe this device
   */
  async unsubscribe() {
    if (!this.subscription) {
      return { success: false, error: 'No subscription found' };
    }

    try {
      await fetch(`${this.apiBase}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: this.subscription.endpoint }),
        credentials: 'include'
      });

      await this.subscription.unsubscribe();
      this.subscription = null;
      return { success: true };
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's active devices
   */
  async getDevices() {
    try {
      const response = await fetch(`${this.apiBase}/api/push/my-devices`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch devices');
      return await response.json();
    } catch (error) {
      console.error('Get devices error:', error);
      return { devices: [] };
    }
  }

  /**
   * Get notification preferences
   */
  async getPreferences() {
    try {
      const response = await fetch(`${this.apiBase}/api/push/preferences`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch preferences');
      return await response.json();
    } catch (error) {
      console.error('Get preferences error:', error);
      return null;
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences) {
    try {
      const response = await fetch(`${this.apiBase}/api/push/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to update preferences');
      return { success: true };
    } catch (error) {
      console.error('Update preferences error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notification history
   */
  async getHistory(limit = 20) {
    try {
      const response = await fetch(
        `${this.apiBase}/api/push/history?limit=${limit}`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to fetch history');
      return await response.json();
    } catch (error) {
      console.error('Get history error:', error);
      return { notifications: [] };
    }
  }

  /**
   * Sync subscription with server if changed
   */
  async syncWithServer() {
    if (!this.subscription) return;

    try {
      await fetch(`${this.apiBase}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: this.subscription.toJSON() }),
        credentials: 'include'
      });
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  /**
   * Convert VAPID public key to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Check if subscribed
   */
  isSubscribed() {
    return this.subscription !== null;
  }

  /**
   * Get subscription status
   */
  getStatus() {
    return {
      isSubscribed: this.isSubscribed(),
      serviceWorkerReady: this.serviceWorkerReady,
      notificationPermission: Notification.permission,
      subscription: this.subscription ? {
        endpoint: this.subscription.endpoint.substring(0, 50) + '...',
        createdAt: this.subscription.expirationTime
      } : null
    };
  }
}

// Initialize on page load if push key exists
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('meta[name="push-key"]')) {
    window.notificationManager = new NotificationManager();
  }
});
