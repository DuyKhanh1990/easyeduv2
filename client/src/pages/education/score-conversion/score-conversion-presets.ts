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
type PresetBand = Omit<ScoreConversionTemplateInput["overallRule"]["gradeBands"][number], "id">;
type Preset = {
  typeKey: Exclude<ScoreConversionTypeKey, "custom">;
  typeName: string;
  sectionDefaults: PresetSection[];
  overallRule: Omit<ScoreConversionTemplateInput["overallRule"], "gradeBands"> & {
    gradeBands: PresetBand[];
  };
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
      minScore: 0,
      maxScore: 15,
      roundingStep: null,
      unit: "khiên",
      description: "Cộng số khiên của 3 kỹ năng; tối đa 15 khiên.",
      gradeBands: [],
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
      minScore: 0,
      maxScore: 15,
      roundingStep: null,
      unit: "khiên",
      description: "Cộng số khiên của 3 kỹ năng; tối đa 15 khiên.",
      gradeBands: [],
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
      minScore: 0,
      maxScore: 15,
      roundingStep: null,
      unit: "khiên",
      description: "Cộng số khiên của 3 kỹ năng; tối đa 15 khiên.",
      gradeBands: [],
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
      minScore: 100,
      maxScore: 150,
      roundingStep: null,
      unit: "điểm Cambridge English Scale",
      description: "Lấy điểm trung bình của 4 kỹ năng trên thang Cambridge English Scale.",
      gradeBands: [
        { label: "A1", minScore: 100, maxScore: 119 },
        { label: "A2", minScore: 120, maxScore: 139 },
        { label: "B1", minScore: 140, maxScore: 150 },
      ],
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
      minScore: 120,
      maxScore: 170,
      roundingStep: null,
      unit: "điểm Cambridge English Scale",
      description: "Lấy điểm trung bình của 4 kỹ năng trên thang Cambridge English Scale.",
      gradeBands: [
        { label: "A2", minScore: 120, maxScore: 139 },
        { label: "B1", minScore: 140, maxScore: 159 },
        { label: "B2", minScore: 160, maxScore: 170 },
      ],
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
      minScore: 10,
      maxScore: 990,
      roundingStep: null,
      unit: "điểm",
      description: "Cộng điểm Listening và Reading; tổng điểm tối đa 990.",
      gradeBands: [],
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
      minScore: 0,
      maxScore: 9,
      roundingStep: 0.5,
      unit: "band",
      description: "Lấy trung bình 4 kỹ năng và làm tròn đến 0,5 band gần nhất.",
      gradeBands: [],
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
        minScore: 0,
        maxScore: 100,
        roundingStep: null,
        unit: "điểm",
        description: "",
        gradeBands: [],
      },
    };
  }

  const preset = presetDefinitions[typeKey];
  return {
    typeKey,
    typeName: preset.typeName,
    sections: preset.sectionDefaults.map(makeSection),
    overallRule: {
      ...preset.overallRule,
      gradeBands: preset.overallRule.gradeBands.map((band) => ({ ...band, id: newId() })),
    },
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
    overallRule: {
      ...template.overallRule,
      gradeBands: template.overallRule.gradeBands.map((band) => ({ ...band })),
    },
  };
}

export function createEmptyMapping(): ScoreConversionTemplateInput["sections"][number]["mappings"][number] {
  return { id: newId(), rawFrom: 0, rawTo: 0, convertedScore: 0 };
}