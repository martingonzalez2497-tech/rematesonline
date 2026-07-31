self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.titulo || "¿Quién Da Más?", {
      body: data.cuerpo || "Tenés una notificación",
      icon: "/fotos/icon-192.png",
      badge: "/fotos/icon-192.png",
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/")
  );
});
