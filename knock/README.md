# Knock workflows

The repo is the source of truth for Cadence's Knock workflows. Each folder in `knock/workflows/` is one workflow, in the Knock CLI's file format. Change them here and push them; don't edit them in the dashboard.

| Workflow key | Notification | Category |
|---|---|---|
| `refund-request-confirmation` | Refund Request confirmation | `refund-request-updates` |
| `refund-request-approved` | Refund Request approved | `refund-request-updates` |
| `refund-request-declined` | Refund Request declined | `refund-request-updates` |
| `open-refund-request` | Open Refund Request | `open-refund-requests` |
| `seat-claimed` | Seat claimed | `seat-claims` |
| `new-enrollment` | New Enrollment | `enrollments` |
| `discussion-question` | Discussion Question | `discussion-questions` |
| `discussion-reply` | Discussion Reply | `discussion-replies` |

Every workflow has one step, `feed`: an in-app feed step on the `cadence-feed` channel (the channel whose id is `KNOCK_FEED_CHANNEL_ID`). Cadence writes the row text and link itself from the trigger data, so the step's markdown body is only a fallback. To add email later, add a second channel step after `feed`.

## Adding a workflow

Each Notification kind has one workflow. To add one, follow "Adding a kind" at the top of `app/lib/notifications.ts`, copy a folder here, rename it to the kind's workflow key (`WORKFLOW_KEY_BY_KIND` in `app/lib/notifications.knock.ts`) and set its `categories` to the kind's category (`PREFERENCE_CATEGORY_BY_KIND`). `app/lib/knock-workflows.test.ts` fails if a folder and the code disagree.

## Pushing

You need the Knock CLI logged in (`npx @knocklabs/cli login`) or a service token (`--service-token`).

```bash
npm run knock:validate   # validate the files against Knock Development
npm run knock:push       # push all workflows to Development and commit them
npm run knock:check      # trigger each workflow against a throwaway user; all must be 2xx
```

`knock:push` runs `knock workflow push --all --workflows-dir knock/workflows --environment development --commit`. Pushing again with no changes creates no new commit. Knock 404s on triggering a workflow that isn't committed, and a workflow's category only exists at runtime once it's committed.

Promote to other environments with `npx @knocklabs/cli commit promote --to <environment>`, only when that's been agreed.

## Preference categories must exist first

Knock rejects a workflow whose category isn't in the project's preference category catalog ("must exist in the project's preference category catalog"). The CLI can't create categories. Create the six categories above once, in the Knock dashboard or with the Management API (`PUT /v1/preference_categories/{name}`). They belong to the project, not to an environment.
