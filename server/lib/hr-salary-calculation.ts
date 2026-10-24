export type HrPayType = "fixed" | "hourly";

export function calculateHrBasePay(input: {
  payType: HrPayType;
  rate: number;
  workedHours: number;
  scheduledUnits: number;
  actualUnits: number;
}): number {
  if (input.payType === "hourly") {
    return Math.round(input.rate * Math.max(0, input.workedHours));
  }
  return input.scheduledUnits > 0
    ? Math.round((input.rate / input.scheduledUnits) * input.actualUnits)
    : 0;
}
