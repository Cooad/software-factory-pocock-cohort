# Should a notification provider own Cadence's delivery?

Research for [#7](https://github.com/Cooad/software-factory-pocock-cohort/issues/7), under map [#1 Notifications for Cadence](https://github.com/Cooad/software-factory-pocock-cohort/issues/1).
All sources retrieved **2026-11-10**. Vendor pricing and docs change often; re-check before signing up.

## Question

Can a third party own Cadence's notifications (in-app, email via our Postmark, browser push), including user preferences, one-click unsubscribe and GDPR, so Cadence does not hand-roll compliance? Candidates: Knock, Novu (cloud and self-hosted), Courier, OneSignal, MagicBell, and hand-rolling on Postmark as the baseline.

App context: React Router 8 + React 19, a Node server, one SQLite file via Drizzle, a Postmark mailer (`app/lib/mailer.server.ts`) that sends inline in the request, and **no background job runner**.

## Short answer

**Use Novu Cloud in its EU region, on the Free tier, with our Postmark account plugged in as the email provider.** It is the only candidate that offers all of these, verified on its own pages:

- a React `<Inbox />` and `<Preferences />` component
- Postmark as a bring-your-own provider
- digests
- EU data residency on the free plan
- an MIT-licensed core you can self-host if you leave the cloud

Two things stay with Cadence whichever option is chosen:

1. **GDPR cannot be outsourced.** Cadence stays the controller. A provider adds a processor, which means signing its DPA, listing it as a subprocessor, and deleting the user's data there when they are erased. Picking a provider moves where the data lives. It does not remove the duty.
2. **Novu has no first-class RFC 8058 one-click unsubscribe.** Cadence needs a small signed unsubscribe endpoint that flips the Novu preference, plus `List-Unsubscribe` headers sent as provider overrides. Most of Cadence's notifications (Replies, Questions) are transactional, so the headers are good practice rather than a legal requirement (see [Postmark](#hand-roll-on-postmark-baseline)).

## Comparison

| | Knock | Novu Cloud | Novu self-hosted | Courier | OneSignal | MagicBell | Hand-roll on Postmark |
|---|---|---|---|---|---|---|---|
| React in-app inbox | Yes (feed) | Yes, `<Inbox />` | Yes, `<Inbox />` (no snooze) | Yes (Courier Inbox) | In-app messages (marketing-style, not a feed) | Yes (Inbox) | Build it |
| Email via our Postmark | Yes | Yes | Yes | Yes | **No** (SendGrid, Mailgun, Mailchimp or its own) | Yes | Already have it |
| Web push | Via FCM or OneSignal; no first-party web push | Yes (push providers) | Yes | Yes | Yes, its core product | Yes | Build it (Web Push + VAPID) |
| Preferences UI | Yes, plus a hosted preference center | Yes, `<Preferences />` | Yes | Yes, hosted page | Segments and subscriptions | Per channel and category | Build it |
| One-click unsubscribe | Commercial messages only; header names not documented | Not native (open feature request) | Same as Cloud | Per-topic `List-Unsubscribe` headers | Documented header and link | Not found | Postmark does it on Broadcast streams |
| Digests and batching | Yes, batch function | Yes, digest step | Yes | Yes | No | Not found | Build it, which needs a job runner |
| EU data residency | **No**, "expected by end of 2026" | Yes, on Free | Wherever you host it | Business plan only | Primary data centres in the EU | Not found | Postmark's own hosting |
| DPA | Not on the pricing page; "GDPR certified" | Downloadable (Cloud) | Not applicable (you are the operator) | Enterprise ("MSA/DPA/BAA") | Growth plan | Not found | Postmark's DPA |
| Free tier | 10k messages a month | 10k workflow runs a month | Free (your infrastructure) | 10k sends a month | 10k emails a month, push for 1k MAU | 1k deliveries a month | — |
| First paid step | $250 a month | From $30 a month | — | $0.005 per send | From $19 a month | $249 a month | — |
| Lock-in | Proprietary | MIT core, can self-host | Low | Proprietary | Proprietary, owns email and push | Proprietary | None |

## Findings per candidate

### Knock

- **Pricing:** Free covers 10,000 messages a month, unlimited workflows and channels, and 30-day logs. Starter is $250 a month with 50,000 messages, then $0.005 each. Knock does not bill for downstream providers such as Postmark. Preferences, digests and batching, and in-app feeds are on all plans. [knock.app/pricing](https://knock.app/pricing)
- **Postmark:** A first-class email channel with a delivery-status webhook. Knock sends on Postmark's transactional "outbound" stream unless you override `MessageStream`. [docs.knock.app/integrations/email/postmark](https://docs.knock.app/integrations/email/postmark)
- **Web push:** "Knock does not have a first-party web push channel". Web push goes through FCM, or through OneSignal as a push channel. [Web push with FCM tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm), [OneSignal integration](https://docs.knock.app/integrations/push/one-signal)
- **Unsubscribe:** Workflows marked commercial get "required unsubscribe headers" (header names not given) and an unsubscribe link. Clicking it sets `commercial_subscribed=false`, and transactional messages keep flowing. [Commercial unsubscribe](https://docs.knock.app/preferences/commercial-unsubscribe). There is a hosted preference center at p.knock.app, reached through signed links that do not expire. [Hosted preference center](https://docs.knock.app/preferences/hosted-preference-center)
- **Batching:** Fixed, dynamic, relative and sliding windows, open up to 90 days. Templates render the first or last 10 activities, or up to 100 on Enterprise. [Batch function](https://docs.knock.app/designing-workflows/batch-function)
- **GDPR and residency:** Knock says it is "GDPR certified". "EU data residency is coming soon… by the end of 2026." The security page gives no hosting location; it points to trust.knock.app. [docs.knock.app/security](https://docs.knock.app/security)

### Novu (Cloud)

- **Pricing:** Free is $0 for 10,000 workflow runs a month, 5 workflows, 3 team members and 24-hour activity-feed (log) retention. All channels, and US and EU data residency, are on Free. Pro starts at $30 a month for 30,000 runs, 20 workflows and 7-day retention. Team starts at $250 a month. Extra runs cost $1.20 per 1,000. Self-hosting with enterprise features is an Enterprise option. [novu.co/pricing](https://novu.co/pricing)
- **EU region:** The API is at `https://eu.api.novu.co`. [docs.novu.co/api](https://docs.novu.co/api)
- **Postmark:** Supported as an email integration: add the server token and a verified sender. [docs.novu.co/platform/integrations/email/postmark](https://docs.novu.co/platform/integrations/email/postmark)
- **Digest:** One digest step per workflow, with a time window or cron. Steps after the digest run when the window closes. Content is captured at trigger time. [Workflow and steps reference](https://docs.novu.co/.mintlify/skills/framework-integration/references/workflow-and-steps)
- **Preferences:** Workflow-level settings rank above subscriber global settings, which rank above per-workflow subscriber settings. "Critical" workflows are hidden from preferences and cannot be turned off. [Preferences concepts](https://docs.novu.co/platform/concepts/preferences), [Inbox preferences](https://docs.novu.co/platform/inbox/configuration/preferences)
- **One-click unsubscribe:** There is no documented RFC 8058 support. An open feature request asks for `List-Unsubscribe` and `List-Unsubscribe-Post` support and notes that today you can only pass raw headers through provider overrides. [novuhq/novu#12837](https://github.com/novuhq/novu/issues/12837)

### Novu (self-hosted Community edition)

- **Licence:** An MIT core. The `enterprise/` folder is under a commercial licence. [github.com/novuhq/novu](https://github.com/novuhq/novu)
- **Included:** All channels, digest, the Inbox components (bell, inbox and user preferences), and code-based and GUI workflows.
- **Cloud only:** Snooze, removing Novu branding, email delivery tracking, more than two environments, SSO, RBAC, a team of more than one, the downloadable DPA and certifications. GDPR compliance "depends on your installation". [Self-hosted and Novu Cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud)
- **Infrastructure:** A single-VM setup needs 4 vCPU and 8 GB RAM, plus MongoDB, Redis with AOF, and S3-compatible storage. [Self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview). That is far heavier than Cadence's one SQLite file, so self-hosting is an exit route, not a starting point.

### Courier

- **Pricing:** Developer is free up to 10,000 sends a month. Business is pay-as-you-go at $0.005 per send and adds EU data residency. The DPA is listed under Enterprise ("MSA/DPA/BAA legal terms"). [courier.com/pricing](https://www.courier.com/pricing)
- **EU datacenter:** Ireland, on Business and Enterprise. It is a separate workspace at `api.eu.courier.com`. [EU datacenter](https://www.courier.com/docs/platform/workspaces/eu-datacenter)
- **Postmark:** Supported. [Courier Postmark integration](https://www.courier.com/docs/integrations/email/postmark)
- **Preferences:** A hosted preference page. Each topic has an "Unsubscribe Headers" toggle (`include_unsubscribe_header`) that makes Gmail and Apple Mail show a native unsubscribe button. [Hosted page](https://www.courier.com/docs/platform/preferences/hosted-page)
- **Verdict:** Strong on compliance, but EU residency and the DPA both sit behind paid tiers.

### OneSignal

- **Pricing:** Free gives 10,000 emails a month and unlimited mobile push for up to 1,000 MAU. Web push on Free is capped at 10,000 subscribers per send. Growth starts at $19 a month. Growth comes with a DPA. [onesignal.com/pricing](https://onesignal.com/pricing)
- **EU:** "Our primary data centers are located in the European Union", and OneSignal is certified under the EU–US Data Privacy Framework. [Data and security FAQ](https://documentation.onesignal.com/docs/data-questions)
- **Email:** OneSignal sends through its own email service, SendGrid, Mailgun (US region only) or Mailchimp/Mandrill. **Postmark is not listed.** Suppression-list management is available only with OneSignal Email. [Email setup](https://documentation.onesignal.com/docs/email-setup), [Mailgun setup](https://documentation.onesignal.com/docs/mailgun-setup)
- **Verdict:** A push and marketing tool. It has no notification-feed inbox or digest engine, and it cannot use our Postmark. Not a fit as the owner of delivery. It is usable only as a web-push pipe behind another provider.

### MagicBell

- **Pricing:** Builder is free for 1,000 deliveries a month. Startup is $249 a month for 50,000. Each channel a user receives counts as a separate delivery. [magicbell.com/pricing](https://www.magicbell.com/pricing)
- **Channels:** Postmark is supported, but Postmark templates are not supported by default. [magicbell.com/docs/email/postmark](https://magicbell.com/docs/email/postmark). Preferences are per channel and category. [Categories](https://magicbell.com/docs/categories)
- **Not found in its docs:** digests, one-click unsubscribe, EU residency, a DPA.
- **Verdict:** The free tier is too small, because one Reply that goes to inbox and email uses two deliveries, and the compliance story is undocumented.

### Hand-roll on Postmark (baseline)

- **Broadcast streams:** Postmark adds a footer unsubscribe link and RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` headers by default, and suppresses recipients who unsubscribe. **Transactional streams:** unsubscribe links and headers are not required. Postmark passes them through if you add them, but does not add them itself. [How to include a List-Unsubscribe header](https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header)
- **Suppression events:** The Subscription Change webhook reports suppressions (hard bounce, spam complaint, manual or unsubscribe) and reactivations for each message stream. A suppressions API offers dump, create and delete. [Subscription change webhook](https://postmarkapp.com/developer/webhooks/subscription-change-webhook)
- **What you would build:** a notifications table and inbox UI; a preferences model and UI; a signed one-click endpoint; Web Push with VAPID keys, subscription storage and a service worker; and digests. **Digests and retries need a background job runner, which Cadence does not have.** That is the biggest cost of hand-rolling.

## Why Novu Cloud (EU)

1. **It meets the stated preference.** Map #1 prefers a third party over hand-rolling compliance. Novu Cloud gives preferences storage and UI, critical vs. opt-out workflows, a DPA, and EU residency on Free.
2. **It removes the missing job runner.** Digest and delay windows run in Novu's hosted pipeline, so Cadence only fires triggers from the request. That fits today's inline-send model.
3. **It keeps Postmark.** Sender reputation, DNS and the existing account stay as they are.
4. **It is cheap at Cadence's scale.** Hundreds to a few thousand users fit inside 10,000 runs a month, assuming each trigger is one run. If they don't, Pro starts at $30 a month. Knock and MagicBell both jump to about $250 a month at their first paid tier.
5. **Lock-in is bounded.** The core is MIT and self-hostable, and the `<Inbox />` is the same component in both editions.

**Runner-up: Knock.** It has the most polished preferences and commercial unsubscribe, a hosted preference center, and a generous free tier. But it has **no EU residency until "end of 2026"** and jumps to $250 a month at the first paid tier. Revisit it if Knock ships EU residency.

## Implications for the spec (map #1)

- **Delivery infrastructure:** No background job runner is needed. Novu owns digests and delays, and Cadence calls `novu.trigger(workflowId, { to: userId, payload })` from the action that creates the Comment or Reply.
- **Preferences:** Model each notification kind as a Novu workflow. Mark the must-send ones "critical", for example Purchase or refund outcomes. Leave Reply and Question notifications opt-out-able per channel.
- **Unsubscribe:** The spec should require a signed, one-click unsubscribe URL in Cadence that updates the subscriber's Novu preference, sent as `List-Unsubscribe` + `List-Unsubscribe-Post` through Postmark provider overrides. This is good practice for notification email rather than a strict requirement, but Novu won't do it for us.
- **GDPR:** On account deletion, delete the Novu subscriber. Add Novu to the subprocessor list and sign its DPA. Use the EU API base URL.
- **Retention:** The pricing page shows 24-hour (Free) and 7-day (Pro) *activity-feed* (log) retention. **How long Inbox notifications themselves are kept per plan could not be confirmed from the pricing table.** Settle this before the spec commits to a retention policy.

## Open questions and unverified points

- How long Novu keeps Inbox notifications on each plan. The pricing table did not map cleanly.
- What exactly counts as a Novu "workflow run" for the 10k quota. The FAQ answer was not retrievable, and the assumption above is one trigger per recipient, one run.
- Which headers Knock's commercial unsubscribe adds (RFC 8058 or not).
- MagicBell's digest, EU and DPA position. Nothing was found in its docs.
- Knock's EU residency claim comes from its own security page. It is a roadmap statement, not a commitment.
