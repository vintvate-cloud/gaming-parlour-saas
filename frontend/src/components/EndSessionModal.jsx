import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import TimeAdjuster from "./TimeAdjuster";
import api from "../utils/api";

function GroupLine({ group }) {
  return (
    <div className="bg-panelLight rounded-lg p-3 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-white">{group.gameType}</span>
        <span className="text-slate-300">{group.durationMins} min</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">{group.breakdown}</span>
        <span className="font-bold text-white">₹{group.amount.toFixed(0)}</span>
      </div>
      {group.gracePeriodSavings > 0 && (
        <div className="flex justify-between text-xs text-green-400">
          <span>Grace period discount</span>
          <span>-₹{group.gracePeriodSavings.toFixed(0)}</span>
        </div>
      )}
      {group.minimumRateExtraCharge > 0 && (
        <p className="text-xs text-slate-500">ⓘ 1-hour minimum rate applied</p>
      )}
    </div>
  );
}

export default function EndSessionModal({ session, onClose, onEnded }) {
  // Captured ONCE, the instant this component mounts (i.e. the moment
  // "End Session" was clicked) - this is what actually gets billed, no
  // matter how long the employee spends deciding on a discount or
  // round-down afterward. Using a lazy useState initializer (a function,
  // not a value) guarantees this runs exactly once, on the very first
  // render, rather than being recomputed on every re-render.
  const [lockedEndTime] = useState(() => new Date());

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [minimumRateEnabled, setMinimumRateEnabled] = useState(true);

  const [editEndTime, setEditEndTime] = useState(false);
  const [endTime, setEndTime] = useState(lockedEndTime);

  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountMode, setDiscountMode] = useState("amount"); // "amount" | "minutes"
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountMinutes, setDiscountMinutes] = useState(0);
  const [discountReason, setDiscountReason] = useState("");

  const [roundDownEnabled, setRoundDownEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/settings")
      .then((res) => {
        // Round-down is a GLOBAL setting now (Settings -> General), not a
        // per-session switch - this just reads the current default so the
        // live total preview matches what will actually be billed.
        if (!cancelled) setRoundDownEnabled(res.data.roundDownDefaultEnabled !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(null); // null | "cash" | "upi" | "pending"

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError("");
    try {
      const payload = {
        minimumRateEnabled,
        lockedEndTime: lockedEndTime.toISOString(),
      };
      if (editEndTime) payload.manualOverrideEndTime = endTime.toISOString();
      const res = await api.post(`/sessions/${session.id}/end-preview`, payload);
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not calculate the bill");
    } finally {
      setLoadingPreview(false);
    }
  }, [session.id, minimumRateEnabled, editEndTime, endTime, lockedEndTime]);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimumRateEnabled, editEndTime]);

  // Re-fetch when the user finishes adjusting the end time, but not on
  // every keystroke/click - debounce slightly via effect dependency on
  // a stable string rather than the Date object reference.
  useEffect(() => {
    if (!editEndTime) return;
    const t = setTimeout(loadPreview, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTime.getTime()]);

  // The current/active segment's rate, used to convert a discount
  // expressed in minutes into a rupee amount.
  const lastGroupRate = session.rate;

  const liveDiscountAmount = !discountEnabled
    ? 0
    : discountMode === "minutes"
    ? Number(discountMinutes || 0) * (lastGroupRate / 60)
    : Number(discountAmount || 0);

  const rawTotal = preview?.rawTotal || 0;
  const afterDiscount = Math.max(0, rawTotal - liveDiscountAmount);
  const roundedTotal = roundDownEnabled ? Math.floor(afterDiscount / 10) * 10 : afterDiscount;
  const roundDownAmount = afterDiscount - roundedTotal;
  const finalTotal = roundedTotal;

  // Remarks are shown whenever either switch has been touched away from
  // its default (minimum-rate off, or a discount applied), but per
  // requirement they're NEVER mandatory - just available, in case staff
  // want to leave a note for the owner to review later.
  const minimumRateTouched = !minimumRateEnabled;
  const discountTouched = discountEnabled && liveDiscountAmount > 0;
  const showReasonField = minimumRateTouched || discountTouched;

  async function handlePay(method) {
    setError("");
    setSubmitting(method);
    try {
      const payload = {
        minimumRateEnabled,
        paymentMethod: method,
        roundDown: roundDownEnabled,
        lockedEndTime: lockedEndTime.toISOString(),
      };
      if (editEndTime) payload.manualOverrideEndTime = endTime.toISOString();
      if (discountEnabled && liveDiscountAmount > 0) {
        if (discountMode === "minutes") payload.discountMinutes = Number(discountMinutes);
        else payload.discountAmount = Number(discountAmount);
      }
      if (showReasonField && discountReason.trim()) {
        payload.discountReason = discountReason.trim();
      }

      const res = await api.post(`/sessions/${session.id}/end`, payload);
      onEnded(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not end the session");
      setSubmitting(null);
    }
  }

  return (
    <Modal title="End Session" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Calculation breakdown */}
        {loadingPreview ? (
          <p className="text-slate-400 text-sm">Calculating...</p>
        ) : preview ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">Bill breakdown:</p>
            {preview.groups.map((g, i) => (
              <GroupLine key={i} group={g} />
            ))}
            <div className="flex justify-between text-sm pt-1 border-t border-border">
              <span className="text-slate-300">Subtotal</span>
              <span className="font-semibold text-white">₹{rawTotal.toFixed(0)}</span>
            </div>
            {liveDiscountAmount > 0 && (
              <div className="flex justify-between text-sm text-yellow-400">
                <span>Discount applied</span>
                <span>-₹{liveDiscountAmount.toFixed(0)}</span>
              </div>
            )}
            {roundDownAmount > 0 && (
              <div className="flex justify-between text-sm text-purple-400">
                <span>Round-down discount</span>
                <span>-₹{roundDownAmount.toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg pt-1 border-t border-border">
              <span className="font-bold text-white">Total</span>
              <span className="font-bold text-accent">₹{finalTotal.toFixed(0)}</span>
            </div>
          </div>
        ) : null}

        {/* End time correction */}
        <div className="border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={editEndTime}
              onChange={(e) => setEditEndTime(e.target.checked)}
              className="rounded border-border"
            />
            This session actually ended earlier
          </label>
          {editEndTime && (
            <div className="mt-2">
              <TimeAdjuster value={endTime} onChange={setEndTime} />
              <p className="text-xs text-yellow-400 mt-1.5">⚠️ Recorded as an exception.</p>
            </div>
          )}
        </div>

        {/* Switch 1: minimum rate */}
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Apply minimum rate</p>
            <p className="text-xs text-slate-500">Off = pure per-minute billing (closing time)</p>
          </div>
          <button
            type="button"
            onClick={() => setMinimumRateEnabled((v) => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              minimumRateEnabled ? "bg-accent" : "bg-panelLight border border-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                minimumRateEnabled ? "translate-x-6" : ""
              }`}
            />
          </button>
        </div>
        {!minimumRateEnabled && (
          <p className="text-xs text-yellow-400">⚠️ Minimum-rate switched off - recorded as an exception.</p>
        )}

        {/* Switch 2: discount */}
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Apply discount</p>
            <p className="text-xs text-slate-500">Default: no discount</p>
          </div>
          <button
            type="button"
            onClick={() => setDiscountEnabled((v) => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              discountEnabled ? "bg-accent" : "bg-panelLight border border-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                discountEnabled ? "translate-x-6" : ""
              }`}
            />
          </button>
        </div>

        {discountEnabled && (
          <div className="space-y-2 bg-panelLight rounded-lg p-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountMode("amount")}
                className={`flex-1 text-xs font-medium rounded-lg py-1.5 ${
                  discountMode === "amount" ? "bg-accent text-white" : "bg-base text-slate-400"
                }`}
              >
                By Amount (₹)
              </button>
              <button
                type="button"
                onClick={() => setDiscountMode("minutes")}
                className={`flex-1 text-xs font-medium rounded-lg py-1.5 ${
                  discountMode === "minutes" ? "bg-accent text-white" : "bg-base text-slate-400"
                }`}
              >
                By Minutes
              </button>
            </div>
            {discountMode === "amount" ? (
              <input
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="Discount amount in ₹"
                className="w-full bg-base border border-border rounded-lg px-3 py-2 text-white"
              />
            ) : (
              <input
                type="number"
                min="0"
                value={discountMinutes}
                onChange={(e) => setDiscountMinutes(e.target.value)}
                placeholder="Discount in minutes"
                className="w-full bg-base border border-border rounded-lg px-3 py-2 text-white"
              />
            )}
          </div>
        )}

        {showReasonField && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Remarks <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              rows={2}
              placeholder="Reason for discount or minimum-rate override..."
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        )}

        {/* Payment method buttons */}
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-slate-300 mb-2">Payment received via:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handlePay("cash")}
              disabled={submitting !== null || loadingPreview}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {submitting === "cash" ? "..." : "💵 Cash"}
            </button>
            <button
              onClick={() => handlePay("upi")}
              disabled={submitting !== null || loadingPreview}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {submitting === "upi" ? "..." : "📱 UPI"}
            </button>
            <button
              onClick={() => handlePay("pending")}
              disabled={submitting !== null || loadingPreview}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {submitting === "pending" ? "..." : "⏱ Pending"}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full border border-border text-slate-300 rounded-lg py-2 hover:bg-panelLight transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
