import { z } from "zod";

/**
 * A form field holding a JSON array of ids, such as `"[3,1,2]"`, as the
 * ids. Anything else fails with `message`.
 */
export function idListSchema(message: string) {
  return z
    .string()
    .transform((text, context): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
    })
    .pipe(
      z.array(z.number({ invalid_type_error: message }).int(message), {
        message,
      })
    );
}
