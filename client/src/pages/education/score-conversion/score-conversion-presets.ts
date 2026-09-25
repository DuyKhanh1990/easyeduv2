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

type PresetPart = {
  name: string;
  minScore: number;
  maxScore: number;
  step: number;
  unit: string;
};

type Preset = Omit<ScoreConversionTemplateInput, "name" | "sections"> & {
  sectionDefaults: PresetPart[];
};

const presetDefinitions: Record<Exclude<ScoreConversionTypeKey, "custom">, Preset> = {
  starters: {
    typeKey: "starters",
    typeName: "Starters",
    sectionDefaults: [
      { name: "Listening", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Reading & Writing", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Speaking", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
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
      { name: "Listening", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Reading & Writing", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Speaking", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
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
      { name: "Listening", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Reading & Writing", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
      { name: "Speaking", minScore: 0, maxScore: 5, step: 1, unit: "khiên" },
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
      { name: "Reading", minScore: 100, maxScore: 150, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Writing", minScore: 100, maxScore: 150, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Listening", minScore: 100, maxScore: 150, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Speaking", minScore: 100, maxScore: 150, step: 1, unit: "điểm Cambridge English Scale" },
    ],
    overallRule: {
      method: "average",
      minScore: 100,
      maxScore: 150,
      roundingStep: null,
      unit: "điểm Cambridge English Scale",
      description: "Lấy điểm trung bình của 4 kỹ năng trên thang Cambridge English Scale.",
      gradeBands: [
        { id: crypto.randomUUID(), label: "A1", minScore: 100, maxScore: 119 },
        { id: crypto.randomUUID(), label: "A2", minScore: 120, maxScore: 139 },
        { id: crypto.randomUUID(), label: "B1", minScore: 140, maxScore: 150 },
      ],
    },
  },
  pet: {
    typeKey: "pet",
    typeName: "PET",
    sectionDefaults: [
      { name: "Reading", minScore: 120, maxScore: 170, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Writing", minScore: 120, maxScore: 170, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Listening", minScore: 120, maxScore: 170, step: 1, unit: "điểm Cambridge English Scale" },
      { name: "Speaking", minScore: 120, maxScore: 170, step: 1, unit: "điểm Cambridge English Scale" },
    ],
    overallRule: {
      method: "average",
      minScore: 120,
      maxScore: 170,
      roundingStep: null,
      unit: "điểm Cambridge English Scale",
      description: "Lấy điểm trung bình của 4 kỹ năng trên thang Cambridge English Scale.",
      gradeBands: [
        { id: crypto.randomUUID(), label: "A2", minScore: 120, maxScore: 139 },
        { id: crypto.randomUUID(), label: "B1", minScore: 140, maxScore: 159 },
        { id: crypto.randomUUID(), label: "B2", minScore: 160, maxScore: 170 },
      ],
    },
  },
  toeic: {
    typeKey: "toeic",
    typeName: "TOEIC",
    sectionDefaults: [
      { name: "Listening", minScore: 5, maxScore: 495, step: 5, unit: "điểm" },
      { name: "Reading", minScore: 5, maxScore: 495, step: 5, unit: "điểm" },
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
      { name: "Listening", minScore: 0, maxScore: 9, step: 0.5, unit: "band" },
      { name: "Reading", minScore: 0, maxScore: 9, step: 0.5, unit: "band" },
      { name: "Writing", minScore: 0, maxScore: 9, step: 0.5, unit: "band" },
      { name: "Speaking", minScore: 0, maxScore: 9, step: 0.5, unit: "band" },
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

function newId() {
  return crypto.randomUUID();
}

export function createDefaultDraft(
  typeKey: ScoreConversionTypeKey = "ielts",
  name = "",
): ScoreConversionTemplateInput {
  if (typeKey === "custom") {
    return {
      name,
      typeKey,
      typeName: "",
      sections: [{
        id: newId(),
        name: "Phần thi 1",
        minScore: 0,
        maxScore: 100,
        step: 1,
        unit: "điểm",
      }],
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
    name,
    typeKey,
    typeName: preset.typeName,
    sections: preset.sectionDefaults.map((section) => ({
      id: newId(),
      ...section,
    })),
    overallRule: {
      ...preset.overallRule,
      gradeBands: preset.overallRule.gradeBands.map((band) => ({ ...band, id: newId() })),
    },
  };
}

export function draftFromTemplate(
  template: ScoreConversionTemplate,
): ScoreConversionTemplateInput {
  return {
    name: template.name,
    typeKey: template.typeKey,
    typeName: template.typeName,
    sections: template.sections.map((section) => ({ ...section })),
    overallRule: {
      ...template.overallRule,
      gradeBands: template.overallRule.gradeBands.map((band) => ({ ...band })),
    },
  };
}