import { useState } from "react";
import api from "../utils/api";
import { useBranding } from "../context/BrandingContext";
import { toDateStr, toTimeStr, sanitizeForFilename } from "../utils/dateHelpers";

export default function SessionReceiptModal({ session, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const { businessName } = useBranding();

  const groups = session.billingGroups || [];
  const rawTotal = groups.reduce((sum, g) => sum + g.amount, 0);
  const totalGraceSavings = groups.reduce((sum, g) => sum + (g.gracePeriodSavings || 0), 0);
  const firstGroupSegments = groups.length ? groups[0].segments : null;
  const lastGroupSegments = groups.length ? groups[groups.length - 1].segments : null;
  const overallStart = (firstGroupSegments && firstGroupSegments[0]?.startTime) || session.startTime;
  const overallEnd =
    (lastGroupSegments && lastGroupSegments[lastGroupSegments.length - 1]?.endTime) ||
    session.startTime;

  // Filename: gametype(s)_date_in-out-times - e.g. "PS5_2026-06-27_1430-1545",
  // or "PS5+Pool_..." for a multi-station visit, so the file itself tells
  // you what it was and when without opening it.
  function buildReceiptFilename() {
    const gameTypeNames = [...new Set(groups.map((g) => g.gameType))];
    const gameTypeLabel = sanitizeForFilename(gameTypeNames.join("+")) || "session";
    const dateLabel = toDateStr(new Date(overallStart));
    const timeLabel = `${toTimeStr(new Date(overallStart))}-${toTimeStr(new Date(overallEnd))}`;
    return `receipt_${gameTypeLabel}_${dateLabel}_${timeLabel}.pdf`;
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const res = await api.get(`/sessions/${session.id}/receipt-pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", buildReceiptFilename());
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Could not download the receipt PDF");
    } finally {
      setDownloading(false);
    }
  }

  // Payment status is shown only when ALREADY paid - per requirement, a
  // "payment pending" state is never printed on the receipt itself, since
  // handing a customer a receipt that says their payment is pending reads
  // oddly. The Pending Payments page is where staff track that instead.
  const showPaidLine = session.paymentStatus === "paid";
  const paymentLabel = { cash: "Cash", upi: "UPI" }[session.paymentMethod] || session.paymentMethod;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="relative w-full max-w-[420px]">
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 w-11 h-11 rounded-full bg-[#1C1B19] text-[#FAF8F4] flex items-center justify-center text-2xl shadow-lg hover:bg-black active:scale-95 transition-all z-10"
          aria-label="Close"
        >
          ×
        </button>

        {/* The receipt itself - a distinct "paper" surface against the dark backdrop */}
        <div
          className="bg-[#FAF8F4] text-[#1C1B19] rounded-sm shadow-2xl px-8 py-9"
          style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}
        >
          {/* Letterhead */}
          <div className="text-center mb-6">
            <h3
              className="text-[22px] tracking-[0.18em] uppercase mb-1"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.12em" }}
            >
              {businessName}
            </h3>
            <div className="h-px bg-[#1C1B19] w-12 mx-auto mb-2" />
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#8B8680]">
              Station Receipt
            </p>
          </div>

          {/* Customer + date */}
          <div className="text-[12px] space-y-0.5 mb-5" style={{ fontVariantNumeric: "tabular-nums" }}>
            <div className="flex justify-between">
              <span className="text-[#8B8680]">Customer</span>
              <span>{session.customerName || "Walk-in"}</span>
            </div>
            {session.phone && (
              <div className="flex justify-between">
                <span className="text-[#8B8680]">Phone</span>
                <span>{session.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#8B8680]">Date</span>
              <span>
                {new Date(overallEnd).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                {new Date(overallEnd).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-[#C9C2B6] my-4" />

          {/* Line items */}
          <div className="space-y-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {groups.map((g, idx) => (
              <div key={idx}>
                <div className="flex justify-between">
                  <span>
                    {g.gameType}
                    <span className="text-[#8B8680]"> · {g.durationMins}min</span>
                  </span>
                  <span>₹{g.amount.toFixed(0)}</span>
                </div>
                {g.gracePeriodSavings > 0 && (
                  <div className="flex justify-between text-[#8B8680] text-[11px] pl-3">
                    <span>grace period</span>
                    <span>-₹{g.gracePeriodSavings.toFixed(0)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-[#C9C2B6] my-4" />

          {/* Totals */}
          <div className="space-y-1 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <div className="flex justify-between text-[#8B8680]">
              <span>Subtotal</span>
              <span>₹{rawTotal.toFixed(0)}</span>
            </div>
            {totalGraceSavings > 0 && (
              <div className="flex justify-between text-[#8B8680]">
                <span>Grace period</span>
                <span>-₹{totalGraceSavings.toFixed(0)}</span>
              </div>
            )}
            {session.discount > 0 && (
              <div className="flex justify-between text-[#8B8680]">
                <span>Discount</span>
                <span>-₹{session.discount.toFixed(0)}</span>
              </div>
            )}
            {session.roundDownAmount > 0 && (
              <div className="flex justify-between text-[#8B8680]">
                <span>Round-down</span>
                <span>-₹{session.roundDownAmount.toFixed(0)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-[#1C1B19] mt-3 pt-3 flex justify-between items-baseline">
            <span className="text-[13px] tracking-[0.1em] uppercase">Total</span>
            <span
              className="text-[22px] font-bold"
              style={{ color: "#B8542E", fontVariantNumeric: "tabular-nums" }}
            >
              ₹{session.total.toFixed(0)}
            </span>
          </div>

          {showPaidLine && (
            <p className="text-center text-[11px] text-[#8B8680] mt-3 tracking-wide">
              Paid via {paymentLabel}
            </p>
          )}

          {session.discountReason && (
            <p className="text-[10px] text-[#8B8680] mt-3 italic">Note: {session.discountReason}</p>
          )}

          <div className="border-t border-dashed border-[#C9C2B6] mt-6 pt-4 text-center">
            <p className="text-[10px] text-[#8B8680]">Served by {session.employeeName || "-"}</p>
            <p className="text-[11px] tracking-[0.15em] uppercase mt-2 text-[#1C1B19]">
              Thank you for visiting
            </p>
          </div>
        </div>

        {/* Actions live outside the "paper", on the dark backdrop */}
        <div className="mt-4 space-y-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2 text-center">
              {error}
            </div>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="w-full bg-white/10 hover:bg-white/15 text-white font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60 border border-white/15"
          >
            {downloading ? "Preparing PDF…" : "Download Receipt (PDF)"}
          </button>
        </div>
      </div>
    </div>
  );
}
