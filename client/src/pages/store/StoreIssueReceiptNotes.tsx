import type { ReactNode } from "react";
import { AlertTriangle, Ban, CheckCircle2, FileEdit, PackageCheck, Receipt, Trash2 } from "lucide-react";

function NoteCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: "blue" | "orange" | "red" | "violet";
  children: ReactNode;
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/70 text-blue-700",
    orange: "border-orange-200 bg-orange-50/70 text-orange-700",
    red: "border-red-200 bg-red-50/70 text-red-700",
    violet: "border-violet-200 bg-violet-50/70 text-violet-700",
  };

  return (
    <section className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="space-y-2 text-xs leading-5 text-slate-700">{children}</div>
    </section>
  );
}

export function StoreIssueReceiptNotes() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 bg-white p-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-bold text-slate-800">Hướng dẫn nghiệp vụ phiếu xuất kho</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Các thao tác dưới đây được kiểm tra theo trạng thái phiếu, tồn kho và trạng thái hóa đơn liên kết.
          Phiếu xuất kho đã hoàn tất luôn được ghi nhận vào lịch sử biến động kho.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NoteCard
          icon={<FileEdit className="h-4 w-4" />}
          title="Chỉnh sửa phiếu"
          tone="blue"
        >
          <ul className="list-disc space-y-1 pl-4">
            <li>Phiếu nháp có thể chỉnh sửa bình thường vì chưa trừ tồn kho.</li>
            <li>Phiếu đã xuất có thể chỉnh sửa nếu hóa đơn liên kết chưa thanh toán.</li>
            <li>Hệ thống sẽ kiểm tra lại tồn kho trước khi lưu phần số lượng mới.</li>
            <li>Nếu số lượng thay đổi, kho chỉ điều chỉnh phần chênh lệch giữa cũ và mới.</li>
            <li>Phiếu đã hủy không thể chỉnh sửa.</li>
          </ul>
        </NoteCard>

        <NoteCard
          icon={<Ban className="h-4 w-4" />}
          title="Hủy phiếu"
          tone="orange"
        >
          <ul className="list-disc space-y-1 pl-4">
            <li>Chỉ phiếu đã xuất mới thực hiện thao tác Hủy.</li>
            <li>Hủy phiếu sẽ cộng trả lại đúng số lượng từng sản phẩm vào đúng kho.</li>
            <li>Hóa đơn liên kết chưa thanh toán sẽ được xóa theo phiếu.</li>
            <li>Nếu hóa đơn đã thanh toán hoặc thanh toán một phần, thao tác sẽ bị chặn.</li>
            <li>Phiếu đã hủy không thể hủy lại hoặc chỉnh sửa.</li>
          </ul>
        </NoteCard>

        <NoteCard
          icon={<Trash2 className="h-4 w-4" />}
          title="Xóa phiếu"
          tone="red"
        >
          <ul className="list-disc space-y-1 pl-4">
            <li>Chỉ phiếu nháp được xóa vật lý khỏi hệ thống.</li>
            <li>Xóa phiếu nháp không cần hoàn tồn vì phiếu nháp chưa ảnh hưởng tồn kho.</li>
            <li>Phiếu đã xuất không bị xóa vật lý; nút thao tác sẽ là Hủy để giữ lịch sử kho.</li>
            <li>Phiếu đã hủy vẫn được giữ lại để tra cứu lịch sử và đối soát.</li>
          </ul>
        </NoteCard>

        <NoteCard
          icon={<Receipt className="h-4 w-4" />}
          title="Phiếu có hóa đơn loại Kho"
          tone="violet"
        >
          <ul className="list-disc space-y-1 pl-4">
            <li>Hóa đơn tạo từ phiếu xuất kho sẽ được liên kết với phiếu PXK.</li>
            <li>Hóa đơn loại Kho tạo từ trang Hóa đơn sẽ tự sinh phiếu xuất kho theo từng kho.</li>
            <li>Không được xóa hoặc hủy khi hóa đơn đã thanh toán hoặc thanh toán một phần.</li>
            <li>Khi xóa hóa đơn chưa thanh toán, phiếu PXK liên kết sẽ được hủy và hoàn tồn.</li>
          </ul>
        </NoteCard>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-slate-700 md:grid-cols-2">
        <div className="flex gap-2">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Kiểm tra tồn kho:</span> khi xuất hoặc tăng số lượng, hệ thống phải có đủ tồn khả dụng tại kho đã chọn.</p>
        </div>
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Ghi nhận lịch sử:</span> mọi lần xuất, sửa, hủy và hoàn tồn đều được lưu trong biến động kho để đối chiếu.</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Không nên xóa dữ liệu trực tiếp trong database vì có thể làm lệch lịch sử biến động kho và hóa đơn liên kết.</p>
      </div>
    </div>
  );
}