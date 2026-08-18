import { restaurantAPI } from "@food/api"
import { getRestaurantPendingPhone } from "@food/utils/auth"
const debugError = (...args) => {}

const hasImageValue = (value) => {
  if (!value) return false
  if (typeof value === "string") return Boolean(value.trim())
  if (value?.url && typeof value.url === "string") return Boolean(value.url.trim())
  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true
  return false
}

export const getMaxAllowedOnboardingStep = (step1, step2, step3) => {
  if (!isFormStepComplete(step1, 1)) return 1
  if (!isFormStepComplete(step2, 2)) return 2
  if (!isFormStepComplete(step3, 3)) return 3
  return 4
}

export const isFormStepComplete = (stepData, stepNumber) => {
  if (!stepData) return false

  if (stepNumber === 1) {
    return Boolean(
      String(stepData.restaurantName || "").trim() &&
      typeof stepData.pureVegRestaurant === "boolean" &&
      String(stepData.ownerName || "").trim() &&
      String(stepData.ownerEmail || "").trim() &&
      String(stepData.ownerPhone || "").trim() &&
      String(stepData.primaryContactNumber || "").trim() &&
      String(stepData.zoneId || "").trim() &&
      String(stepData.location?.area || "").trim() &&
      String(stepData.location?.city || "").trim()
    )
  }

  if (stepNumber === 2) {
    const menuImages = Array.isArray(stepData.menuImages) ? stepData.menuImages : stepData.menuImageUrls
    return Boolean(
      (stepData.openingTime || stepData.deliveryTimings?.openingTime) &&
      (stepData.closingTime || stepData.deliveryTimings?.closingTime) &&
      Array.isArray(stepData.openDays) &&
      stepData.openDays.length > 0 &&
      Array.isArray(menuImages) &&
      menuImages.some((img) => hasImageValue(img)) &&
      hasImageValue(stepData.profileImage || stepData.profileImageUrl) &&
      String(stepData.estimatedDeliveryTime || "").trim()
    )
  }

  if (stepNumber === 3) {
    const pan = stepData.pan || {}
    const gst = stepData.gst || {}
    const fssai = stepData.fssai || {}
    const bank = stepData.bank || {}
    const panNumber = stepData.panNumber || pan.panNumber
    const nameOnPan = stepData.nameOnPan || pan.nameOnPan
    const panImage = stepData.panImage || pan.image
    const fssaiNumber = stepData.fssaiNumber || fssai.registrationNumber
    const fssaiImage = stepData.fssaiImage || fssai.image
    const gstRegistered = typeof stepData.gstRegistered === "boolean"
      ? stepData.gstRegistered
      : Boolean(gst.isRegistered)
    const gstImage = stepData.gstImage || gst.image
    const accountNumber = stepData.accountNumber || bank.accountNumber
    const ifscCode = stepData.ifscCode || bank.ifscCode
    const accountHolderName = stepData.accountHolderName || bank.accountHolderName
    const accountType = stepData.accountType || bank.accountType

    const hasGstImage = !gstRegistered || hasImageValue(gstImage)

    return Boolean(
      panNumber &&
      nameOnPan &&
      hasImageValue(panImage) &&
      fssaiNumber &&
      hasImageValue(fssaiImage) &&
      hasGstImage &&
      accountNumber &&
      ifscCode &&
      accountHolderName &&
      accountType
    )
  }

  return false
}

// Helper function to check if a step is complete
const isStepComplete = (stepData, stepNumber) => {
  if (!stepData) return false

  if (stepNumber === 1) {
    return (
      stepData.restaurantName &&
      typeof stepData.pureVegRestaurant === "boolean" &&
      stepData.ownerName &&
      stepData.ownerEmail &&
      stepData.ownerPhone &&
      stepData.primaryContactNumber &&
      stepData.location?.area &&
      stepData.location?.city
    )
  }

  if (stepNumber === 2) {
    return (
      Array.isArray(stepData.cuisines) &&
      stepData.cuisines.length > 0 &&
      stepData.deliveryTimings?.openingTime &&
      stepData.deliveryTimings?.closingTime &&
      Array.isArray(stepData.openDays) &&
      stepData.openDays.length > 0 &&
      // Check for menu images (must have at least one)
      Array.isArray(stepData.menuImageUrls) &&
      stepData.menuImageUrls.length > 0 &&
      // Check for profile image
      stepData.profileImageUrl &&
      (stepData.profileImageUrl.url || typeof stepData.profileImageUrl === 'string')
    )
  }

  if (stepNumber === 3) {
    const hasPanImage = stepData.pan?.image && 
      (stepData.pan.image.url || typeof stepData.pan.image === 'string')
    const hasFssaiImage = stepData.fssai?.image && 
      (stepData.fssai.image.url || typeof stepData.fssai.image === 'string')
    // GST image is required only if GST is registered
    const hasGstImage = !stepData.gst?.isRegistered || 
      (stepData.gst?.image && (stepData.gst.image.url || typeof stepData.gst.image === 'string'))
    
    return (
      stepData.pan?.panNumber &&
      stepData.pan?.nameOnPan &&
      hasPanImage &&
      stepData.fssai?.registrationNumber &&
      hasFssaiImage &&
      hasGstImage &&
      stepData.bank?.accountNumber &&
      stepData.bank?.ifscCode &&
      stepData.bank?.accountHolderName &&
      stepData.bank?.accountType
    )
  }

  return false
}

const buildOnboardingLikeDataFromRestaurant = (restaurant) => {
  const onboarding = restaurant?.onboarding || {}

  const openingTime =
    restaurant?.openingTime ||
    restaurant?.deliveryTimings?.openingTime ||
    onboarding?.step2?.deliveryTimings?.openingTime
  const closingTime =
    restaurant?.closingTime ||
    restaurant?.deliveryTimings?.closingTime ||
    onboarding?.step2?.deliveryTimings?.closingTime

  return {
    completedSteps: onboarding.completedSteps,
    step1: onboarding.step1 || {
      restaurantName: restaurant?.restaurantName || restaurant?.name,
      pureVegRestaurant:
        typeof restaurant?.pureVegRestaurant === "boolean"
          ? restaurant.pureVegRestaurant
          : null,
      ownerName: restaurant?.ownerName,
      ownerEmail: restaurant?.ownerEmail || restaurant?.email,
      ownerPhone: restaurant?.ownerPhone || restaurant?.phone,
      primaryContactNumber: restaurant?.primaryContactNumber,
      location:
        restaurant?.location ||
        (restaurant?.area || restaurant?.city || restaurant?.addressLine1
          ? {
              addressLine1: restaurant?.addressLine1,
              addressLine2: restaurant?.addressLine2,
              area: restaurant?.area,
              city: restaurant?.city,
              landmark: restaurant?.landmark,
            }
          : null),
    },
    step2: onboarding.step2 || {
      cuisines: restaurant?.cuisines,
      deliveryTimings:
        restaurant?.deliveryTimings ||
        (openingTime || closingTime ? { openingTime, closingTime } : null),
      openDays: restaurant?.openDays,
      menuImageUrls: restaurant?.menuImages,
      profileImageUrl: restaurant?.profileImage,
    },
    step3:
      onboarding.step3 ||
      (restaurant?.panNumber ||
      restaurant?.fssaiNumber ||
      restaurant?.accountNumber ||
      restaurant?.ifscCode
        ? {
            pan: {
              panNumber: restaurant?.panNumber,
              nameOnPan: restaurant?.nameOnPan,
              image: restaurant?.panImage,
            },
            gst: {
              isRegistered: Boolean(restaurant?.gstRegistered),
              gstNumber: restaurant?.gstNumber,
              legalName: restaurant?.gstLegalName,
              address: restaurant?.gstAddress,
              image: restaurant?.gstImage,
            },
            fssai: {
              registrationNumber: restaurant?.fssaiNumber,
              expiryDate: restaurant?.fssaiExpiry,
              image: restaurant?.fssaiImage,
            },
            bank: {
              accountNumber: restaurant?.accountNumber,
              ifscCode: restaurant?.ifscCode,
              accountHolderName: restaurant?.accountHolderName,
              accountType: restaurant?.accountType,
            },
          }
        : null),
  }
}

export const isRestaurantOnboardingComplete = (restaurant) => {
  if (!restaurant) return false

  // Approved restaurants should never be forced into onboarding again.
  if (restaurant?.status === "approved") {
    return true
  }

  if (restaurant?.isActive === true) {
    return true
  }

  const onboardingLikeData = buildOnboardingLikeDataFromRestaurant(restaurant)
  if (onboardingLikeData.completedSteps === 4) {
    return true
  }

  const step1Complete = isStepComplete(onboardingLikeData.step1, 1)
  const step2Complete = isStepComplete(onboardingLikeData.step2, 2)
  const step3Complete = isStepComplete(onboardingLikeData.step3, 3)

  if (step1Complete && step2Complete && step3Complete) {
    return true
  }

  // Some older or migrated restaurant accounts have complete live profile data
  // without a reliable onboarding.completedSteps value.
  const hasOperationalProfile =
    Boolean(String(restaurant?.name || "").trim()) &&
    Boolean(String(restaurant?.restaurantId || "").trim()) &&
    Boolean(String(restaurant?.slug || "").trim()) &&
    step1Complete &&
    step2Complete &&
    (restaurant?.approvedAt || restaurant?.rejectedAt || restaurant?.rejectionReason || restaurant?.isActive === false)

  if (hasOperationalProfile) {
    return true
  }

  return false
}

// Determine which step to show based on completeness
export const determineStepToShow = (data) => {
  if (!data) return 1

  // If completedSteps is 4, onboarding is complete (admin-created restaurants)
  if (data.completedSteps === 4) {
    return null
  }

  // Check step 1
  if (!isStepComplete(data.step1, 1)) {
    return 1
  }

  // Check step 2
  if (!isStepComplete(data.step2, 2)) {
    return 2
  }

  // Check step 3
  if (!isStepComplete(data.step3, 3)) {
    return 3
  }

  // All steps complete - onboarding step 4 (payment) is handled on backend
  // User should be redirected to explore/dashboard after step 3 submission
  return null
}


// Check onboarding status from API and return the step to navigate to
export const checkOnboardingStatus = async () => {
  try {
    const restaurantResponse = await restaurantAPI.getMe()
    const restaurant =
      restaurantResponse?.data?.data?.user ||
      restaurantResponse?.data?.data?.restaurant ||
      restaurantResponse?.data?.restaurant ||
      restaurantResponse?.data?.user ||
      null

    if (restaurant && isRestaurantOnboardingComplete(restaurant)) {
      return null
    }
  } catch (err) {
    debugError("Failed to check restaurant profile:", err)
  }

  try {
    const phone = String(getRestaurantPendingPhone() || "").replace(/\D/g, "").slice(-10)
    if (phone) {
      const res = await restaurantAPI.getOnboardingDraft(phone)
      const draft = res?.data?.data?.draft
      if (draft) {
        const inferred = getMaxAllowedOnboardingStep(draft.step1, draft.step2, draft.step3)
        const savedStep = Number(draft.currentStep) || inferred
        return Math.min(Math.max(savedStep, 1), inferred)
      }
    }
  } catch (err) {
    debugError("Failed to check onboarding draft:", err)
  }

  return 1
}

