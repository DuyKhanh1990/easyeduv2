import { AlertTriangle, ArrowRightLeft, CheckCircle2, FileEdit, PackageMinus, PackagePlus, Trash2 } from "lucide-react";

export function StoreTransferNotes() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 bg-white p-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-bold text-slate-800">Hướng dẫn nghiệp vụ phiếu chuyển kho</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Phiếu chuyển kho di chuyển hàng từ kho nguồn sang kho đích. Trạng thái phiếu quyết định
          việc có được sửa, xóa hoặc xác nhận chuyển hay không.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
            <FileEdit className="h-4 w-4" />
            <h3>Chỉnh sửa phiếu</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Chỉ phiếu ở trạng thái Nháp được chỉnh sửa.</li>
            <li>Có thể thay đổi kho nguồn, kho đích, sản phẩm, số lượng và ghi chú trước khi xác nhận.</li>
            <li>Phiếu Đang chuyển, Hoàn thành hoặc Đã hủy không thể chỉnh sửa.</li>
            <li>Sau khi chỉnh sửa, cần xác nhận chuyển lại để hệ thống kiểm tra tồn kho.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <ArrowRightLeft className="h-4 w-4" />
            <h3>Xác nhận chuyển kho</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Chỉ phiếu Nháp mới được xác nhận chuyển.</li>
            <li>Hệ thống kiểm tra đủ tồn khả dụng tại kho nguồn trước khi chuyển.</li>
            <li>Khi hoàn tất, kho nguồn bị trừ và kho đích được cộng đúng số lượng.</li>
            <li>Biến động xuất ở kho nguồn và nhập ở kho đích được ghi riêng để đối soát.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <Trash2 className="h-4 w-4" />
            <h3>Xóa hoặc hủy phiếu</h3>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Phiếu Nháp có thể xóa vĩnh viễn vì chưa tác động tồn kho.</li>
            <li>Phiếu Đang chuyển có thể hủy; tồn kho nguồn sẽ được hoàn trả.</li>
            <li>Phiếu Hoàn thành không thể hủy vì hàng đã được nhận ở kho đích.</li>
            <li>Nếu cần điều chỉnh phiếu đã hoàn thành, hãy tạo một phiếu chuyển ngược.</li>
            <li>Phiếu Đã hủy không thể hủy lại.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-700">
            <CheckCircle2 className="h-4 w-4" />
            <h3>Trình tự khuyến nghị</h3>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-slate-700">
            <li>Tạo phiếu và lưu ở trạng thái Nháp.</li>
            <li>Kiểm tra lại kho nguồn, kho đích và số lượng.</li>
            <li>Chọn Xác nhận chuyển để trừ kho nguồn và cộng kho đích.</li>
            <li>Chỉ hủy khi phiếu còn Đang chuyển; không sửa trực tiếp phiếu đã Hoàn thành.</li>
          </ol>
        </section>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-slate-700 md:grid-cols-2">
        <div className="flex gap-2">
          <PackageMinus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Kho nguồn:</span> bị trừ khi phiếu được xác nhận hoàn tất.</p>
        </div>
        <div className="flex gap-2">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700">Kho đích:</span> được cộng cùng số lượng trong cùng nghiệp vụ chuyển.</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Không nên xóa dữ liệu trực tiếp trong database vì có thể làm lệch biến động ở cả kho nguồn và kho đích.</p>
      </div>
    </div>
  );
}