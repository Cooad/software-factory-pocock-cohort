# Coding standards

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

## A comment says why, never how

The code already says how it works. A comment that says it again breaks DRY:
the same knowledge now lives in two places, and when the code changes the
comment is left behind, telling the next reader something false.

Write a comment only for what the code cannot say: why it is done this way,
the constraint it answers, the alternative you rejected. Name the reason, not
the steps.

```ts
// Bad: restates the code.
// Adds the Bookmark if the Lesson has none, removes it if it has one.

// Good: the reason the code can't show.
// Integer cents: summing floats loses pennies (ADR 0005).
```

Section banners (`// ─── Bookmarks ───`) and docstrings that repeat a
function's name and signature are restatements too. If the code needs a
comment to be understood, rename or restructure it first.

## Tests go through the module's exported functions

A test exercises the module the way its callers do: it calls the functions
the module exports, and checks the result with those functions too. It does
not query or write `db` directly to perform the behaviour or to check it.

```ts
// Bad: proves a constraint the caller never meets.
expect(() => db.insert(schema.notes).values({ ... }).run()).toThrow();

// Good: the behaviour a Student sees.
saveNote(db, userId, lessonId, "First", at(0));
saveNote(db, userId, lessonId, "Second", at(1));
expect(listNotes(db, userId)).toHaveLength(1);
```

Setup follows the same rule. When a test needs a row that no module function
creates, add that function to the module that owns the row, and call it from
the test.
