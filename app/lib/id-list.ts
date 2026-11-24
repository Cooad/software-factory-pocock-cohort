import { z } from "zod";

/**
 * A form field holding a JSON array of ids, such as `"[3,1,2]"`, as the
 * ids. Anything else fails with `message`.
 */
export function idListSchema(message: string) {
  return z
    .string()
    .transform((text): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })
    .pipe(
      z.array(z.number({ invalid_type_error: message }).int(message), {
        message,
      })
    );
}
