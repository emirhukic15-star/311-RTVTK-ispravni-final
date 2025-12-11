// Push Notifications Service
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Get VAPID public key
export const getVapidPublicKey = async (): Promise<string> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/push/vapid-public-key`);
    return response.data.publicKey;
  } catch (error) {
    console.error('Error getting VAPID public key:', error);
    throw error;
  }
};

// Subscribe to push notifications
export const subscribeToPush = async (subscription: PushSubscription, token: string): Promise<void> => {
  try {
    const subscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
        auth: arrayBufferToBase64(subscription.getKey('auth')!)
      }
    };

    await axios.post(
      `${API_BASE_URL}/api/push/subscribe`,
      { subscription: subscriptionData },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
  } catch (error) {
    console.error('Error subscribing to push:', error);
    throw error;
  }
};

// Unsubscribe from push notifications
export const unsubscribeFromPush = async (subscription: PushSubscription, token: string): Promise<void> => {
  try {
    await axios.post(
      `${API_BASE_URL}/api/push/unsubscribe`,
      { endpoint: subscription.endpoint },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    throw error;
  }
};

// Convert ArrayBuffer to base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Register service worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

// Request push notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission;
  }
  return 'denied';
};

// Check if push notifications are supported
export const isPushNotificationSupported = (): boolean => {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

// Subscribe user to push notifications
export const subscribeUserToPush = async (token: string): Promise<boolean> => {
  try {
    console.log('🔔 Attempting to subscribe to push notifications...');
    
    // Check if push notifications are supported
    if (!isPushNotificationSupported()) {
      console.log('❌ Push notifications are not supported on this device/browser');
      return false;
    }

    // Request notification permission
    const permission = await requestNotificationPermission();
    console.log(`🔔 Notification permission: ${permission}`);
    
    if (permission !== 'granted') {
      console.log('❌ Notification permission denied or not granted');
      if (permission === 'denied') {
        console.log('   User has permanently denied notifications. They need to enable it in browser settings.');
      }
      return false;
    }

    // Register service worker
    console.log('📱 Registering service worker...');
    const registration = await registerServiceWorker();
    if (!registration) {
      console.log('❌ Service Worker registration failed');
      return false;
    }
    console.log('✅ Service Worker registered successfully');

    // Wait for service worker to be ready
    console.log('⏳ Waiting for service worker to be ready...');
    await navigator.serviceWorker.ready;
    console.log('✅ Service Worker is ready');

    // Get VAPID public key
    const vapidPublicKey = await getVapidPublicKey();

    // Convert VAPID key to Uint8Array
    const vapidKey = urlBase64ToUint8Array(vapidPublicKey);

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey
    });

    // Send subscription to server
    await subscribeToPush(subscription, token);

    console.log('✅ Successfully subscribed to push notifications');
    console.log('   Endpoint:', subscription.endpoint.substring(0, 50) + '...');
    return true;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return false;
  }
};

// Unsubscribe user from push notifications
export const unsubscribeUserFromPush = async (token: string): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await unsubscribeFromPush(subscription, token);
      console.log('Successfully unsubscribed from push notifications');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
};

// Convert VAPID key from URL-safe base64 to Uint8Array
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

