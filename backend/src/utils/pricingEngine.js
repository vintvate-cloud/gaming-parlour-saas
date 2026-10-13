// Core pricing engine. Every game type's bill is computed here, driven
// entirely by data stored on the gameType record (and the global grace
// period setting) - never by hardcoded game-type names - so that owners
// can fully edit rate cards and tier boundaries from Settings without any
// code changes.
//
// Three billing families cover every game type in the business:
//   - "player_tiered_minimum"  (PS5, Gaming Room): rate depends on player
//     count; a session has a 1-hour MINIMUM unless it's switched off.
//   - "tiered_flat_overflow"   (VR, Car Simulator, Pool Table): a ladder of
//     flat fees up to a duration boundary, then per-minute overflow.
//   - "simple_hourly"          (PC Gaming): flat hourly rate, per-minute
//     overflow past the grace boundary. No player-count tiers.

/**
 * Computes the bill for ONE segment in isolation, ignoring any
 * minimum-rate logic that depends on the whole session (that part is
 * only relevant to player_tiered_minimum and is handled by
 * calculateSessionTotal below). Used for tiered_flat_overflow and
 * simple_hourly, which are always evaluated on total duration directly
 * regardless of how many segments make up that duration.
 */
function calculateTieredFlatOverflow(durationMin, billingModel, graceMinutes) {
  const naiveCost = durationMin * (billingModel.overflowHourlyRate / 60);
  const tiers = billingModel.tiers || [];
  for (const tier of tiers) {
    if (durationMin <= tier.upToMinutes + graceMinutes) {
      return {
        amount: tier.flatFee,
        naiveCost,
        breakdown: `Flat fee (up to ${tier.upToMinutes} min + ${graceMinutes} min grace)`,
      };
    }
  }
  // Past every tier: take the last tier's base minute mark (NOT the
  // grace-inclusive mark) as the point from which overflow minutes are
  // counted, matching the PS5 pattern (75 min = 60-min mark + 15 extra,
  // not 65-min mark + 10 extra).
  const lastTier = tiers[tiers.length - 1];
  const baseMinutes = lastTier.upToMinutes;
  const baseFee = lastTier.flatFee;
  const extraMinutes = durationMin - baseMinutes;
  const perMinuteRate = billingModel.overflowHourlyRate / 60;
  const overflowAmount = extraMinutes * perMinuteRate;
  return {
    amount: baseFee + overflowAmount,
    naiveCost,
    breakdown: `Flat fee ₹${baseFee} + ${extraMinutes} extra min @ ₹${billingModel.overflowHourlyRate}/hr`,
  };
}

function calculateSimpleHourly(durationMin, billingModel, graceMinutes) {
  const naiveCost = durationMin * (billingModel.hourlyRate / 60);
  const threshold = 60 + graceMinutes;
  if (durationMin <= threshold) {
    return {
      amount: billingModel.hourlyRate,
      naiveCost,
      breakdown: `Flat hourly rate (up to 60 min + ${graceMinutes} min grace)`,
    };
  }
  const extraMinutes = durationMin - 60;
  const perMinuteRate = billingModel.hourlyRate / 60;
  const overflowAmount = extraMinutes * perMinuteRate;
  return {
    amount: billingModel.hourlyRate + overflowAmount,
    naiveCost,
    breakdown: `1 hour @ ₹${billingModel.hourlyRate} + ${extraMinutes} extra min @ ₹${billingModel.hourlyRate}/hr`,
  };
}

/**
 * Player-tiered-with-minimum billing (PS5, Gaming Room). This is the only
 * family where multiple segments interact with each other for billing
 * purposes (the minimum floor is the highest rate touched anywhere in the
 * session), so it takes the full segment list rather than one duration.
 *
 * minimumRateEnabled=false switches this off entirely (the "exception"
 * toggle for near-closing-time pricing) and falls back to pure per-minute
 * weighted billing with no 1-hour floor.
 */
function calculatePlayerTieredMinimum(segments, graceMinutes, minimumRateEnabled) {
  const totalDuration = segments.reduce((sum, seg) => sum + seg.durationMins, 0);
  const weightedCost = segments.reduce(
    (sum, seg) => sum + (seg.durationMins / 60) * seg.rate,
    0
  );

  if (!minimumRateEnabled) {
    return {
      amount: weightedCost,
      naiveCost: weightedCost,
      breakdown: "Per-minute basis (minimum rate switched off)",
      minimumRateApplied: false,
    };
  }

  const minimumFloor = Math.max(...segments.map((s) => s.rate));
  const threshold = 60 + graceMinutes;
  const uniqueRates = new Set(segments.map((s) => s.rate));

  // SINGLE RATE throughout the session (player count never changed): this
  // collapses to simple flat-rate-with-grace, exactly like every other
  // billing family - within the threshold, charge the flat 1-hour rate;
  // beyond it, charge the rate plus per-minute overflow. There is no
  // "weighted vs floor" comparison to make here, since with only one rate
  // weighted cost grows past the flat rate the longer the session runs
  // even while still inside the grace window - comparing against itself
  // would incorrectly overcharge short-but-not-trivial sessions.
  if (uniqueRates.size === 1) {
    const rate = segments[0].rate;
    if (totalDuration <= threshold) {
      return {
        amount: rate,
        naiveCost: weightedCost,
        breakdown: `1-hour flat rate (within ${graceMinutes} min grace)`,
        minimumRateApplied: true,
        minimumFloor: rate,
      };
    }
    const extraMinutes = totalDuration - 60;
    const overflowCost = extraMinutes * (rate / 60);
    return {
      amount: rate + overflowCost,
      naiveCost: weightedCost,
      breakdown: `1-hour rate (₹${rate}) + ${extraMinutes} extra min @ ₹${rate}/hr`,
      minimumRateApplied: true,
      minimumFloor: rate,
      overflowCost,
    };
  }

  // MULTIPLE RATES (player count changed mid-session): the highest rate
  // touched anywhere becomes the minimum floor. Within the grace window,
  // the bill is ALWAYS exactly that flat floor - never a time-weighted
  // blend, even if the blend happens to work out higher than the floor.
  // (An earlier version used max(weightedCost, minimumFloor) here, which
  // is wrong: that formula only protects the customer when the blend is
  // LOWER than the floor, but happily overcharges them whenever the
  // blend is higher - e.g. a session that spent more time at a higher
  // player count than a lower one. The whole point of "1-hour minimum"
  // pricing is that the customer pays a flat amount within that window,
  // not whichever of two numbers happens to be bigger.)
  if (totalDuration <= threshold) {
    return {
      amount: minimumFloor,
      naiveCost: weightedCost,
      breakdown:
        weightedCost < minimumFloor
          ? `1-hour minimum applied (₹${minimumFloor}) - actual usage was ₹${weightedCost.toFixed(2)}`
          : `1-hour minimum applied (₹${minimumFloor}) - capped from a higher blended usage of ₹${weightedCost.toFixed(2)}`,
      minimumRateApplied: true,
      minimumFloor,
      weightedCost,
    };
  }

  // Beyond the grace threshold: minimum floor for the first "hour" (as a
  // flat amount) plus every overflow minute billed at whichever segment's
  // rate was active during that specific minute.
  let elapsed = 0;
  let overflowCost = 0;
  for (const seg of segments) {
    const segStart = elapsed;
    const segEnd = elapsed + seg.durationMins;
    const overflowStart = Math.max(segStart, 60);
    const overflowEnd = segEnd;
    if (overflowEnd > overflowStart) {
      const overflowMins = overflowEnd - overflowStart;
      overflowCost += overflowMins * (seg.rate / 60);
    }
    elapsed = segEnd;
  }

  return {
    amount: minimumFloor + overflowCost,
    naiveCost: weightedCost,
    breakdown: `1-hour minimum (₹${minimumFloor}) + ${(totalDuration - 60).toFixed(0)} extra min at active rate(s) = ₹${overflowCost.toFixed(2)}`,
    minimumRateApplied: true,
    minimumFloor,
    overflowCost,
  };
}

/**
 * Main entry point. `gameType` is the full gameType record (with
 * billingModel attached). `segments` is the session's segment list -
 * every segment must share the same gameType for this to be meaningful,
 * which is already guaranteed by how station transfers work elsewhere
 * (transferring to a different game type is allowed, but each segment's
 * cost is computed independently against its OWN game type by the caller;
 * see sessions.js).
 *
 * Returns { amount, breakdown, minimumRateApplied, ... } - amount is
 * always in rupees, rounded by the caller (not here, to avoid compounding
 * rounding error across multiple calls).
 */
export function calculateBill(gameType, segments, graceMinutes, minimumRateEnabled = true) {
  const billingModel = gameType.billingModel;
  const weightedCost = segments.reduce(
    (sum, seg) => sum + (seg.durationMins / 60) * seg.rate,
    0
  );

  let result;

  if (!billingModel || !billingModel.billingType) {
    // Fallback for any game type that hasn't been migrated to the new
    // billing model yet - simple weighted per-minute, no minimum.
    result = { amount: weightedCost, naiveCost: weightedCost, breakdown: "Per-minute basis (no billing model configured)", minimumRateApplied: false };
  } else if (!minimumRateEnabled) {
    // The "remove minimum rate" exception switch, for near-closing-time
    // pricing: every billing family collapses to pure per-minute weighted
    // billing, ignoring tiers/grace/floors entirely.
    result = { amount: weightedCost, naiveCost: weightedCost, breakdown: "Per-minute basis (minimum rate switched off)", minimumRateApplied: false };
  } else {
    const totalDuration = segments.reduce((sum, seg) => sum + seg.durationMins, 0);
    switch (billingModel.billingType) {
      case "player_tiered_minimum":
        result = calculatePlayerTieredMinimum(segments, graceMinutes, true);
        break;
      case "tiered_flat_overflow":
        result = { ...calculateTieredFlatOverflow(totalDuration, billingModel, graceMinutes), minimumRateApplied: true };
        break;
      case "simple_hourly":
        result = { ...calculateSimpleHourly(totalDuration, billingModel, graceMinutes), minimumRateApplied: true };
        break;
      default:
        throw new Error(`Unknown billing type: ${billingModel.billingType}`);
    }
  }

  // Derived, presentation-friendly fields computed once here so every
  // billing family behaves consistently for the receipt/UI:
  //   - gracePeriodSavings: how much LESS the customer paid than naive
  //     per-minute billing would have charged, because a grace period or
  //     flat tier absorbed some minutes for free. Only ever >= 0; shown as
  //     an explicit "Grace period" discount line on the receipt.
  //   - minimumRateExtraCharge: how much MORE the customer paid than
  //     naive per-minute billing, because a 1-hour/flat minimum floor
  //     kicked in. This is NOT a discount - it's surfaced separately so
  //     the receipt can explain a price that's higher than raw usage.
  const naive = result.naiveCost ?? weightedCost;
  const diff = naive - result.amount;
  result.gracePeriodSavings = diff > 0.005 ? diff : 0;
  result.minimumRateExtraCharge = diff < -0.005 ? -diff : 0;

  return result;
}

function minutesBetween(startIso, endIso) {
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

/**
 * Computes the full bill for a session's segments, grouping consecutive
 * segments by gameType so the pricing engine's per-gameType rules (e.g.
 * PS5's minimum-floor logic) only ever combine segments that actually
 * belong to the same billing family. A customer who moves from PS5 to
 * Pool Table mid-visit gets two independent calculations - one per
 * gameType group - summed together, rather than one calculation that
 * incorrectly mixes two different rate cards.
 *
 * `segments` here are session segments with ISO startTime/endTime (endTime
 * may be omitted on the currently-open segment - it's treated as "now").
 * gameTypesByName: a Map of gameType.name -> full gameType record.
 *
 * Returns:
 *   {
 *     rawTotal,              // sum of every group's billed amount, before discount
 *     totalGracePeriodSavings, totalMinimumRateExtraCharge,  // summed across groups
 *     groups: [{ gameType, segments, amount, breakdown, minimumRateApplied,
 *                gracePeriodSavings, minimumRateExtraCharge, durationMins }]
 *   }
 */
export function calculateSessionBill(segments, gameTypesByName, graceMinutes, minimumRateEnabled) {
  const groups = [];
  let currentGroup = null;

  for (const seg of segments) {
    if (currentGroup && currentGroup.gameType === seg.gameType) {
      currentGroup.segments.push(seg);
    } else {
      currentGroup = { gameType: seg.gameType, segments: [seg] };
      groups.push(currentGroup);
    }
  }

  let rawTotal = 0;
  let totalGracePeriodSavings = 0;
  let totalMinimumRateExtraCharge = 0;

  const groupResults = groups.map((group) => {
    const gameTypeDoc = gameTypesByName.get(group.gameType) || {};
    const segmentsForEngine = group.segments.map((s) => ({
      durationMins: minutesBetween(s.startTime, s.endTime || new Date().toISOString()),
      rate: s.rate,
    }));
    const durationMins = segmentsForEngine.reduce((sum, s) => sum + s.durationMins, 0);
    const result = calculateBill(gameTypeDoc, segmentsForEngine, graceMinutes, minimumRateEnabled);

    rawTotal += result.amount;
    totalGracePeriodSavings += result.gracePeriodSavings;
    totalMinimumRateExtraCharge += result.minimumRateExtraCharge;

    return { gameType: group.gameType, durationMins, segments: group.segments, ...result };
  });

  return { rawTotal, totalGracePeriodSavings, totalMinimumRateExtraCharge, groups: groupResults };
}
