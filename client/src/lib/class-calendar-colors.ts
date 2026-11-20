export const CLASS_CALENDAR_COLORS = [
  "bg-pink-50 text-pink-800 border-pink-200",
  "bg-blue-50 text-blue-800 border-blue-200",
  "bg-purple-50 text-purple-800 border-purple-200",
  "bg-green-50 text-green-800 border-green-200",
  "bg-orange-50 text-orange-800 border-orange-200",
  "bg-yellow-50 text-yellow-800 border-yellow-200",
  "bg-teal-50 text-teal-800 border-teal-200",
  "bg-red-50 text-red-800 border-red-200",
  "bg-indigo-50 text-indigo-800 border-indigo-200",
  "bg-cyan-50 text-cyan-800 border-cyan-200",
] as const;

export function getClassCalendarColor(classId: string) {
  let hash = 0;
  for (let i = 0; i < classId.length; i++) {
    hash = (hash * 31 + classId.charCodeAt(i)) & 0xffffffff;
  }
  return CLASS_CALENDAR_COLORS[Math.abs(hash) % CLASS_CALENDAR_COLORS.length];
}