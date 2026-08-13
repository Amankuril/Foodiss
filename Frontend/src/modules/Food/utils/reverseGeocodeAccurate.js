import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"

let mapsLoaderPromise = null

const isMeaningfulAddress = (value) => {
  const text = String(value || "").trim().toLowerCase()
  return Boolean(
    text &&
      text !== "select location" &&
      text !== "current location" &&
      !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(text),
  )
}

const parseGoogleGeocoderResult = (place) => {
  if (!place) return null
  const comps = Array.isArray(place.address_components) ? place.address_components : []
  const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
  const formattedAddress = place.formatted_address || ""
  const area =
    get(["sublocality_level_1", "sublocality", "neighborhood"]) ||
    get(["sublocality_level_2"]) ||
    get(["locality"])
  const city = get(["locality"]) || get(["administrative_area_level_2"])
  const state = get(["administrative_area_level_1"]) || get(["administrative_area_level_2"])
  const pincode = get(["postal_code"])
  const streetNumber = get(["street_number"])
  const route = get(["route"])
  const premise = get(["premise"])
  const street = [streetNumber, route, premise].filter(Boolean).join(", ")

  if (!isMeaningfulAddress(formattedAddress) && !street && !area && !city) return null

  return {
    area: area || city || "",
    city: city || "Unknown City",
    state,
    country: get(["country"]),
    postalCode: pincode,
    street: street || area || "",
    address: formattedAddress || [street, area, city, state, pincode].filter(Boolean).join(", "),
    formattedAddress: formattedAddress || [street, area, city, state, pincode].filter(Boolean).join(", "),
  }
}

const parseNominatimResult = (data) => {
  if (!data) return null
  const addr = data.address || {}
  const formattedAddress = data.display_name || ""
  const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.locality || addr.residential || ""
  const city = addr.city || addr.town || addr.village || addr.municipality || ""
  const state = addr.state || ""
  const pincode = addr.postcode || ""
  if (!isMeaningfulAddress(formattedAddress) && !area && !city) return null
  return {
    area: area || city || "",
    city: city || "Unknown City",
    state,
    country: addr.country || "",
    postalCode: pincode,
    street: [addr.road, addr.house_number, addr.building].filter(Boolean).join(", ") || area || "",
    address: formattedAddress,
    formattedAddress,
  }
}

const ensureGoogleGeocoder = async () => {
  if (typeof window === "undefined") return false
  if (window.google?.maps?.Geocoder) return true

  const apiKey = await getGoogleMapsApiKey()
  if (!apiKey) return false

  if (!mapsLoaderPromise) {
    mapsLoaderPromise = new Promise((resolve) => {
      const existing = Array.from(document.getElementsByTagName("script")).find((script) =>
        script.src?.includes("maps.googleapis.com/maps/api/js"),
      )

      const waitForGeocoder = async () => {
        for (let i = 0; i < 50; i += 1) {
          if (window.google?.maps?.Geocoder) {
            resolve(true)
            return
          }
          await new Promise((r) => setTimeout(r, 100))
        }
        resolve(!!window.google?.maps?.Geocoder)
      }

      if (existing) {
        void waitForGeocoder()
        return
      }

      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`
      script.async = true
      script.defer = true
      script.onload = () => resolve(!!window.google?.maps?.Geocoder)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })
  }

  return mapsLoaderPromise
}

const reverseGeocodeWithGoogleJs = async (latitude, longitude) => {
  const ready = await ensureGoogleGeocoder()
  if (!ready) return null

  const geocoder = new window.google.maps.Geocoder()
  const place = await new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        resolve(results[0])
        return
      }
      reject(new Error(String(status || "Failed to reverse geocode")))
    })
  })

  return parseGoogleGeocoderResult(place)
}

const reverseGeocodeWithNominatim = async (latitude, longitude) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) return null
  return parseNominatimResult(await res.json())
}

export async function reverseGeocodeAccurate(latitude, longitude) {
  try {
    const googleResult = await reverseGeocodeWithGoogleJs(latitude, longitude)
    if (googleResult && isMeaningfulAddress(googleResult.formattedAddress)) {
      return googleResult
    }
  } catch {
    // Fall through to Nominatim, same as restaurant onboarding.
  }

  try {
    const nominatimResult = await reverseGeocodeWithNominatim(latitude, longitude)
    if (nominatimResult && isMeaningfulAddress(nominatimResult.formattedAddress)) {
      return nominatimResult
    }
  } catch {
    // Caller can use its existing fallback.
  }

  return null
}
