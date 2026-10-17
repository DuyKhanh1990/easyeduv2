import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ApprovedZbsTemplateSource = {
  capture: {
    capturedAt: string;
    approvalLabelFromZbsUi: string;
  };
  template: {
    brandTemplateId: number;
    name: string;
    oaName: string;
    oaId: string;
    status: number;
    section: {
      header?: { components?: Array<{ LOGO?: { urlDark?: string; urlLight?: string } }> };
      body: { components: Array<Record<string, any>> };
      footer?: { components?: Array<{ BUTTON?: { buttons?: Array<{ text?: string; actionType?: string }> } }> };
      params: Array<{
        name: string;
        isRequired: boolean;
        sampleValue: string;
      }>;
    };
    technicalParams: Array<{
      name: string;
      zteType: string;
      dataType: string;
      maxLength: number;
    }>;
  };
};

export function ApprovedZbsTemplateCard({ source }: { source: ApprovedZbsTemplateSource }) {
  const [open, setOpen] = useState(false);
  const template = source.template;
  const body = template.section.body.components;
  const title = body.find((component) => component.TITLE)?.TITLE?.value as string | undefined;
  const paragraphs = body.flatMap((component) => component.PARAGRAPH ? [component.PARAGRAPH.value as string] : []);
  const tableRows = body.flatMap((component) => component.TABLE?.rows ?? []);
  const payment = body.find((component) => component.PAYMENT)?.PAYMENT;
  const button = template.section.footer?.components?.flatMap((component) => component.BUTTON?.buttons ?? [])[0];

  return (
    <>
      <Card className="border-[#b7cec0] bg-[#fbfdf9] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-[#e4ece5] px-4 py-3.5 sm:px-5">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge className="border border-[#b9d7c2] bg-[#e9f5eb] text-[#315f43] hover:bg-[#e9f5eb]">Mẫu chuẩn EasyEdu</Badge>
              <Badge variant="outline" className="border-[#d7ddc5] bg-[#f7f8ed] text-[#68713b]">{source.capture.approvalLabelFromZbsUi}</Badge>
            </div>
            <CardTitle className="text-sm text-[#263e36]">{template.name}</CardTitle>
            <p className="mt-1 text-xs text-[#718078]">
              Mã mẫu Zalo {template.brandTemplateId} · duyệt trên OA EasyEdu, không đại diện trạng thái OA trung tâm
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)} className="border-[#b9cdbf] text-[#315f4e] hover:bg-white">
            Xem mẫu chuẩn
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="text-xs leading-5 text-[#63756b]">
            Nguồn chuẩn chỉ đọc · ghi nhận ngày {source.capture.capturedAt} · OA: {template.oaName}
          </p>
          <span className="font-mono text-[11px] text-[#78877f]">brandTemplateId: {template.brandTemplateId}</span>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[#d9e2dd] bg-[#fffefa]">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-[#263e36]">{template.name}</DialogTitle>
              <Badge className="border border-[#b9d7c2] bg-[#e9f5eb] text-[#315f43] hover:bg-[#e9f5eb]">Mẫu chuẩn · chỉ đọc</Badge>
            </div>
            <DialogDescription className="leading-5">
              Đã duyệt trên OA EasyEdu (“{template.oaName}”) ngày {source.capture.capturedAt}. Đây không phải trạng thái duyệt của OA các trung tâm.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#e0e7e1] bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#748279]">Thông tin nguồn</p>
              <dl className="mt-2 space-y-1.5 text-xs text-[#42584d]">
                <div className="flex justify-between gap-3"><dt>Mã mẫu Zalo</dt><dd className="font-mono">{template.brandTemplateId}</dd></div>
                <div className="flex justify-between gap-3"><dt>OA ID</dt><dd className="font-mono">{template.oaId}</dd></div>
                <div className="flex justify-between gap-3"><dt>Trạng thái nguồn</dt><dd>{source.capture.approvalLabelFromZbsUi} (raw: {template.status})</dd></div>
                <div className="flex justify-between gap-3"><dt>Ngày ghi nhận</dt><dd>{source.capture.capturedAt}</dd></div>
              </dl>
            </div>

            <div className="rounded-lg border border-[#e0e7e1] bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#748279]">Nội dung chuẩn</p>
              <div className="mt-2 rounded-md bg-[#f8faf7] p-3 text-sm leading-6 text-[#40564a]">
                {title && <p className="mb-2 font-semibold">{title}</p>}
                {paragraphs.map((paragraph, index) => <p key={index} className="mb-2 last:mb-0">{paragraph}</p>)}
                {tableRows.length > 0 && (
                  <dl className="my-3 divide-y divide-[#e5ebe5] rounded border border-[#e5ebe5] bg-white px-2">
                    {tableRows.map((row: { key?: string; value?: string }, index: number) => (
                      <div key={index} className="flex justify-between gap-3 py-1.5 text-xs">
                        <dt>{row.key}</dt><dd className="text-right font-medium">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {payment && (
                  <div className="mt-3 rounded-md border border-[#d7e5d9] bg-white p-3 text-xs leading-5">
                    <p className="font-semibold text-[#315f4e]">Thông tin thanh toán cố định trong mẫu</p>
                    <p>{payment.bankName} ({payment.bankCode})</p>
                    <p>{payment.accountName} · {payment.accountNumber}</p>
                    <p>Số tiền chuyển khoản: {payment.amount}</p>
                  </div>
                )}
                {button?.text && <div className="mt-3 rounded-md bg-[#315f4e] px-3 py-2 text-center text-xs font-semibold text-white">{button.text}</div>}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#e0e7e1] bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#748279]">Tham số mẫu</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="text-[#748279]"><tr><th className="pb-2 pr-3">Tên</th><th className="pb-2 pr-3">Bắt buộc</th><th className="pb-2">Ví dụ</th></tr></thead>
                <tbody>{template.section.params.map((param) => {
                  const technical = template.technicalParams.find((item) => item.name === param.name);
                  return (
                    <tr key={param.name} className="border-t border-[#edf0e9] text-[#42584d]">
                      <td className="py-2 pr-3 font-mono">{param.name}{technical && <span className="ml-2 text-[10px] text-[#89938a]">{technical.zteType} · max {technical.maxLength}</span>}</td>
                      <td className="py-2 pr-3">{param.isRequired ? "Có" : "Không"}</td>
                      <td className="py-2">{param.sampleValue}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Mẫu này là định nghĩa gốc để đối chiếu. Chưa tạo bản sao hoặc thay đổi mẫu trên OA nào; dữ liệu ngân hàng ở đây là nội dung cố định của mẫu nguồn.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
