import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.GATEWAY_JWT_SECRET || process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = "30d";
const GUEST_JWT_EXPIRES_IN = "7d";

if (!JWT_SECRET) {
  console.warn("[Gateway JWT] GATEWAY_JWT_SECRET chưa được set — JWT sẽ không hoạt động đúng!");
}

export interface GatewayJwtPayload {
  id: string;
  tenantId: string | null;
  role: "student" | "parent" | "staff" | "guest";
  zaloUserId?: string;
}

/**
 * Issue gateway JWT với { id, tenantId, role }.
 * Dùng chung JWT_SECRET với CRM → CRM validate được token này.
 * CRM chỉ đọc field `id`, bỏ qua `tenantId` và `role`.
 */
export function issueGatewayToken(payload: GatewayJwtPayload): string {
  const expiresIn = payload.role === "guest" ? GUEST_JWT_EXPIRES_IN : JWT_EXPIRES_IN;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function issueGuestToken(zaloUserId: string): string {
  return jwt.sign(
    { id: "", tenantId: null, role: "guest", zaloUserId },
    JWT_SECRET,
    { expiresIn: GUEST_JWT_EXPIRES_IN }
  );
}

/**
 * Decode và verify gateway JWT.
 * Trả về null nếu token không hợp lệ hoặc hết hạn.
 */
export function decodeGatewayToken(token: string): GatewayJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as GatewayJwtPayload;
  } catch {
    return null;
  }
}

/**
 * Decode CRM JWT để lấy userId.
 * Dùng jwt.decode() (không verify) vì CRM đã xác thực user rồi,
 * và CRM production có thể dùng JWT_SECRET khác gateway.
 * Không throw — trả null nếu lỗi.
 */
export function decodeCrmToken(token: string): { id: string } | null {
  try {
    const decoded = jwt.decode(token) as { id?: string } | null;
    if (!decoded?.id) return null;
    return { id: decoded.id };
  } catch {
    return null;
  }
}
