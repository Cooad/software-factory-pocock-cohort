# The theme follows the OS unless this browser saved a choice

The theme is Light, Dark or System. With nothing saved, Cadence follows the
operating system's colour scheme, and keeps following it while the page is
open. A saved `light` or `dark` under `localStorage['cadence-theme']` wins
over the OS; choosing System removes the saved value.

Choices saved by the old two-state toggle keep their meaning. A learner who
picked Dark before this change stays dark under a light OS until they pick
System.

## Considered Options

- **Move existing `dark`/`light` values to System.** Rejected: it overrides
  a choice people made on purpose.
- **Save the theme per account.** Rejected: it needs a schema change, and
  the theme has to be known before the page paints, which a per-browser value
  gives for free.

## Consequences

The theme is per browser: a learner who uses two machines picks it on each.
