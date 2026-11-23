import { describe, expect, it } from "vitest";
import {
  mapStudentImportRows,
  matchStudentImportLocation,
  resolveStudentImportCredentials,
  STUDENT_EXPORT_HEADERS,
  STUDENT_UPLOAD_HEADERS,
} from "./student-import-columns";

describe("student Excel upload column mapping", () => {
  it("keeps imported field indexes stable when gender is added after classification", () => {
    const values = STUDENT_UPLOAD_HEADERS.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([STUDENT_UPLOAD_HEADERS, values]);

    expect(row[0]).toBe("value:Mã số");
    expect(row[3]).toBe("value:Phân loại (*)");
    expect(STUDENT_UPLOAD_HEADERS[4]).toBe("Giới tính");
    expect(row[4]).toBe("value:SĐT");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
    expect(row[19]).toBe("value:Mã lớp");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("value:Tài khoản");
    expect(row[25]).toBe("value:Mật khẩu");
    expect(row[26]).toBe("value:Giới tính");
  });

  it("continues to read legacy export files without gender or credentials", () => {
    const legacyHeaders = STUDENT_EXPORT_HEADERS.filter((header) => header !== "Giới tính");
    const values = legacyHeaders.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([legacyHeaders, values]);

    expect(row[4]).toBe("value:SĐT");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("");
    expect(row[25]).toBe("");
    expect(row[26]).toBe("");
  });

  it("continues to read legacy upload templates with credentials after classification", () => {
    const legacyHeaders = STUDENT_EXPORT_HEADERS.filter((header) => header !== "Giới tính");
    const uploadHeaders = [
      ...legacyHeaders.slice(0, 4),
      "Tài khoản",
      "Mật khẩu",
      ...legacyHeaders.slice(4),
    ];
    const values = uploadHeaders.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([uploadHeaders, values]);

    expect(row[4]).toBe("value:SĐT");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
    expect(row[24]).toBe("value:Tài khoản");
    expect(row[25]).toBe("value:Mật khẩu");
    expect(row[26]).toBe("");
  });

  it("still maps older files with the extra class-name column", () => {
    const legacyHeaders = STUDENT_EXPORT_HEADERS.filter((header) => header !== "Giới tính");
    const headers = [
      ...legacyHeaders.slice(0, 20),
      "Tên lớp",
      ...legacyHeaders.slice(20),
    ];
    const values = headers.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([headers, values]);

    expect(row[19]).toBe("value:Mã lớp");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("");
    expect(row[25]).toBe("");
    expect(row[26]).toBe("");
  });

  it("does not shift later fields when a recognized header is missing", () => {
    const headers = [...STUDENT_UPLOAD_HEADERS];
    const values = headers.map((header) => `value:${header}`);
    headers.splice(7, 1);
    values.splice(7, 1);
    const [row] = mapStudentImportRows([headers, values]);

    expect(row[4]).toBe("");
    expect(row[5]).toBe("value:Ngày sinh");
    expect(row[6]).toBe("value:Email");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
  });

  it("uses the account column when provided and keeps the existing password default", () => {
    expect(resolveStudentImportCredentials("HV-01", "student01", "")).toEqual({
      username: "student01",
      password: "123456",
    });
  });

  it("defaults the account to the student code and uses a supplied password", () => {
    expect(resolveStudentImportCredentials("HV-02", "", "new-pass-123")).toEqual({
      username: "HV-02",
      password: "new-pass-123",
    });
  });
});

describe("student import location matching", () => {
  const locations = [
    { id: "location-1", name: "218 Nguyễn Xí, Bình Thạnh" },
    { id: "location-2", name: "17 Võ Oanh (D3), Bình Thạnh" },
  ];

  it("matches names from older templates that removed commas", () => {
    expect(matchStudentImportLocation("218 Nguyễn Xí  Bình Thạnh", locations)).toEqual({
      location: locations[0],
      ambiguous: false,
    });
  });

  it("does not guess when normalized names match multiple locations", () => {
    const ambiguousLocations = [
      { id: "one", name: "Cơ sở A, Quận 1" },
      { id: "two", name: "Cơ sở A Quận 1" },
    ];

    expect(matchStudentImportLocation("Cơ sở A,  Quận 1", ambiguousLocations)).toEqual({
      location: null,
      ambiguous: true,
    });
  });
});
