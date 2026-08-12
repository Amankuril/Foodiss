const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function calculateDeliverySurgeFromConfig(config, baseDeliveryFee) {
  const type = config?.surgeType || config?.deliverySurgeType || 'none';
  const value = Number(config?.surgeValue ?? config?.deliverySurgeValue) || 0;
  const enabled = config?.isEnabled !== false;
  const base = Math.max(0, Number(baseDeliveryFee) || 0);

  if (!config || !enabled || type === 'none' || value <= 0 || base <= 0) {
    return {
      deliverySurge: 0,
      deliverySurgeType: 'none',
      deliverySurgeValue: 0,
    };
  }

  let surge = 0;
  if (type === 'percentage') {
    surge = round2(base * (value / 100));
  } else if (type === 'flat') {
    surge = round2(value);
  }

  return {
    deliverySurge: surge,
    deliverySurgeType: type,
    deliverySurgeValue: value,
  };
}

/** @deprecated Use calculateDeliverySurgeFromConfig */
export function calculateDeliverySurgeFromZone(zone, baseDeliveryFee) {
  return calculateDeliverySurgeFromConfig(zone, baseDeliveryFee);
}
