/* global self, clients */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const data = payload.data || {};
  const title = payload.title || "EasyEdu";
  const body = payload.body || "Bạn có thông báo mới";
  const notificationOptions = {
    body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: {
      ...data,
      url: payload.url || data.url || "",
    },
    tag: data.referenceId ? `${data.type || "notification"}-${data.referenceId}` : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || (
    data.type === "chat" && data.referenceId
      ? `/chat?topicId=${encodeURIComponent(data.referenceId)}`
      : "/"
  );
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client) {
            return client.navigate(absoluteUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      return clients.openWindow(absoluteUrl);
    }),
  );
});