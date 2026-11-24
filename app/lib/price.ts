import { z } from "zod";

const notANumber = "Price must be a non-negative number.";

/**
 * A price typed in dollars, as the cents the server stores. The editor
 * parses with this too, so it compares like with like before it saves.
 */
export const priceInCentsSchema = z
  .string()
  .trim()
  .min(1, notANumber)
  .pipe(
    z.coerce
      .number({ invalid_type_error: notANumber })
      .min(0, notANumber)
      .max(9999.99, "Price cannot exceed $9,999.99.")
  )
  .transform((dollars) => Math.round(dollars * 100));
