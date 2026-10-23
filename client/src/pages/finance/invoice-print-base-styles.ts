export const INVOICE_PRINT_BASE_STYLES = `
  .invoice-print-root {
    font-family: Arial, sans-serif;
    line-height: 1.5;
  }
  .invoice-print-root,
  .invoice-print-root *,
  .invoice-print-root *::before,
  .invoice-print-root *::after {
    box-sizing: border-box;
  }
  .invoice-print-root p,
  .invoice-print-root h1,
  .invoice-print-root h2,
  .invoice-print-root h3,
  .invoice-print-root h4,
  .invoice-print-root h5,
  .invoice-print-root h6,
  .invoice-print-root blockquote,
  .invoice-print-root figure,
  .invoice-print-root dl,
  .invoice-print-root dd {
    margin: 0;
  }
  .invoice-print-root table {
    border-collapse: collapse;
    border-spacing: 0;
  }
  .invoice-print-root td,
  .invoice-print-root th {
    padding: 0;
  }
  .invoice-print-root table[data-borderless="true"] {
    border-color: transparent !important;
  }
  .invoice-print-root table[data-borderless="true"] td,
  .invoice-print-root table[data-borderless="true"] th {
    border: none !important;
    background: transparent !important;
  }
  .invoice-print-root table[data-borderless="true"] tr > :first-child {
    padding-left: 0 !important;
  }
  .invoice-print-root table[data-borderless="true"] tr > :last-child {
    padding-right: 0 !important;
  }
`;
