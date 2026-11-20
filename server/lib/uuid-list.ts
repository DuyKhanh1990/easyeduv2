import { z } from "zod";

const uuidSchema = z.string().uuid();

export function uniqueUuidStrings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && uuidSchema.safeParse(value).success,
      ),
    ),
  ];
}
