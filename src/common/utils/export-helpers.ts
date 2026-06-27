import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * Generates an Excel sheet from headers and rows
 */
export async function generateExcel(
  sheetName: string,
  headers: string[],
  rows: any[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add headers
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFF' },
      size: 11,
      name: 'Segoe UI',
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0F172A' }, // Slate 900
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  headerRow.height = 28;

  // Add rows
  rows.forEach((row) => {
    const r = worksheet.addRow(row);
    r.height = 20;
    r.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  });

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell!({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      let cellValue = '';
      if (val !== null && val !== undefined) {
        if (val instanceof Date) {
          cellValue = val.toISOString();
        } else if (typeof val === 'object') {
          const obj = val as any;
          cellValue = obj.text ? String(obj.text) : (obj.result ? String(obj.result) : JSON.stringify(val));
        } else {
          cellValue = String(val);
        }
      }
      if (cellValue.length > maxLen) {
        maxLen = cellValue.length;
      }
    });
    column.width = Math.max(maxLen + 4, 12);
  });

  // Add borders and grid lines
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generates a styled PDF report from headers and rows
 */
export async function generatePDF(
  title: string,
  headers: string[],
  rows: any[][],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Create a new PDF document
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    // Page dimensions
    const startX = 40;
    const pageWidth = doc.page.width - 80;
    const bottomMargin = 55;
    const colWidth = pageWidth / headers.length;

    // Table Header drawing helper
    const drawPageHeader = (isFirstPage: boolean) => {
      if (isFirstPage) {
        // Document Title & Metadata
        doc
          .fontSize(22)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text(title, startX, 40);
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(`Generated on: ${new Date().toLocaleString()}`, startX, 68);
        doc.moveDown(2);
      } else {
        // Top margin space on new page
        doc.y = 40;
      }

      const currentY = doc.y;

      // Draw Header Background
      doc.rect(startX, currentY, pageWidth, 24).fill('#0f172a');

      // Draw Header Labels
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
      headers.forEach((header, i) => {
        doc.text(header, startX + i * colWidth + 6, currentY + 7, {
          width: colWidth - 12,
          align: 'left',
          ellipsis: true,
        });
      });

      doc.y = currentY + 24; // Advance cursor below header
    };

    // Initialize first page header
    drawPageHeader(true);

    // Render Rows
    doc.fontSize(9).font('Helvetica').fillColor('#334155');

    rows.forEach((row, rowIndex) => {
      // Check for page overflow
      if (doc.y > doc.page.height - bottomMargin - 24) {
        doc.addPage();
        drawPageHeader(false);
        doc.fontSize(9).font('Helvetica').fillColor('#334155');
      }

      const currentY = doc.y;
      const rowHeight = 22;

      // Draw alternating row background (light grey/blue)
      if (rowIndex % 2 === 1) {
        doc.rect(startX, currentY, pageWidth, rowHeight).fill('#f8fafc');
      }

      // Draw cell texts
      doc.fillColor('#334155');
      row.forEach((cell, colIndex) => {
        const text = String(cell ?? '');
        doc.text(text, startX + colIndex * colWidth + 6, currentY + 6, {
          width: colWidth - 12,
          align: 'left',
          ellipsis: true,
        });
      });

      // Draw row bottom border line
      doc
        .lineWidth(0.5)
        .strokeColor('#e2e8f0')
        .moveTo(startX, currentY + rowHeight)
        .lineTo(startX + pageWidth, currentY + rowHeight)
        .stroke();

      doc.y = currentY + rowHeight;
    });

    doc.end();
  });
}
