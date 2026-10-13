import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// A narrow page width (80mm thermal-receipt-style, in points: 80mm ≈ 227pt)
// is used so this same layout logic can later feed an actual thermal
// printer with minimal changes - the receipt is built as a list of lines
// rather than a fixed business-letter layout.
//
// Typography: Times-Roman for the letterhead (a serif, used only for the
// business name, set letter-spaced like an engraving) and Courier for
// everything else (a genuine monospace, so amounts line up in a column
// like a real till receipt - this is the one signature move that makes
// the whole thing read as "receipt" rather than "generic printout").
// Both are pdf-lib standard fonts, so no custom font embedding is needed.
const PAGE_WIDTH = 280;
const MARGIN = 18;
const LINE_HEIGHT = 14;

const INK = rgb(0.11, 0.105, 0.1);
const MUTED = rgb(0.55, 0.52, 0.49);
const ACCENT = rgb(0.72, 0.33, 0.18);
const HAIRLINE = rgb(0.79, 0.76, 0.71);

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function letterSpace(text, spaces = 1) {
  return text.split("").join(" ".repeat(spaces));
}

/**
 * Builds a receipt PDF for a completed session and returns it as a Buffer.
 * `session` should be the mirrored session object plus `billingGroups`
 * (the persisted, actually-charged amounts from POST /sessions/:id/end -
 * NOT a fresh recomputation, since minimumRateEnabled was a point-in-time
 * checkout decision). Per design: payment-pending status is intentionally
 * never printed here - this is a customer-facing document, and Pending
 * Payments tracking happens inside the app, not on the receipt.
 */
export async function buildReceiptPdf(session, branding = {}) {
  const businessName = branding.businessName || "Gaming Parlour";
  const groups = session.billingGroups || [];
  const rawTotal = groups.reduce((sum, g) => sum + g.amount, 0);
  const totalGraceSavings = groups.reduce((sum, g) => sum + (g.gracePeriodSavings || 0), 0);
  const lastGroupSegments = groups.length ? groups[groups.length - 1].segments : null;
  const overallEnd =
    (lastGroupSegments && lastGroupSegments[lastGroupSegments.length - 1]?.endTime) ||
    session.startTime;

  const pdfDoc = await PDFDocument.create();
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const lineCountEstimate = 14 + groups.length * 2 + (session.roundDownAmount > 0 ? 1 : 0);
  const pageHeight = Math.max(320, lineCountEstimate * LINE_HEIGHT + 70);

  const page = pdfDoc.addPage([PAGE_WIDTH, pageHeight]);
  let y = pageHeight - MARGIN - 6;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  function centerText(text, size, font = mono, color = INK) {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (PAGE_WIDTH - textWidth) / 2, y, size, font, color });
    y -= LINE_HEIGHT;
  }

  function leftRightText(left, right, size = 9, font = mono, color = INK) {
    page.drawText(left, { x: MARGIN, y, size, font, color });
    const rightWidth = font.widthOfTextAtSize(right, size);
    page.drawText(right, { x: PAGE_WIDTH - MARGIN - rightWidth, y, size, font, color });
    y -= LINE_HEIGHT;
  }

  function hairline(dashed = false) {
    if (dashed) {
      // pdf-lib has no native dashed-line option, so approximate one with
      // short segments - matches the dashed dividers on the on-screen receipt.
      const segLength = 3;
      const gapLength = 2;
      let x = MARGIN;
      while (x < PAGE_WIDTH - MARGIN) {
        page.drawLine({
          start: { x, y },
          end: { x: Math.min(x + segLength, PAGE_WIDTH - MARGIN), y },
          thickness: 0.6,
          color: HAIRLINE,
        });
        x += segLength + gapLength;
      }
    } else {
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.8,
        color: INK,
      });
    }
    y -= LINE_HEIGHT * 0.75;
  }

  // --- Letterhead ---
  // Reduce letter-spacing for longer names so the letterhead stays
  // readable within the narrow receipt width instead of overflowing.
  const letterheadSpacing = businessName.length > 14 ? 1 : 2;
  centerText(letterSpace(businessName.toUpperCase(), letterheadSpacing), 14, serif, INK);
  y -= 2;
  const ruleWidth = 30;
  page.drawLine({
    start: { x: (PAGE_WIDTH - ruleWidth) / 2, y: y + 4 },
    end: { x: (PAGE_WIDTH + ruleWidth) / 2, y: y + 4 },
    thickness: 0.8,
    color: INK,
  });
  y -= 6;
  centerText(letterSpace("STATION RECEIPT", 1), 7, mono, MUTED);
  y -= 4;

  // --- Customer info ---
  leftRightText("Customer", session.customerName || "Walk-in", 9, mono, INK);
  if (session.phone) {
    leftRightText("Phone", session.phone, 9, mono, INK);
  }
  const dateStr = new Date(overallEnd).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = new Date(overallEnd).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  leftRightText("Date", `${dateStr}  ${timeStr}`, 9, mono, INK);

  y -= 2;
  hairline(true);

  // --- Billing group line items ---
  groups.forEach((group, idx) => {
    leftRightText(
      `${group.gameType} . ${group.durationMins}min`,
      `Rs${group.amount.toFixed(0)}`,
      9,
      mono,
      INK
    );
    if (group.gracePeriodSavings > 0) {
      leftRightText("  grace period", `-Rs${group.gracePeriodSavings.toFixed(0)}`, 7.5, mono, MUTED);
    }
    if (idx < groups.length - 1) y -= 4;
  });

  y -= 2;
  hairline(true);

  // --- Totals ---
  leftRightText("Subtotal", `Rs${rawTotal.toFixed(0)}`, 9, mono, MUTED);
  if (totalGraceSavings > 0) {
    leftRightText("Grace period", `-Rs${totalGraceSavings.toFixed(0)}`, 9, mono, MUTED);
  }
  if (session.discount > 0) {
    leftRightText("Discount", `-Rs${session.discount.toFixed(0)}`, 9, mono, MUTED);
  }
  if (session.roundDownAmount > 0) {
    leftRightText("Round-down", `-Rs${session.roundDownAmount.toFixed(0)}`, 9, mono, MUTED);
  }

  y -= 3;
  hairline(false);

  leftRightText(letterSpace("TOTAL", 1), `Rs${session.total.toFixed(0)}`, 13, monoBold, ACCENT);
  y -= 4;

  if (session.paymentStatus === "paid") {
    const label = { cash: "Cash", upi: "UPI" }[session.paymentMethod] || session.paymentMethod;
    centerText(`Paid via ${label}`, 8, mono, MUTED);
  }

  if (session.discountReason) {
    y -= 2;
    const wrapped = wrapText(`Note: ${session.discountReason}`, mono, 7, contentWidth);
    wrapped.forEach((line) => {
      const lw = mono.widthOfTextAtSize(line, 7);
      page.drawText(line, { x: (PAGE_WIDTH - lw) / 2, y, size: 7, font: mono, color: MUTED });
      y -= LINE_HEIGHT * 0.8;
    });
  }

  y -= 4;
  hairline(true);
  centerText(`Served by ${session.employeeName || "-"}`, 7.5, mono, MUTED);
  y -= 2;
  centerText(letterSpace("THANK YOU FOR VISITING", 1), 8, mono, INK);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
