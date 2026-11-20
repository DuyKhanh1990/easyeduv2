import React from "react";

interface InvoiceListErrorRowProps {
  colSpan: number;
  message: string;
}

export function InvoiceListErrorRow({ colSpan, message }: InvoiceListErrorRowProps) {
  return (
    <tr data-testid="invoice-list-error-row">
      <td colSpan={colSpan} className="py-20 text-center">
        <p role="alert" className="text-sm font-medium text-destructive">{message}</p>
      </td>
    </tr>
  );
}