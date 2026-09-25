import type {
  ScoreConversionTemplate,
  ScoreConversionTemplateInput,
  ScoreConversionTypeKey,
} from "@shared/score-conversion";

export const SCORE_CONVERSION_TYPES: Array<{ value: ScoreConversionTypeKey; label: string }> = [
  { value: "starters", label: "Starters" },
  { value: "movers", label: "Movers" },
  { value: "flyers", label: "Flyers" },
  { value: "ket", label: "KET" },
  { value: "pet", label: "PET" },
  { value: "toeic", label: "TOEIC" },
  { value: "ielts", label: "IELTS" },
  { value: "custom", label: "+ Tạo bài kiểm tra tùy chỉnh" },
];

type PresetSection = Omit<ScoreConversionTemplateInput["sections"][number], "id" | "mappings">;
type Preset = {
  typeKey: Exclude<ScoreConversionTypeKey, "custom">;
  typeName: string;
  sectionDefaults: PresetSection[];
  overallRule: ScoreConversionTemplateInput["overallRule"];
};

const part = (
  name: string,
  rawMinScore: number,
  rawMaxScore: number,
  rawStep: number,
  rawUnit: string,
  convertedMinScore: number,
  convertedMaxScore: number,
  convertedStep: number,
  convertedUnit: string,
): PresetSection => ({
  name,
  rawMinScore,
  rawMaxScore,
  rawStep,
  rawUnit,
  convertedMinScore,
  convertedMaxScore,
  convertedStep,
  convertedUnit,
});

const presetDefinitions: Record<Exclude<ScoreConversionTypeKey, "custom">, Preset> = {
  starters: {
    typeKey: "starters",
    typeName: "Starters",
    sectionDefaults: [
      part("Listening", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Reading & Writing", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Speaking", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
    ],
    overallRule: {
      method: "sum",
    },
  },
  movers: {
    typeKey: "movers",
    typeName: "Movers",
    sectionDefaults: [
      part("Listening", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Reading & Writing", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Speaking", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
    ],
    overallRule: {
      method: "sum",
    },
  },
  flyers: {
    typeKey: "flyers",
    typeName: "Flyers",
    sectionDefaults: [
      part("Listening", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Reading & Writing", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
      part("Speaking", 0, 100, 1, "điểm thô", 0, 5, 1, "khiên"),
    ],
    overallRule: {
      method: "sum",
    },
  },
  ket: {
    typeKey: "ket",
    typeName: "KET",
    sectionDefaults: [
      part("Reading", 0, 100, 1, "điểm thô", 100, 150, 1, "điểm Cambridge English Scale"),
      part("Writing", 0, 100, 1, "điểm thô", 100, 150, 1, "điểm Cambridge English Scale"),
      part("Listening", 0, 100, 1, "điểm thô", 100, 150, 1, "điểm Cambridge English Scale"),
      part("Speaking", 0, 100, 1, "điểm thô", 100, 150, 1, "điểm Cambridge English Scale"),
    ],
    overallRule: {
      method: "average",
    },
  },
  pet: {
    typeKey: "pet",
    typeName: "PET",
    sectionDefaults: [
      part("Reading", 0, 100, 1, "điểm thô", 120, 170, 1, "điểm Cambridge English Scale"),
      part("Writing", 0, 100, 1, "điểm thô", 120, 170, 1, "điểm Cambridge English Scale"),
      part("Listening", 0, 100, 1, "điểm thô", 120, 170, 1, "điểm Cambridge English Scale"),
      part("Speaking", 0, 100, 1, "điểm thô", 120, 170, 1, "điểm Cambridge English Scale"),
    ],
    overallRule: {
      method: "average",
    },
  },
  toeic: {
    typeKey: "toeic",
    typeName: "TOEIC",
    sectionDefaults: [
      part("Listening", 0, 100, 1, "điểm thô", 5, 495, 5, "điểm"),
      part("Reading", 0, 100, 1, "điểm thô", 5, 495, 5, "điểm"),
    ],
    overallRule: {
      method: "sum",
    },
  },
  ielts: {
    typeKey: "ielts",
    typeName: "IELTS",
    sectionDefaults: [
      part("Listening", 0, 40, 1, "câu đúng", 0, 9, 0.5, "band"),
      part("Reading", 0, 40, 1, "câu đúng", 0, 9, 0.5, "band"),
      part("Writing", 0, 9, 0.5, "band", 0, 9, 0.5, "band"),
      part("Speaking", 0, 9, 0.5, "band", 0, 9, 0.5, "band"),
    ],
    overallRule: {
      method: "average",
    },
  },
};

const newId = () => crypto.randomUUID();

function makeSection(section: PresetSection): ScoreConversionTemplateInput["sections"][number] {
  return { id: newId(), ...section, mappings: [] };
}

export function createDefaultDraft(typeKey: ScoreConversionTypeKey = "starters"): ScoreConversionTemplateInput {
  if (typeKey === "custom") {
    return {
      typeKey,
      typeName: "",
      sections: [makeSection(part("Phần thi 1", 0, 100, 1, "điểm thô", 0, 100, 1, "điểm"))],
      overallRule: {
        method: "average",
      },
    };
  }

  const preset = presetDefinitions[typeKey];
  return {
    typeKey,
    typeName: preset.typeName,
    sections: preset.sectionDefaults.map(makeSection),
    overallRule: { ...preset.overallRule },
  };
}

export function draftFromTemplate(template: ScoreConversionTemplate): ScoreConversionTemplateInput {
  return {
    typeKey: template.typeKey,
    typeName: template.typeName,
    sections: template.sections.map((section) => ({
      ...section,
      mappings: section.mappings.map((mapping) => ({ ...mapping })),
    })),
    overallRule: { ...template.overallRule },
  };
}

export function createEmptyMapping(): ScoreConversionTemplateInput["sections"][number]["mappings"][number] {
  return { id: newId(), rawFrom: 0, rawTo: 0, convertedScore: 0 };
}