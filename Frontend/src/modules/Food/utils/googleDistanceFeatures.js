/**
 * Admin-controlled Google Maps distance feature flags.
 * Defaults ON so existing road-distance behavior is unchanged until toggled off.
 */

import {
  loadCorePublicAppConfig,
  isFeatureEnabled,
} from "@food/services/publicAppConfig"

export const GOOGLE_DISTANCE_FEATURE_KEYS = {
  HOME_ROAD_DISTANCE: "google_home_road_distance",
  ORDER_ROAD_DISTANCE: "google_order_road_distance",
}

export async function isGoogleHomeRoadDistanceEnabled() {
  try {
    await loadCorePublicAppConfig()
  } catch {
    // If config fails to load, keep current (Google ON) behavior.
  }
  return isFeatureEnabled(GOOGLE_DISTANCE_FEATURE_KEYS.HOME_ROAD_DISTANCE, true)
}

export async function isGoogleOrderRoadDistanceEnabled() {
  try {
    await loadCorePublicAppConfig()
  } catch {
    // If config fails to load, keep current (Google ON) behavior.
  }
  return isFeatureEnabled(GOOGLE_DISTANCE_FEATURE_KEYS.ORDER_ROAD_DISTANCE, true)
}
