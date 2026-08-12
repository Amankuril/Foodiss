/** Fixed 18% GST on delivery fee (matches backend order-pricing.service.js). */
export const DELIVERY_FEE_GST_RATE = 0.18

export function computeDeliveryFeeGst(deliveryFee, deliverySurge = 0) {
  const base = Math.max(0, Number(deliveryFee) || 0) + Math.max(0, Number(deliverySurge) || 0)
  if (base <= 0) return 0
  return Math.round(base * DELIVERY_FEE_GST_RATE * 100) / 100
}

/** Use stored GST when present; otherwise derive 18% from base delivery fee + surge. */
export function resolveDeliveryFeeGst(deliveryFee, deliveryFeeGst, deliverySurge = 0) {
  const base = Math.max(0, Number(deliveryFee) || 0) + Math.max(0, Number(deliverySurge) || 0)
  if (base <= 0) return 0
  const stored = Number(deliveryFeeGst)
  if (Number.isFinite(stored) && stored > 0) return stored
  return computeDeliveryFeeGst(deliveryFee, deliverySurge)
}

export function getDeliveryFeeTotal(deliveryFee, deliveryFeeGst, deliverySurge = 0) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  const surge = Math.max(0, Number(deliverySurge) || 0)
  if (base <= 0 && surge <= 0) return 0
  const gst = resolveDeliveryFeeGst(base, deliveryFeeGst, surge)
  return Math.round((base + surge + gst) * 100) / 100
}

/**
 * Compact subtext for bill rows, e.g. "₹40.00 + ₹10.00 surge + ₹9.00 (GST 18%)"
 */
export function formatDeliveryFeeBreakdownSubtext(deliveryFee, deliveryFeeGst, rupee = "\u20B9", deliverySurge = 0) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  const surge = Math.max(0, Number(deliverySurge) || 0)
  const charge = base + surge
  if (charge <= 0) return ""
  const gst = resolveDeliveryFeeGst(base, deliveryFeeGst, surge)
  const parts = []
  if (base > 0) parts.push(`${rupee}${base.toFixed(2)}`)
  if (surge > 0) parts.push(`${rupee}${surge.toFixed(2)} surge`)
  if (gst > 0) parts.push(`${rupee}${gst.toFixed(2)} (GST 18%)`)
  return parts.join(" + ")
}

/**
 * Format delivery fee for bill breakdown, e.g. "₹40.00 + 10.00 surge + 9.00 (GST 18%)"
 */
export function formatDeliveryFeeWithGst(deliveryFee, deliveryFeeGst, rupee = "\u20B9", deliverySurge = 0) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  const surge = Math.max(0, Number(deliverySurge) || 0)
  const charge = base + surge
  if (charge <= 0) return "FREE"
  const gst =
    deliveryFeeGst != null && Number.isFinite(Number(deliveryFeeGst))
      ? Number(deliveryFeeGst)
      : computeDeliveryFeeGst(base, surge)
  const parts = []
  if (base > 0) parts.push(`${rupee}${base.toFixed(2)}`)
  if (surge > 0) parts.push(`${surge.toFixed(2)} surge`)
  if (gst > 0) parts.push(`${gst.toFixed(2)} (GST 18%)`)
  return parts.join(" + ")
}

export function formatDeliverySurgeLabel(deliverySurgeType, deliverySurgeValue) {
  const type = String(deliverySurgeType || "none")
  const value = Number(deliverySurgeValue) || 0
  if (type === "percentage" && value > 0) return `${value}% surge`
  if (type === "flat" && value > 0) return `₹${value} flat surge`
  return "No surge"
}
