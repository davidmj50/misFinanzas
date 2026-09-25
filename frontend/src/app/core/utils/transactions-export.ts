import writeXlsxFile from 'write-excel-file/browser';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from '../models/finance.models';

function rowsFor(transactions: Transaction[]) {
  return transactions.map((t) => ({
    date: t.date.slice(0, 10),
    account: t.account?.name ?? '',
    type: t.type === 'INCOME' ? 'Ingreso' : 'Gasto',
    category: t.category?.name ?? 'Sin categoría',
    merchant: t.merchant ?? '',
    description: t.description ?? '',
    amount: Number(t.amount),
  }));
}

export async function exportTransactionsToExcel(transactions: Transaction[], fileName: string) {
  const rows = rowsFor(transactions);
  type Row = (typeof rows)[number];

  await writeXlsxFile<Row>(rows, {
    columns: [
      { header: 'Fecha', width: 12, cell: (r) => r.date },
      { header: 'Cuenta', width: 20, cell: (r) => r.account },
      { header: 'Tipo', width: 10, cell: (r) => r.type },
      { header: 'Categoría', width: 20, cell: (r) => r.category },
      { header: 'Comercio', width: 20, cell: (r) => r.merchant },
      { header: 'Descripción', width: 30, cell: (r) => r.description },
      { header: 'Monto', width: 14, cell: (r) => r.amount },
    ],
  }).toFile(fileName);
}

export function exportTransactionsToPdf(transactions: Transaction[], fileName: string) {
  const rows = rowsFor(transactions);
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.text('Transacciones - MisFinanzas', 14, 14);

  autoTable(doc, {
    startY: 20,
    head: [['Fecha', 'Cuenta', 'Tipo', 'Categoría', 'Comercio', 'Descripción', 'Monto']],
    body: rows.map((r) => [
      r.date,
      r.account,
      r.type,
      r.category,
      r.merchant,
      r.description,
      r.amount.toLocaleString('es-CO'),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [50, 31, 219] },
  });

  doc.save(fileName);
}
