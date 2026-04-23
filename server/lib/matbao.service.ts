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

  async fetchTemplates(year?: number): Promise<any[]> {
    const token = await this.getToken();
    const y = year ?? new Date().getFullYear();
    const res = await axios.get(
      `${BASE_URL}/api/invoice/templates?year=${y}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    return Array.isArray(res.data?.data) ? res.data.data : [];
  }

  async processInvoice(
    inv: MatBaoInvoicePayload,
    isPublish: boolean,
  ): Promise<MatBaoProcessResult> {
    const khhDon = process.env.MATBAO_KHHDON || "C26TAT";
    const khmsHDon = process.env.MATBAO_KHMSHDON || "1";
    console.log(
      `[MatBao] Using KHHDon="${khhDon}" KHMSHDon="${khmsHDon}" (env: KHHDon=${process.env.MATBAO_KHHDON ? "yes" : "default"}, KHMSHDon=${process.env.MATBAO_KHMSHDON ? "yes" : "default"})`,
    );

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const NLap = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
    const MaTraCuu = `EDU${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.floor(Math.random() * 1000)}`;

    const items = inv.items.map((it, idx) => {
      const SLuong = it.quantity ?? 1;
      const DGia = it.price;
      const ThTien = DGia * SLuong;
      const TSuat = it.taxRate ?? 0;
      const TThue = Math.round((ThTien * TSuat) / 100);
      const TgTien = ThTien + TThue;
      return {
        TChat: 1,
        STT: idx + 1,
        THHDVu: it.name,
        DVTinh: it.unit ?? "Khóa",
        SLuong,
        DGia,
        ThTienChuaCK: ThTien,
        TLCKhau: 0,
        STCKhau: 0,
        ThTien,
        TSuat,
        TThue,
        TgTien,
      };
    });
    const TgThTien = items.reduce((s, x) => s + x.ThTien, 0);
    const TgTThue = items.reduce((s, x) => s + x.TThue, 0);
    const TgTTTBSo = TgThTien + TgTThue;

    const payload = {
      LoaiHDon: isPublish ? 1 : 0,
      TCHDon: 0,
      LoaiTraHang: 0,
      KHMSHDon: khmsHDon,
      KHHDon: khhDon,
      MaTraCuu,
      MTChieu: MaTraCuu.slice(0, 20),
      NLap,
      DVTTe: 704,
      TGia: 1,
      HTTToan: "TM/CK",
      GChu: "",
      NMua_Ten: inv.studentName,
      NMua_MST: inv.taxCode || "",
      NMua_DChi: inv.address || "",
      NMua_SDThoai: inv.phone || "",
      NMua_DCTDTu: inv.email || "",
      NMua_HVTNMHang: inv.studentName,
      DSHHDVu: items,
      TgThTien,
      TgTThue,
      TTCKTMai: 0,
      TGTKhac: 0,
      TgTTTBSo,
      TgTTTBChu: "",
    };

    const callOnce = async () => {
      const token = await this.getToken();
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
      const body = res.data;
      const d = body?.data;
      const first = Array.isArray(d) ? d[0] : d;
      // Mắt Bão dùng errorCode=200 cho thành công; bất kỳ giá trị khác = lỗi nghiệp vụ
      const outerOk = body?.errorCode === 200 || body?.success === true;
      const innerOk = first?.errorCode === undefined || first?.errorCode === 200 || first?.success === true;
      if (!outerOk || !innerOk) {
        const bizMsg =
          first?.message ||
          body?.message ||
          "Mắt Bão từ chối hóa đơn (không rõ lý do)";
        console.error("[MatBao] business error:", JSON.stringify(body));
        let msg = String(bizMsg);
        if (/KH(MS)?HDon/i.test(msg)) {
          try {
            const tpls = await this.fetchTemplates();
            const list = tpls.slice(0, 10)
              .map((t: any) => `KHMSHDon=${t.khmshDon}, KHHDon=${t.khhDon} (${t.thDon ?? ""}, còn ${t.cLai ?? "?"})`)
              .join(" | ");
            if (list) msg += ` — Cặp ký hiệu hợp lệ cho MST của bạn: ${list}. Vui lòng cập nhật secret MATBAO_KHHDON & MATBAO_KHMSHDON.`;
          } catch (e) {
            console.error("[MatBao] fetchTemplates error:", e);
          }
        }
        throw new Error(msg);
      }
      const inner = first?.data ?? first;
      const fkey: string | undefined =
        inner?.fkey ?? inner?.Fkey ?? inner?.FKey ?? inner?.maSoHDon ?? inner?.MaSoHDon;
      if (!fkey) {
        console.error("[MatBao] no fkey in response:", JSON.stringify(body));
        throw new Error("Mắt Bão không trả về fkey/MaSoHDon");
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
        data?.data?.[0]?.message ||
        data?.message ||
        data?.Message ||
        data?.error ||
        data?.errors?.[0]?.message ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message || JSON.stringify(e)).join("; ") : "") ||
        ax.message ||
        "Lỗi gửi dữ liệu sang Mắt Bão";
      if (typeof msg !== "string") msg = JSON.stringify(msg);

      if (/KH(MS)?HDon/i.test(msg) && /(không hợp lệ|thiếu|invalid|required)/i.test(msg)) {
        try {
          const tpls = await this.fetchTemplates();
          const list = tpls.slice(0, 10)
            .map((t: any) => `KHMSHDon=${t.khmshDon}, KHHDon=${t.khhDon} (${t.thDon ?? ""}, còn ${t.cLai ?? "?"})`)
            .join(" | ");
          if (list) msg += ` — Mẫu hợp lệ cho MST này: ${list}`;
        } catch {}
      }
      throw new Error(msg);
    }
  }

  getPdfUrl(fkey: string): string {
    return `${BASE_URL}/api/invoice/download-inv-pdf?fkey=${encodeURIComponent(fkey)}`;
  }
}

export const matbao = new MatBaoService();
