import { AlertTriangle, Ban, CheckCircle2, FileEdit, PackagePlus, Receipt, Trash2 } from "lucide-react";

export function StoreReceiptNotes() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 bg-white p-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-bold text-slate-800">Hướng dẫn nghiệp vụ phiếu nhập kho</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Thao tác được kiểm tra theo trạng thái phiếu, tồn kho hiện tại và hóa đơn liên kết.
          Phiếu nhập đã hoàn tất được ghi nhận vào lịch sử biến động kho.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
            <FileEdit className="h-4 w-4" />
            <h3>Chỉnh sửa phiếu</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Phiếu nháp có thể chỉnh sửa vì chưa ảnh hưởng tồn kho.</li>
            <li>Phiếu đã nhập có thể chỉnh sửa, nhưng hệ thống sẽ tính lại phần chênh lệch số lượng.</li>
            <li>Không được giảm số lượng nhập thấp hơn phần hàng đã phát sinh xuất/bán.</li>
            <li>Nếu phiếu có hóa đơn đã thanh toán hoặc thanh toán một phần, thao tác sẽ bị chặn.</li>
            <li>Phiếu đã hủy không thể chỉnh sửa.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-700">
            <Ban className="h-4 w-4" />
            <h3>Hủy phiếu</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Chỉ phiếu đã nhập kho mới thực hiện thao tác Hủy.</li>
            <li>Hủy phiếu sẽ trừ lại đúng số lượng đã nhập khỏi kho.</li>
            <li>Nếu tồn hiện tại không đủ để hoàn tác do hàng đã xuất/bán, hệ thống sẽ chặn.</li>
            <li>Hóa đơn liên kết chưa thanh toán sẽ được xóa theo phiếu.</li>
            <li>Hóa đơn đã thanh toán hoặc thanh toán một phần phải xử lý trước khi hủy.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <Trash2 className="h-4 w-4" />
            <h3>Xóa phiếu</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Chỉ phiếu nháp được xóa vật lý khỏi hệ thống.</li>
            <li>Xóa phiếu nháp không cần hoàn tồn vì phiếu chưa tác động đến kho.</li>
            <li>Phiếu đã nhập không bị xóa vật lý; nút thao tác sẽ là Hủy để bảo toàn lịch sử.</li>
            <li>Phiếu đã hủy vẫn được giữ lại để tra cứu và đối soát.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-700">
            <Receipt className="h-4 w-4" />
            <h3>Phiếu có hóa đơn</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Hóa đơn liên kết được cập nhật lại khi phiếu nhập được chỉnh sửa.</li>
            <li>Hóa đơn chưa thanh toán có thể bị xóa khi hủy phiếu.</li>
            <li>Hóa đơn đã thanh toán hoặc thanh toán một phần sẽ khóa thao tác hủy và chỉnh sửa.</li>
          </ul>
        </section>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-slate-700 md:grid-cols-2">
        <div className="flex gap-2">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Khi nhập kho:</span> số lượng được cộng vào đúng kho và ghi vào lịch sử biến động.</p>
        </div>
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Khi hủy:</span> hệ thống hoàn tác theo đúng số lượng từng sản phẩm trong phiếu.</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Không nên xóa dữ liệu trực tiếp trong database vì có thể làm lệch tồn kho, lịch sử biến động và hóa đơn liên kết.</p>
      </div>
    </div>
  );
}