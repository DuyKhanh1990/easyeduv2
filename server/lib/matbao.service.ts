import axios, { AxiosError } from "axios";

const MST  = process.env.MATBAO_MST  ?? "";
const USER = process.env.MATBAO_USER ?? "";
const PASS = process.env.MATBAO_PASS ?? "";
const BASE_URL = process.env.MATBAO_BASE_URL ?? "https://demo-api-hddt.matbao.in:11443";

export interface MatBaoInvoiceItem {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
  taxRate?: number;
}

export interface MatBaoInvoicePayload {
  studentName: string;
  email?: string | null;
  phone?: string | null;
  taxCode?: string | null;
  address?: string | null;
  items: MatBaoInvoiceItem[];
}

export interface MatBaoProcessResult {
  success: true;
  fkey: string;
  message: string;
}

class MatBaoService {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  isConfigured(): boolean {
    return Boolean(MST && USER && PASS);
  }

  private async login(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Chưa cấu hình MATBAO_MST / MATBAO_USER / MATBAO_PASS");
    }
    try {
      const res = await axios.post(
        `${BASE_URL}/api/auth/login`,
        { MST, TDNhap: USER, MKhau: PASS },
        { timeout: 15000 },
      );
      const token = res.data?.data?.accessToken;
      if (!token) throw new Error("Mắt Bão không trả về accessToken");
      this.token = token;
      this.tokenExpiresAt = Date.now() + 50 * 60 * 1000; // ~50 phút
      return token;
    } catch (err) {
      const ax = err as AxiosError<any>;
      const msg = ax.response?.data?.message || ax.message || "Đăng nhập Mắt Bão thất bại";
      console.error("[MatBao] login error:", msg);
      throw new Error(`Đăng nhập Mắt Bão thất bại: ${msg}`);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    return this.login();
  }

  async processInvoice(
    inv: MatBaoInvoicePayload,
    isPublish: boolean,
  ): Promise<MatBaoProcessResult> {
    const payload = {
      isPublish,
      KHHDon: process.env.MATBAO_KHHDON || "K24TAA",
      KHMSHDon: process.env.MATBAO_KHMSHDON || "1",
      nMua_Ten: inv.studentName,
      nMua_Email: inv.email || "",
      nMua_DThoai: inv.phone || "",
      nMua_DChi: inv.address || "",
      nMua_MST: inv.taxCode || "",
      hThuc_TToan: "TM/CK",
      loai_TTe: "VND",
      tGia: 1,
      thhdVu: inv.items.map(it => {
        const sLuong = it.quantity ?? 1;
        return {
          ten: it.name,
          dVi_tinh: it.unit ?? "Khóa",
          sLuong,
          dGia: it.price,
          tTien: it.price * sLuong,
          tSuat: it.taxRate ?? 0,
        };
      }),
    };

    const callOnce = async () => {
      const token = await this.getToken();
      // Mắt Bão yêu cầu root body là một mảng: List<CreateInvoiceRequest>
      return axios.post(
        `${BASE_URL}/api/invoice/create-invoice`,
        [payload],
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000,
        },
      );
    };

    try {
      let res;
      try {
        res = await callOnce();
      } catch (err) {
        const ax = err as AxiosError;
        // Token expired → login lại 1 lần và thử tiếp
        if (ax.response?.status === 401) {
          this.token = null;
          res = await callOnce();
        } else {
          throw err;
        }
      }
      const d = res.data?.data;
      const first = Array.isArray(d) ? d[0] : d;
      const fkey: string | undefined =
        first?.fkey ?? first?.Fkey ?? first?.FKey ?? res.data?.fkey;
      if (!fkey) {
        console.error("[MatBao] processInvoice unexpected response:", JSON.stringify(res.data));
        throw new Error("Mắt Bão không trả về fkey");
      }
      return {
        success: true,
        fkey,
        message: isPublish ? "Đã ký số thành công" : "Đã tạo bản nháp thành công",
      };
    } catch (err) {
      const ax = err as AxiosError<any>;
      const data = ax.response?.data;
      console.error("[MatBao] processInvoice ERROR status:", ax.response?.status);
      console.error("[MatBao] processInvoice payload sent:", JSON.stringify(payload));
      console.error("[MatBao] processInvoice response body:", JSON.stringify(data));
      let msg: string =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.Message ||
        data?.error ||
        data?.errors?.[0]?.message ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message || JSON.stringify(e)).join("; ") : "") ||
        ax.message ||
        "Lỗi gửi dữ liệu sang Mắt Bão";
      if (typeof msg !== "string") msg = JSON.stringify(msg);
      throw new Error(msg);
    }
  }

  getPdfUrl(fkey: string): string {
    return `${BASE_URL}/api/invoice/download-inv-pdf?fkey=${encodeURIComponent(fkey)}`;
  }
}

export const matbao = new MatBaoService();
