import { sql } from "drizzle-orm";

const VIETNAMESE_DIACRITICS =
  "áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ";
const ASCII_REPLACEMENTS =
  "aaaaaaaaaaaaaaaaa" +
  "eeeeeeeeeee" +
  "iiiii" +
  "ooooooooooooooooo" +
  "uuuuuuuuuuu" +
  "yyyyy" +
  "d";

// Keep the client and server search behavior aligned for Vietnamese names.
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    ;
}

export function normalizedSearchSql(column: any) {
  return sql`translate(lower(${column}), ${VIETNAMESE_DIACRITICS}, ${ASCII_REPLACEMENTS})`;
}