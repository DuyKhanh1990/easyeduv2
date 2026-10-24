import { describe, expect, it } from "vitest";
import { calculateHrPayrollBasePay } from "./hr-salary-calculation";

const locationId = "location-a";
const otherLocationId = "location-b";
const staffId = "staff-1";

describe("HR payroll base pay integration", () => {
  it("selects the hourly role config and calculates pay from recorded shift hours", () => {
    const hourlyConfig = {
      locationId,
      roleName: "Nhân viên",
      payType: "hourly",
      luongCB: "50000",
    };

    const result = calculateHrPayrollBasePay({
      configs: [
        { ...hourlyConfig, luongCB: "40000", roleName: null },
        hourlyConfig,
        {
          locationId: otherLocationId,
          roleName: "Nhân viên",
          payType: "hourly",
          luongCB: "90000",
        },
      ],
      attendance: [
        { staffId, locationId, workedHours: 3.25, actualUnits: 0.5 },
        { staffId, locationId, workedHours: 4.25, actualUnits: 0.5 },
        { staffId: "other-staff", locationId, workedHours: 8, actualUnits: 1 },
        { staffId, locationId: otherLocationId, workedHours: 6, actualUnits: 1 },
      ],
      staffId,
      locationId,
      roleName: "Nhân viên",
      scheduledUnits: 22,
    });

    expect(result.config).toBe(hourlyConfig);
    expect(result.payType).toBe("hourly");
    expect(result.rate).toBe(50_000);
    expect(result.workedHours).toBe(7.5);
    expect(result.actualUnits).toBe(1);
    expect(result.basePay).toBe(375_000);
  });

  it("uses a global hourly config when the staff has no matching location config", () => {
    const globalConfig = {
      locationId: null,
      roleName: "Giáo vụ",
      payType: "hourly",
      luongCB: 60_000,
    };

    const result = calculateHrPayrollBasePay({
      configs: [globalConfig],
      attendance: [{ staffId, locationId, workedHours: 6, actualUnits: 0.75 }],
      staffId,
      locationId,
      roleName: "Giáo vụ",
      scheduledUnits: 22,
    });

    expect(result.config).toBe(globalConfig);
    expect(result.basePay).toBe(360_000);
  });

  it("keeps fixed pay based on work units even when attendance also has hours", () => {
    const fixedConfig = {
      locationId,
      roleName: "Nhân viên",
      payType: "fixed",
      luongCB: "10000000",
    };

    const result = calculateHrPayrollBasePay({
      configs: [fixedConfig],
      attendance: [{ staffId, locationId, workedHours: 160, actualUnits: 16 }],
      staffId,
      locationId,
      roleName: "Nhân viên",
      scheduledUnits: 20,
    });

    expect(result.config).toBe(fixedConfig);
    expect(result.payType).toBe("fixed");
    expect(result.workedHours).toBe(160);
    expect(result.basePay).toBe(8_000_000);
  });

  it("prefers a location-wide hourly config over a role-specific global hourly config", () => {
    const locationWideConfig = {
      locationId,
      roleName: null,
      payType: "hourly",
      luongCB: 45_000,
    };
    const globalRoleConfig = {
      locationId: null,
      roleName: "Giáo vụ",
      payType: "hourly",
      luongCB: 70_000,
    };

    const result = calculateHrPayrollBasePay({
      configs: [globalRoleConfig, locationWideConfig],
      attendance: [{ staffId, locationId, workedHours: 2, actualUnits: 0.25 }],
      staffId,
      locationId,
      roleName: "Giáo vụ",
      scheduledUnits: 20,
    });

    expect(result.config).toBe(locationWideConfig);
    expect(result.basePay).toBe(90_000);
  });
});
