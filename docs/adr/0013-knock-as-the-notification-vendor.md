# Deliver Notifications through Knock

Cadence sends its Notifications through Knock, a hosted vendor. Knock was the only candidate whose free tier covers everything we need: in production it requires signed RS256 user tokens for the Notification Feed, it stores preferences per category × channel, and it has a headless feed API and a Node SDK. Email goes out through our existing Postmark account, connected to Knock as its email provider, so email needs no new sign-up.

## Considered Options

- **MagicBell.** It has built-in web push, but the free tier is only 1K deliveries a month and the next tier is $249/mo. Web push is only an extra channel people opt into, so it didn't justify the trade.
- **Courier.** Runner-up, with scoped JWTs, topic × channel preferences and pay-as-you-go at $0.005/send. It is the escape route if Knock's pricing stops fitting.
- **Novu Cloud.** Rejected: its feed auth is a static HMAC that never expires, and its preferences have no categories.
- **SuprSend.** Rejected: vendor-stored preferences aren't on its free plan.

## Consequences

- **Web push needs Firebase.** Knock has no web push of its own, so web push needs Firebase Cloud Messaging: a Firebase project, the Firebase SDK and a service worker. We add those only if web push is in scope.
- **Steep paid tier.** Knock counts every delivery on every channel as a message, and after the 10K messages a month on the free Developer plan, the Starter plan jumps straight to $250/mo. Review the vendor when usage approaches 10K messages a month.
