import axios, { AxiosError } from "axios";
import { db } from "../storage/base";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "einvoice_matbao";
const DEFAULT_BASE_URL = "https://demo-api-hddt.matbao.in:11443";

export interface MatBaoConfig {
  baseUrl: string;
  mst: string;
  username: string;
  password: string;
  khhDon: string;
  khmsHDon: string;
}

export interface MatBaoAdjustment {
  /** Tên hiển thị, ví dụ "KM đăng ký sớm 10%" hoặc "Phí giáo trình" */
  name: string;
  /** Số tiền dương; tChat sẽ quyết định cộng/trừ */
  amount: number;
}

export interface MatBaoInvoiceItem {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
  taxRate?: number;
  /** Khuyến mãi áp dụng riêng cho dòng này (sẽ chèn ngay dưới sản phẩm với tChat:2) */
  promotions?: MatBaoAdjustment[];
  /** Phụ thu áp dụng riêng cho dòng này (sẽ chèn ngay dưới sản phẩm với tChat:3) */
  surcharges?: MatBaoAdjustment[];
}

export interface MatBaoInvoicePayload {
  studentName: string;
  email?: string | null;
  phone?: string | null;
  taxCode?: string | null;
  address?: string | null;
  items: MatBaoInvoiceItem[];
  /** Khuyến mãi áp dụng cho toàn hoá đơn (đẩy xuống cuối với tChat:2) */
  invoicePromotions?: MatBaoAdjustment[];
  /** Phụ thu áp dụng cho toàn hoá đơn (đẩy xuống cuối với tChat:3) */
  invoiceSurcharges?: MatBaoAdjustment[];
}

export interface MatBaoProcessResult {
  success: true;
  fkey: string;
  maTraCuu: string;
  message: string;
}

class MatBaoService {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private tokenForUser: string | null = null;

  async getConfig(): Promise<MatBaoConfig> {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SETTINGS_KEY));
    if (rows.length > 0) {
      try {
        const cfg = JSON.parse(rows[0].value) as Partial<MatBaoConfig>;
        return {
          baseUrl: cfg.baseUrl || DEFAULT_BASE_URL,
          mst: cfg.mst || "",
          username: cfg.username || "",
          password: cfg.password || "",
          khhDon: cfg.khhDon || "",
          khmsHDon: cfg.khmsHDon || "",
        };
      } catch {}
    }
    // Fallback từ env
    return {
      baseUrl: process.env.MATBAO_BASE_URL || DEFAULT_BASE_URL,
      mst: process.env.MATBAO_MST || "",
      username: process.env.MATBAO_USER || "",
      password: process.env.MATBAO_PASS || "",
      khhDon: process.env.MATBAO_KHHDON || "",
      khmsHDon: process.env.MATBAO_KHMSHDON || "",
    };
  }

  async saveConfig(cfg: MatBaoConfig): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key: SETTINGS_KEY, value: JSON.stringify(cfg) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify(cfg), updatedAt: new Date() },
      });
    // Reset token vì có thể đổi user
    this.token = null;
    this.tokenForUser = null;
  }

  async isConfigured(): Promise<boolean> {
    const c = await this.getConfig();
    return Boolean(c.mst && c.username && c.password);
  }

  /** Đăng nhập với credentials cụ thể, trả về token. Không cache. */
  async loginWith(creds: { baseUrl: string; mst: string; username: string; password: string }): Promise<string> {
    try {
      const res = await axios.post(
        `${creds.baseUrl}/api/auth/login`,
        { MST: creds.mst, TDNhap: creds.username, MKhau: creds.password },
        { timeout: 15000 },
      );
      const token = res.data?.data?.accessToken;
      if (!token) throw new Error("Mắt Bão không trả về accessToken");
      return token;
    } catch (err) {
      const ax = err as AxiosError<any>;
      const msg = ax.response?.data?.message || ax.response?.data?.data?.[0]?.message || ax.message || "Đăng nhập Mắt Bão thất bại";
      throw new Error(`Đăng nhập Mắt Bão thất bại: ${msg}`);
    }
  }

  /** Lấy token với cấu hình hiện tại trong DB, có cache theo user. */
  private async getToken(cfg?: MatBaoConfig): Promise<{ token: string; cfg: MatBaoConfig }> {
    const c = cfg ?? (await this.getConfig());
    if (!c.mst || !c.username || !c.password) {
      throw new Error("Chưa cấu hình kết nối Mắt Bão. Vui lòng vào Cấu hình hệ thống → Hoá đơn điện tử.");
    }
    const userKey = `${c.mst}|${c.username}`;
    if (this.token && this.tokenForUser === userKey && Date.now() < this.tokenExpiresAt) {
      return { token: this.token, cfg: c };
    }
    const token = await this.loginWith(c);
    this.token = token;
    this.tokenForUser = userKey;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return { token, cfg: c };
  }

  /** Lấy danh sách mẫu hoá đơn. Có thể truyền creds để test, không thì dùng cấu hình DB. */
  async fetchTemplates(opts?: { year?: number; creds?: { baseUrl: string; mst: string; username: string; password: string } }): Promise<any[]> {
    const year = opts?.year ?? new Date().getFullYear();
    let token: string;
    let baseUrl: string;
    if (opts?.creds) {
      token = await this.loginWith(opts.creds);
      baseUrl = opts.creds.baseUrl;
    } else {
      const t = await this.getToken();
      token = t.token;
      baseUrl = t.cfg.baseUrl;
    }
    const res = await axios.get(
      `${baseUrl}/api/invoice/templates?year=${year}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    return Array.isArray(res.data?.data) ? res.data.data : [];
  }

  async processInvoice(
    inv: MatBaoInvoicePayload,
    isPublish: boolean,
  ): Promise<MatBaoProcessResult> {
    const { token, cfg } = await this.getToken();
    if (!cfg.khhDon || !cfg.khmsHDon) {
      throw new Error("Chưa chọn Mẫu hoá đơn. Vui lòng vào Cấu hình hệ thống → Hoá đơn điện tử để chọn mẫu.");
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const NLap = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
    const MaTraCuu = `EDU${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.floor(Math.random() * 1000)}`;

    type Line = {
      TChat: number;
      STT: number;
      THHDVu: string;
      DVTinh: string;
      SLuong: number;
      DGia: number;
      ThTienChuaCK: number;
      TLCKhau: number;
      STCKhau: number;
      ThTien: number;
      TSuat: number;
      TThue: number;
      TgTien: number;
    };
    const lines: Line[] = [];
    let stt = 0;

    const pushAdjustment = (
      tChat: 2 | 3,
      prefix: "-" | "+",
      label: string,
      amount: number,
      taxRate: number,
    ) => {
      if (!amount || amount <= 0) return;
      const ThTien = Math.round(amount);
      const TThue = Math.round((ThTien * taxRate) / 100);
      stt += 1;
      lines.push({
        TChat: tChat,
        STT: stt,
        THHDVu: ` ${prefix} ${label}`,
        DVTinh: "",
        SLuong: 1,
        DGia: ThTien,
        ThTienChuaCK: ThTien,
        TLCKhau: 0,
        STCKhau: 0,
        ThTien,
        TSuat: taxRate,
        TThue,
        TgTien: ThTien + TThue,
      });
    };

    for (const it of inv.items) {
      const SLuong = it.quantity ?? 1;
      const DGia = it.price;
      const ThTien = DGia * SLuong;
      const TSuat = it.taxRate ?? 0;
      const TThue = Math.round((ThTien * TSuat) / 100);
      stt += 1;
      lines.push({
        TChat: 1,
        STT: stt,
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
        TgTien: ThTien + TThue,
      });
      // Chèn các dòng KM / phụ thu ngay dưới sản phẩm
      for (const p of it.promotions ?? []) {
        pushAdjustment(2, "-", `Khuyến mãi: ${p.name}`, p.amount, TSuat);
      }
      for (const s of it.surcharges ?? []) {
        pushAdjustment(3, "+", `Phụ thu: ${s.name}`, s.amount, TSuat);
      }
    }

    // KM / Phụ thu áp dụng cho toàn hoá đơn → đẩy xuống cuối
    for (const p of inv.invoicePromotions ?? []) {
      pushAdjustment(2, "-", `Giảm giá tổng: ${p.name}`, p.amount, 0);
    }
    for (const s of inv.invoiceSurcharges ?? []) {
      pushAdjustment(3, "+", `Phụ thu: ${s.name}`, s.amount, 0);
    }

    // Tính tổng cộng/trừ theo tChat
    const sign = (t: number) => (t === 2 ? -1 : 1);
    const TgThTien = lines.reduce((s, x) => s + sign(x.TChat) * x.ThTien, 0);
    const TgTThue = lines.reduce((s, x) => s + sign(x.TChat) * x.TThue, 0);
    const TgTTTBSo = TgThTien + TgTThue;
    const items = lines;

    const payload = {
      LoaiHDon: isPublish ? 1 : 0,
      TCHDon: 0,
      LoaiTraHang: 0,
      KHMSHDon: cfg.khmsHDon,
      KHHDon: cfg.khhDon,
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

    const callOnce = async (tk: string) => {
      return axios.post(
        `${cfg.baseUrl}/api/invoice/create-invoice`,
        [payload],
        { headers: { Authorization: `Bearer ${tk}` }, timeout: 30000 },
      );
    };

    try {
      let res;
      try {
        res = await callOnce(token);
      } catch (err) {
        const ax = err as AxiosError;
        if (ax.response?.status === 401) {
          this.token = null;
          const t2 = await this.getToken(cfg);
          res = await callOnce(t2.token);
        } else {
          throw err;
        }
      }
      const body = res.data;
      const d = body?.data;
      const first = Array.isArray(d) ? d[0] : d;
      const outerOk = body?.errorCode === 200 || body?.success === true;
      const innerOk = first?.errorCode === undefined || first?.errorCode === 200 || first?.success === true;
      if (!outerOk || !innerOk) {
        const bizMsg = first?.message || body?.message || "Mắt Bão từ chối hoá đơn (không rõ lý do)";
        console.error("[MatBao] business error:", JSON.stringify(body));
        throw new Error(String(bizMsg));
      }
      const inner = first?.data ?? first;
      const fkey: string | undefined =
        inner?.maSoHDon ?? inner?.MaSoHDon ?? inner?.fkey ?? inner?.Fkey ?? inner?.FKey;
      if (!fkey) {
        console.error("[MatBao] no fkey in response:", JSON.stringify(body));
        throw new Error("Mắt Bão không trả về fkey/MaSoHDon");
      }
      const returnedMaTraCuu: string =
        inner?.maTraCuu ?? inner?.MaTraCuu ?? MaTraCuu;
      return {
        success: true,
        fkey,
        maTraCuu: returnedMaTraCuu,
        message: isPublish ? "Đã ký số thành công" : "Đã tạo bản nháp thành công",
      };
    } catch (err) {
      const ax = err as AxiosError<any>;
      const data = ax.response?.data;
      const msg: string =
        (typeof data === "string" && data) ||
        data?.data?.[0]?.message ||
        data?.message ||
        ax.message ||
        (err as Error).message ||
        "Lỗi gửi dữ liệu sang Mắt Bão";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  }

  async getPdfUrl(fkey: string): Promise<string> {
    const cfg = await this.getConfig();
    return `${cfg.baseUrl}/api/invoice/download-inv-pdf?fkey=${encodeURIComponent(fkey)}`;
  }

  /** Tải file PDF của 1 hoá đơn (cả nháp lẫn đã ký) từ Mắt Bão. Trả về Buffer PDF. */
  async downloadInvoicePdf(opts: { maSoHDon: string; maTraCuu?: string | null }): Promise<Buffer> {
    const { token, cfg } = await this.getToken();
    const body = {
      MaTraCuu: opts.maTraCuu || "",
      MaSoHDon: opts.maSoHDon,
    };
    const callOnce = async (tk: string) =>
      axios.post(`${cfg.baseUrl}/api/invoice/download-invoice`, body, {
        headers: { Authorization: `Bearer ${tk}` },
        timeout: 30000,
      });

    let res;
    try {
      res = await callOnce(token);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 401) {
        this.token = null;
        const t2 = await this.getToken(cfg);
        res = await callOnce(t2.token);
      } else {
        throw err;
      }
    }

    const data = res.data;
    const outerOk = data?.errorCode === 200 || data?.success === true;
    const b64: string | undefined = data?.data?.data_PDF_Base64 ?? data?.data?.dataPDFBase64 ?? data?.data?.pdfBase64;
    if (!outerOk || !b64) {
      const msg = data?.message || data?.data?.message || "Mắt Bão không trả về file PDF";
      throw new Error(String(msg));
    }
    return Buffer.from(b64, "base64");
  }
}

export const matbao = new MatBaoService();
