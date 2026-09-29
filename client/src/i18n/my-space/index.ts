import { assignmentsTranslations } from "./assignments";
import { mySpaceCalendarTranslations } from "./calendar";
import { donTuTranslations } from "./don-tu";
import { mySpaceInvoices } from "./invoices";
import { payrollTranslations } from "./payroll";
import { scoreSheetTranslations } from "./score-sheet";

type Locale = "vi" | "en";
type TranslationMap = Record<string, string>;

const resources = [
  assignmentsTranslations,
  mySpaceCalendarTranslations,
  donTuTranslations,
  mySpaceInvoices,
  payrollTranslations,
  scoreSheetTranslations,
];

export const mySpaceTranslations: Record<Locale, TranslationMap> = {
  vi: Object.assign({}, ...resources.map((resource) => resource.vi)),
  en: Object.assign({}, ...resources.map((resource) => resource.en)),
};