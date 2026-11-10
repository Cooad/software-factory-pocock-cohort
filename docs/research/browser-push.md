# What browser push takes in Cadence

Research for [#6](https://github.com/Cooad/software-factory-pocock-cohort/issues/6), part of the notifications map [#1](https://github.com/Cooad/software-factory-pocock-cohort/issues/1). Researched 2026-11-10 against primary sources (specs, MDN, web.dev, WebKit blog, the `web-push` README) plus the app's own code.

## Short answer

Browser push in Cadence needs five pieces, and none of them needs a long-running process:

1. **One VAPID key pair**, generated once and kept in server env vars.
2. **A service worker** at `/sw.js` (a plain file in `public/`) that handles `push` and `notificationclick`.
3. **A `push_subscriptions` table** in the SQLite file: one row per browser per User, holding `endpoint`, `p256dh` and `auth`.
4. **An opt-in button** in Cadence's own UI. The browser prompt may only appear after a click, and a user who denies it cannot be asked again.
5. **A server-side send** with the `web-push` package, called inline from the action that creates the Notification (like the mailer today). It deletes the subscription on a 404 or 410.

Limits: about **4 KB payload** at most, so send a title, short text and a URL, not the content. Set **TTL** explicitly; the library default is four weeks. Delivery is **best-effort**: a 201 means the push service accepted the message, not that it was shown.

Support: Chrome, Edge, Firefox and desktop Safari (macOS Ventura and later) work in a normal tab. **iPhone and iPad (16.4+) work only when Cadence is added to the Home Screen as a web app**, which needs a web app manifest Cadence does not have yet. So push cannot be the only channel for any Notification.

## 1. VAPID keys

- VAPID (RFC 8292) is how the application server identifies itself to a push service. It signs a JWT with an **ECDSA P-256 (ES256)** key and sends it as `Authorization: vapid t=<JWT>, k=<public key>`. The JWT's `aud` is the push service origin, `exp` is **at most 24 hours** out, and `sub` is an optional contact (`mailto:` or `https:`). [RFC 8292 §2, §2.1, §3](https://www.rfc-editor.org/rfc/rfc8292.html)
- The browser ties the subscription to the public key passed as `applicationServerKey` in `PushManager.subscribe()`. After that, every message must carry a JWT signed by the matching private key. Chrome and Edge **require** `applicationServerKey`. [MDN PushManager.subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [RFC 8292 §4](https://www.rfc-editor.org/rfc/rfc8292.html)
- `web-push` generates the pair with `webpush.generateVAPIDKeys()`. Generate it **once** and reuse it. Every existing subscription is bound to that public key, so rotating it orphans them all. The subject is set with `setVapidDetails(subject, publicKey, privateKey)`. Use a real `mailto:` or `https:` value: a placeholder such as `mailto:user@localhost` can be rejected by Apple with `403 BadJwtToken`. [web-push README](https://github.com/web-push-libs/web-push#readme)
- **For Cadence:** add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` env vars. The public key can be sent to the browser through loader data. The JWT signing and the payload encryption (RFC 8291) are done by `web-push`; neither needs a provider.

## 2. Service worker in React Router

- A page can only receive push through an **active service worker**. The browser starts it when a push arrives, even if no Cadence tab is open, and it fires a `push` event. That handler calls `self.registration.showNotification(...)`. Subscription changes arrive as `pushsubscriptionchange`. [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- **Every push must show a notification.** Subscribe with `userVisibleOnly: true`; Chrome rejects anything else. Safari revokes subscriptions that receive pushes without showing a notification: "The Web Push API is not an invitation for silent background runtime." [MDN subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)
- **Where the file lives:** React Router 8 builds with Vite. Vite serves `public/` at `/` in dev and copies it unhashed to the client build ([Vite: public directory](https://vite.dev/guide/assets.html)). `@react-router/serve` serves the client build directory and `public/` with `express.static` (`node_modules/@react-router/serve/dist/cli.js`, lines 115-120). So `public/sw.js` is served at `/sw.js`, and a worker served from the root gets scope `/` with no extra headers. It is plain JS and is not bundled. Nothing in React Router has to change.
- **Registration:** call `navigator.serviceWorker.register("/sw.js")` from a client-only effect, such as a `useEffect` in `app/root.tsx`, or only on the opt-in screen. It must not run during SSR. Requires HTTPS; `localhost` counts as secure in dev. [MDN subscribe(): secure context](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- The worker needs only `push` and `notificationclick` handlers (focus or open the Notification's URL). Offline caching is not needed.

## 3. Storing subscriptions

- `subscribe()` returns a `PushSubscription`. Its `toJSON()` gives `{ endpoint, expirationTime, keys: { p256dh, auth } }`, and `web-push`'s `sendNotification` takes exactly that shape. [MDN subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [web-push README](https://github.com/web-push-libs/web-push#readme)
- The endpoint is a **capability URL** (whoever knows it can send to it) and must be kept secret. MDN also warns to protect the subscribe endpoint against CSRF. [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- **For Cadence:** one row per (User, browser): `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at`, and optionally `user_agent` so Users can see "Chrome on Mac" in their settings. A User can have many rows (laptop, phone, second browser). A React Router action saves the row from a form post or `fetch`, and unsubscribing deletes it. Since the app uses one SQLite file through Drizzle (ADR 0006), this is an ordinary migration.

## 4. The permission prompt

- **It needs a user gesture.** Safari requires the subscribe request to come from an explicit action such as a click, and Firefox has required this since version 72. MDN says browsers are moving to "explicitly disallow notifications not triggered in response to a user gesture." [WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/), [WebKit: Web Push for iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [MDN subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [MDN requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static)
- **A denial is final.** "If the user blocks the permission request, your web app can't ask for permission again"; the User has to undo it in browser settings. [web.dev: Permission UX](https://web.dev/articles/push-notifications-permissions-ux)
- **Best practice** [web.dev](https://web.dev/articles/push-notifications-permissions-ux):
  - Never ask on page load.
  - Ask in context, when the benefit is obvious.
  - Show Cadence's own explanation and button first ("double permission"), and open the browser prompt only if the User accepts it.
  - Always offer a visible place to turn push off.
- **For Cadence:** put the opt-in in notification settings. Good moments to offer it in context are right after a Student posts a Question ("Get notified when someone replies?") and when an Instructor opens the Unanswered questions queue. If `Notification.permission === "denied"`, show how to re-enable it instead of a button that does nothing.

## 5. Browser support

| Browser | Push works? | Caveat |
| --- | --- | --- |
| Chrome / Edge (desktop and Android) | Yes | Needs `applicationServerKey` and `userVisibleOnly: true`. |
| Firefox (desktop and Android) | Yes | Pushes that don't show a notification count against a quota. Subscribe needs a gesture (since v72). |
| Safari on macOS | Yes, Safari 16+ on macOS Ventura+ | Uses Apple's push service. No Apple Developer account needed. Gesture required, and no silent pushes. |
| Safari on iOS / iPadOS | Only 16.4+, **only as a Home Screen web app** | Needs a web app manifest with `display: standalone` or `fullscreen`, and the User must "Add to Home Screen". Not available in a normal Safari tab. |

Push has been Baseline across browsers since March 2023. Use feature detection (`"PushManager" in window`, `"serviceWorker" in navigator`), not browser sniffing. [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/), [WebKit: Web Push for iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

- Apple's endpoints are on `*.push.apple.com`. Allow that host if outbound traffic is ever restricted. [WebKit: Web Push for iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **For Cadence:** there is no `manifest.webmanifest` today; `public/` holds only `favicon.svg` and `images/`. iPhone users would need a manifest, home-screen icons and an "install Cadence" hint before they could opt in. Most iPhone Students will never do this, so **email or in-app has to cover every Notification**, and push is an extra channel.

## 6. Sending inline vs needing a worker

- Sending one push is **a single HTTPS POST** to the subscription's `endpoint`, with an encrypted body and VAPID header. `webpush.sendNotification(subscription, payload, options)` returns a promise that resolves or rejects with `statusCode`, `headers` and `body`. It has a `timeout` option (socket timeout in ms, unset by default). [web-push README](https://github.com/web-push-libs/web-push#readme)
- **Queueing and retrying while the device is offline is the push service's job** (FCM, Mozilla autopush, Apple). It holds the message for up to the TTL. [RFC 8030 §5.2](https://www.rfc-editor.org/rfc/rfc8030.html)
- **For Cadence:** push works the same way `mailer.server.ts` already does, so it can be **sent inline from the action that creates the Reply or Notification**. It needs no job runner. Things to be careful about:
  - Send to all of a recipient's subscriptions in parallel (`Promise.allSettled`).
  - Set a short `timeout` (for example 5 s) so a slow push service can't stall the request.
  - Never let a push failure fail the user's action: log it and continue.
  - A Reply that fans out to many thread participants means many POSTs in one request. That is fine at Cadence's size. A queue becomes worth it only together with digests and email retries (map #1, "Delivery infrastructure"), not because of push.
  - Push never needs a long-running process on Cadence's side.

## 7. Payload size, TTL, urgency, topic

- **Size:** push services "MUST NOT return a 413 status code" for bodies of **4096 bytes or less**. Anything larger may be rejected. That limit applies to the encrypted body, so the usable plaintext is somewhat less. [RFC 8030 §7.2](https://www.rfc-editor.org/rfc/rfc8030.html), [web.dev: Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol)
  - **For Cadence:** send small JSON such as `{ title, body (truncated excerpt), url, tag }`. The click opens the Comment's page for the rest.
- **TTL (required header):** how many seconds the push service keeps an undelivered message. It may keep it for less than asked, and TTL 0 means "deliver now or drop". `web-push`'s default is **four weeks**. [RFC 8030 §5.2](https://www.rfc-editor.org/rfc/rfc8030.html), [web-push README](https://github.com/web-push-libs/web-push#readme)
  - **For Cadence:** pick a TTL per Notification type. A Reply alert loses its value after a day or two, so something like 1-2 days fits better than four weeks.
- **Urgency:** `very-low`, `low`, `normal` (default) or `high`. Push services use it to save battery. [RFC 8030 §5.3](https://www.rfc-editor.org/rfc/rfc8030.html)
- **Topic:** up to 32 base64url characters. A new message with the same Topic **replaces** a queued one for that subscription, which helps with "3 new replies in thread X" collapsing. [RFC 8030 §5.4](https://www.rfc-editor.org/rfc/rfc8030.html)
  - On the device side, the notification `tag` in `showNotification` replaces an existing notification with the same tag.
- **Rate limits:** a 429 comes with `Retry-After`. Firefox limits pushes that don't show a notification. [web.dev: Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

## 8. Expired subscriptions (404 / 410)

- RFC 8030 says a push service **MUST return 404** when a message is sent to an expired subscription (§7.3). In practice push services also return **410 Gone** for subscriptions that were unsubscribed or are no longer valid. web.dev's guidance is to delete the subscription on both:
  - 404: "the subscription is expired and can't be used"
  - 410: "The subscription is no longer valid and should be removed from application server"

  [RFC 8030 §7.3](https://www.rfc-editor.org/rfc/rfc8030.html), [web.dev: Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol)
- Other status codes:
  - 201: accepted, **not** delivered.
  - 400: bad headers.
  - 413: payload too large.
  - 429: rate limited.

  [RFC 8030 §5](https://www.rfc-editor.org/rfc/rfc8030.html), [web.dev](https://web.dev/articles/push-notifications-web-push-protocol)
- Subscriptions can also change on the client and fire `pushsubscriptionchange` in the service worker. The worker should re-subscribe and POST the new subscription to the server. [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- **For Cadence:** in the send helper, `catch (err) { if (err.statusCode === 404 || err.statusCode === 410) delete the row }`. As a further safeguard, re-sync on page load: if the browser has a subscription the server doesn't know about, save it again.

## Implications for the notifications spec

- Push is **opt-in per browser**, offered from Cadence's own UI after a click and never on load. Settings list a User's subscribed devices and let them turn push off.
- Push is **supplementary**. iPhone users only get it after "Add to Home Screen", and delivery is best-effort, so every pushed Notification must also exist in-app (and by email where the spec wants email).
- The **push payload is a pointer**: a short title, an excerpt and a link. The in-app Notification holds the content.
- The **TTL is set per Notification type**, and a Topic or tag collapses bursts within a thread.
- **No new infrastructure is needed** for push: send inline like email, with a short timeout and failures swallowed. The background-job question in map #1 depends on digests and retries, not on push.
- **No third-party provider is needed** for push. It involves no compliance problem like email unsubscribe rules; the browser owns the permission. `web-push` plus one table and one static file covers it. A hosted service such as OneSignal would only add value for cross-channel orchestration.

## Sources

- RFC 8030, Generic Event Delivery Using HTTP Push: https://www.rfc-editor.org/rfc/rfc8030.html
- RFC 8292, VAPID: https://www.rfc-editor.org/rfc/rfc8292.html
- MDN, Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN, PushManager.subscribe(): https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- MDN, Notification.requestPermission(): https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static
- web.dev, The Web Push Protocol: https://web.dev/articles/push-notifications-web-push-protocol
- web.dev, Permission UX: https://web.dev/articles/push-notifications-permissions-ux
- WebKit, Meet Web Push (Safari 16, macOS): https://webkit.org/blog/12945/meet-web-push/
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- `web-push` README: https://github.com/web-push-libs/web-push#readme
- Vite, The public directory: https://vite.dev/guide/assets.html
- Cadence code: `node_modules/@react-router/serve/dist/cli.js` (static serving), `app/lib/mailer.server.ts` (inline send), `public/` (no manifest yet)
