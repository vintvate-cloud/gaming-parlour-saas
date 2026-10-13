import ExcelJS from "exceljs";

// Colors are keyed to WHAT changed during a multi-segment visit, matching
// the same scheme used in the History page UI, so the spreadsheet and the
// in-app view read consistently: a screen change, a player-count change,
// and a visit with both look different from each other, not just
// "grouped vs not grouped".
const CHANGE_TYPE_COLORS = {
  station: "FFE9D5F5", // soft purple
  players: "FFD2F0E8", // soft teal
  both: "FFFCE3CC", // soft orange
};
const FALLBACK_BAND_COLOR = "FFD7ECFF"; // soft blue, used if changeTypesSummary is unavailable
const HEADER_FILL = "FF1E293B"; // matches the app's panel color
const HEADER_FONT = "FFFFFFFF";

/**
 * Builds an .xlsx Buffer from an array of row objects and column definitions.
 * columns: [{ header, value(row), width? }]
 * Rows belonging to the same multi-segment session (same groupIndex, and
 * segmentCount > 1) are filled with a color reflecting what changed during
 * that visit (screen, players, or both) - this is the "club rows together
 * and highlight by what changed" requirement.
 */
export async function buildHighlightedWorkbook({ sheetName, columns, rows, title }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gaming Parlour";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  if (title) {
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    sheet.addRow([]); // spacer
  }

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle" };
  });

  rows.forEach((row) => {
    const dataRow = sheet.addRow(columns.map((c) => c.value(row)));
    const isPartOfGroup = row.segmentCount > 1;

    if (isPartOfGroup) {
      const color = CHANGE_TYPE_COLORS[row.changeTypesSummary] || FALLBACK_BAND_COLOR;
      dataRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      });
    }

    if (row.isException) {
      // Exceptions get a bold red font on top of any group color, so they
      // stand out even within a highlighted group.
      dataRow.eachCell((cell) => {
        cell.font = { ...(cell.font || {}), color: { argb: "FFB91C1C" }, bold: true };
      });
    }
  });

  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width || 18;
  });

  sheet.views = [{ state: "frozen", ySplit: title ? 3 : 1 }];

  return workbook.xlsx.writeBuffer();
}
