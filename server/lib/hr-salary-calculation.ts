export type HrPayType = "fixed" | "hourly";

export type HrSalaryConfigLike = {
  locationId: string | null;
  roleName: string | null;
  payType?: string | null;
  luongCB?: string | number | null;
};

export type HrAttendancePayInput = {
  staffId: string;
  locationId: string;
  workedHours: number;
  actualUnits: number;
};

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

export function calculateHrPayrollBasePay<T extends HrSalaryConfigLike>(input: {
  configs: readonly T[];
  attendance: readonly HrAttendancePayInput[];
  staffId: string;
  locationId: string;
  roleName: string | null;
  scheduledUnits: number;
}): {
  config: T | undefined;
  payType: HrPayType;
  rate: number;
  workedHours: number;
  actualUnits: number;
  basePay: number;
} {
  const hourlyConfig =
    input.configs.find(c => c.payType === "hourly" && c.locationId === input.locationId && c.roleName === input.roleName) ??
    input.configs.find(c => c.payType === "hourly" && c.locationId === input.locationId && !c.roleName) ??
    input.configs.find(c => c.payType === "hourly" && c.locationId == null && c.roleName === input.roleName) ??
    input.configs.find(c => c.payType === "hourly" && c.locationId == null && !c.roleName);
  const fixedConfig = input.configs.find(c => c.locationId === input.locationId);
  const config = hourlyConfig ?? fixedConfig;
  const payType: HrPayType = config?.payType === "hourly" ? "hourly" : "fixed";
  const rate = config ? Math.round(parseFloat(String(config.luongCB ?? 0))) : 0;
  const attendance = input.attendance.filter(
    row => row.staffId === input.staffId && row.locationId === input.locationId,
  );
  const workedHours = attendance.reduce((sum, row) => sum + (Number(row.workedHours) || 0), 0);
  const actualUnits = attendance.reduce((sum, row) => sum + (Number(row.actualUnits) || 0), 0);

  return {
    config,
    payType,
    rate,
    workedHours,
    actualUnits,
    basePay: calculateHrBasePay({
      payType,
      rate,
      workedHours,
      scheduledUnits: input.scheduledUnits,
      actualUnits,
    }),
  };
}
