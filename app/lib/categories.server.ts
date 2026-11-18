import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { categories } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCategoryBySlug(db: Db, slug: string) {
  return db.select().from(categories).where(eq(categories.slug, slug)).get();
}

function getCategoryByName(db: Db, name: string) {
  return db.select().from(categories).where(eq(categories.name, name)).get();
}

export function createCategory(db: Db, name: string) {
  const slug = slugify(name);

  const existingName = getCategoryByName(db, name);
  if (existingName) {
    throw new Error(`A category with the name "${name}" already exists.`);
  }

  const existingSlug = getCategoryBySlug(db, slug);
  if (existingSlug) {
    throw new Error(`A category with the slug "${slug}" already exists.`);
  }

  return db.insert(categories).values({ name, slug }).returning().get();
}

export function updateCategory(db: Db, id: number, name: string) {
  const slug = slugify(name);

  const existingName = getCategoryByName(db, name);
  if (existingName && existingName.id !== id) {
    throw new Error(`A category with the name "${name}" already exists.`);
  }

  const existingSlug = getCategoryBySlug(db, slug);
  if (existingSlug && existingSlug.id !== id) {
    throw new Error(`A category with the slug "${slug}" already exists.`);
  }

  return db
    .update(categories)
    .set({ name, slug })
    .where(eq(categories.id, id))
    .returning()
    .get();
}
