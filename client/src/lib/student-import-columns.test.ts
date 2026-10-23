import { describe, expect, it } from "vitest";
import {
  mapStudentImportRows,
  resolveStudentImportCredentials,
  STUDENT_EXPORT_HEADERS,
  STUDENT_UPLOAD_HEADERS,
} from "./student-import-columns";

describe("student Excel upload column mapping", () => {
  it("keeps all previous fields in place with the new account and password columns", () => {
    const values = STUDENT_UPLOAD_HEADERS.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([STUDENT_UPLOAD_HEADERS, values]);

    expect(row[0]).toBe("value:Mã số");
    expect(row[3]).toBe("value:Phân loại (*)");
    expect(row[4]).toBe("value:SĐT");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
    expect(row[19]).toBe("value:Mã lớp");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("value:Tài khoản");
    expect(row[25]).toBe("value:Mật khẩu");
  });

  it("continues to read old files without the two new columns", () => {
    const values = STUDENT_EXPORT_HEADERS.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([STUDENT_EXPORT_HEADERS, values]);

    expect(row[4]).toBe("value:SĐT");
    expect(row[13]).toBe("value:Mối quan hệ (*)");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("");
    expect(row[25]).toBe("");
  });

  it("still maps older files with the extra class-name column", () => {
    const headers = [
      ...STUDENT_EXPORT_HEADERS.slice(0, 20),
      "Tên lớp",
      ...STUDENT_EXPORT_HEADERS.slice(20),
    ];
    const values = headers.map((header) => `value:${header}`);
    const [row] = mapStudentImportRows([headers, values]);

    expect(row[19]).toBe("value:Mã lớp");
    expect(row[20]).toBe("value:Địa chỉ");
    expect(row[23]).toBe("value:Ghi chú");
    expect(row[24]).toBe("");
    expect(row[25]).toBe("");
  });

  it("does not shift later fields when a recognized header is missing", () => {
    const headers = [...STUDENT_UPLOAD_HEADERS];
    const values = headers.map((header) => `value:${header}`);
    headers.splice(6, 1);
    values.splice(6, 1);
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
