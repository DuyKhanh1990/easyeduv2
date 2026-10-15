import { useMemo, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Braces, Image as ImageIcon, Info, Link2, QrCode, Text,
  Trash2, Eye, Save, Bold, Italic, Palette,
} from "lucide-react";
import "./_group.css";

type TextBlock = { type: "text"; text: string };
type ImageBlock = {
  type: "image";
  source: "url" | "asset" | "systemVariable";
  url: string;
  alt: string;
};
type QrBlock = { type: "qr"; value: string; caption: string };
type ButtonBlock = { type: "button"; label: string; url: string };
type Block = TextBlock | ImageBlock | QrBlock | ButtonBlock;

const examples: Record<string, string> = {
  student_name: "Nguyễn Minh Anh",
  invoice_code: "HD0001",
  amount: "1.000.000đ",
  bank_name: "Vietcombank",
  bank_code: "VCB",
  account_number: "0123456789",
  account_name: "NGUYEN VAN A",
};

const initialBlocks: Block[] = [
  { type: "image", source: "systemVariable", url: "", alt: "Logo trung tâm" },
  {
    type: "text",
    text: "Kính gửi Quý khách {{student_name}},\n\nMã hóa đơn: {{invoice_code}}\nSố tiền thanh toán: {{amount}}\nTên ngân hàng nhận: {{bank_name}} hoặc Mã ngân hàng {{bank_code}}\nSố tài khoản: {{account_number}}\nTên chủ tài khoản: {{account_name}}\n\nVui lòng quét mã QR bên dưới để thanh toán.",
  },
  { type: "qr", value: "", caption: "Quét mã để thanh toán" },
];

function interpolate(value: string) {
  return value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (token, key: string) =>
    examples[key] ?? token,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="zl-field"><span>{label}</span>{children}</label>;
}

export function Current() {
  const [name, setName] = useState("Thông báo thanh toán kèm mã QR");
  const [code, setCode] = useState("PAYMENT_QR_NOTICE");
  const [noticeType, setNoticeType] = useState("tuition_due");
  const [title, setTitle] = useState("Thông tin thanh toán");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);

  const previewText = useMemo(() => {
    const block = blocks.find((item): item is TextBlock => item.type === "text");
    return block ? interpolate(block.text) : "";
  }, [blocks]);

  function updateBlock(index: number, next: Block) {
    setBlocks((current) => current.map((block, i) => i === index ? next : block));
  }
  function addBlock(type: Block["type"]) {
    const next: Block = type === "text"
      ? { type, text: "" }
      : type === "image"
        ? { type, source: "url", url: "", alt: "" }
        : type === "qr"
          ? { type, value: "", caption: "" }
          : { type, label: "", url: "" };
    setBlocks((current) => [...current, next]);
  }
  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, i) => i !== index));
  }

  return (
    <main className="zbs-preview min-h-screen bg-[#f4f6f2] p-4 text-[#263e36] sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.12em] text-[#718078]">EasyEdu · thư viện mẫu ZBS</p>
            <h1 className="mt-1 text-xl font-semibold">Soạn mẫu mới</h1>
            <p className="mt-1 text-xs text-[#7b8881]">Bản xem trước cô lập · dữ liệu ví dụ · không lưu</p>
          </div>
          <span className="rounded-full border border-[#ead6b6] bg-[#fff8e9] px-3 py-1 text-xs text-[#896534]">Tương thích ZBS: chưa xác minh</span>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,.9fr)]">
          <section className="space-y-4">
            <div className="zl-card">
              <div className="zl-card-head"><Braces size={16} /><div><h2>Thông tin mẫu</h2><p>Tên, mã nội bộ và tiêu đề của bản nháp</p></div></div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <Field label="Tên mẫu *"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Mã nội bộ *"><input className="font-mono" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                <Field label="Loại thông báo nội bộ *"><input value={noticeType} onChange={(e) => setNoticeType(e.target.value)} /><small>Định danh nội bộ, không phải lựa chọn hay liên kết tới mẫu Zalo.</small></Field>
                <Field label="Tiêu đề"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              </div>
            </div>

            <div className="zl-card">
              <div className="zl-card-head zl-between">
                <div><h2>Cấu trúc nội dung</h2><p>Khối nội bộ để biên soạn · chưa xác minh tương thích ZBS</p></div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="zl-add" onClick={() => addBlock("text")}><Text size={14} />Văn bản</button>
                  <button className="zl-add" onClick={() => addBlock("image")}><ImageIcon size={14} />Ảnh</button>
                  <button className="zl-add" onClick={() => addBlock("qr")}><QrCode size={14} />Mã QR</button>
                  <button className="zl-add" onClick={() => addBlock("button")}><Link2 size={14} />Nút</button>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex gap-2 rounded-md border border-[#eadfca] bg-[#fffaf0] p-3 text-[11px] leading-5 text-[#725e3f]">
                  <Info size={15} className="mt-0.5 shrink-0" />
                  Ảnh và nút là cấu trúc dữ liệu nháp chưa xác minh; không đồng nghĩa Zalo hỗ trợ chúng cho mọi loại mẫu.
                </div>
                {blocks.map((block, index) => (
                  <div key={`${block.type}-${index}`} className="rounded-lg border border-[#e0e7e1] bg-[#fbfcf9] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <strong className="flex items-center gap-2 text-xs text-[#476153]">
                        {block.type === "text" ? <Text size={14} /> : block.type === "image" ? <ImageIcon size={14} /> : block.type === "qr" ? <QrCode size={14} /> : <Link2 size={14} />}
                        {block.type === "text" ? "Khối văn bản" : block.type === "image" ? "Khối ảnh · chưa xác minh" : block.type === "qr" ? "Mã QR · chưa xác minh" : "Khối nút · chưa xác minh"}
                      </strong>
                      <button className="zl-icon-button" aria-label="Xóa khối" onClick={() => removeBlock(index)}><Trash2 size={14} /></button>
                    </div>

                    {block.type === "text" && (
                      <div className="space-y-2">
                        <div className="zl-toolbar"><button title="In đậm"><Bold size={14} /></button><button title="In nghiêng"><Italic size={14} /></button><span className="zl-divider" /><button title="Màu chữ"><Palette size={14} /> Màu chữ</button><button className="zl-variable" title="Chèn biến"><Braces size={13} />Chèn biến</button></div>
                        <textarea className="min-h-40" value={block.text} onChange={(e) => updateBlock(index, { ...block, text: e.target.value })} />
                        <p className="text-[10px] text-[#78877f]">Biến mẫu: {"{{student_name}}"}, {"{{invoice_code}}"}, {"{{amount}}"}, {"{{bank_name}}"}, {"{{bank_code}}"}, {"{{account_number}}"}, {"{{account_name}}"}</p>
                      </div>
                    )}

                    {block.type === "image" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Nguồn ảnh"><select value={block.source} onChange={(e) => updateBlock(index, { ...block, source: e.target.value as ImageBlock["source"] })}><option value="url">URL ảnh</option><option value="asset">Mã tài nguyên</option><option value="systemVariable">Logo trung tâm tự động</option></select></Field>
                        {block.source === "systemVariable" ? <Field label="Biến hệ thống"><div className="zl-static">{"{{center_logo}}"} · lấy từ cơ sở chính</div></Field> : <Field label={block.source === "url" ? "URL ảnh" : "Mã tài nguyên"}><input value={block.url} onChange={(e) => updateBlock(index, { ...block, url: e.target.value })} placeholder={block.source === "url" ? "https://…" : "asset-id"} /></Field>}
                        <Field label="Mô tả thay thế"><input value={block.alt} onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })} placeholder="Mô tả ngắn cho ảnh" /></Field>
                        <p className="text-[10px] text-[#8a785a]">compatibilityStatus: unverified</p>
                      </div>
                    )}

                    {block.type === "qr" && (
                      <div className="space-y-3">
                        <Field label="Nội dung để mã hóa thành QR"><textarea className="min-h-20" value={block.value} onChange={(e) => updateBlock(index, { ...block, value: e.target.value })} placeholder="Dán nội dung thanh toán hoặc URL để tạo mã QR xem trước" /></Field>
                        <Field label="Chú thích"><input value={block.caption} onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })} placeholder="Ví dụ: Quét mã để thanh toán" /></Field>
                        <p className="text-[10px] text-[#8a785a]">QR được dựng cục bộ để xem trước; chưa xác minh cách gửi khối QR qua ZBS.</p>
                      </div>
                    )}

                    {block.type === "button" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Nhãn nút"><input value={block.label} onChange={(e) => updateBlock(index, { ...block, label: e.target.value })} placeholder="Ví dụ: Xem chi tiết" /></Field>
                        <Field label="URL đích"><input value={block.url} onChange={(e) => updateBlock(index, { ...block, url: e.target.value })} placeholder="https://…" /></Field>
                        <p className="text-[10px] text-[#8a785a]">compatibilityStatus: unverified</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#dbe4dd] bg-white/90 p-3">
              <span className="text-xs text-[#77857d]">Bản xem trước chỉ dùng dữ liệu ví dụ.</span>
              <button className="zl-save" disabled><Save size={15} />Lưu bản nháp · đã vô hiệu hóa</button>
            </div>
          </section>

          <aside className="zl-card lg:sticky lg:top-4">
            <div className="zl-card-head"><Eye size={16} /><div><h2>Bản xem trước nội bộ</h2><p>Mô phỏng nội dung với ví dụ · chưa xác minh tương thích</p></div></div>
            <div className="p-4">
              <div className="rounded-xl border border-[#e4e8df] bg-[#f4f3ec] p-4">
                <div className="mx-auto max-w-sm rounded-xl border border-[#e0e4dc] bg-[#fffefa] p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between border-b border-[#edf0e9] pb-2 text-[10px] uppercase tracking-[.13em] text-[#89938a]"><span>Preview · nội bộ</span><span>Không gửi</span></div>
                  <div className="mb-3 flex justify-center"><div className="flex h-14 w-36 items-center justify-center rounded-md border border-dashed border-[#d6ddd5] bg-[#f5f7f3] text-xs text-[#7c897f]">Logo trung tâm</div></div>
                  {title && <h3 className="mb-3 text-sm font-semibold text-[#304b3e]">{interpolate(title)}</h3>}
                  {previewText && <div className="whitespace-pre-wrap text-sm leading-6 text-[#4c5a50]">{previewText}</div>}
                  {blocks.filter((item): item is QrBlock => item.type === "qr").map((block, index) => (
                    <div key={index} className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-[#e0e4dc] bg-[#f8f7f2] p-4">
                      {block.value.trim()
                        ? <div className="rounded-lg bg-white p-2"><QRCodeSVG value={block.value} size={164} level="M" includeMargin /></div>
                        : <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-[#cdd8cf] bg-white text-center text-xs text-[#7c897f]"><QrCode className="mr-2 h-5 w-5" />Nhập nội dung QR để xem mã</div>}
                      {block.caption && <p className="text-center text-xs text-[#53685b]">{block.caption}</p>}
                    </div>
                  ))}
                  <p className="mt-4 border-t border-[#edf0e9] pt-2 text-[10px] leading-4 text-[#9a8b6d]">Mô phỏng dữ liệu nội bộ, không phải bản render hoặc xác nhận từ Zalo.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
