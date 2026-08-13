const parseClockToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return null
  const raw = timeValue.trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/)
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1])
    const minute = Number(meridiemMatch[2])
    const period = meridiemMatch[3]
    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null
    if (period === "pm" && hour < 12) hour += 12
    if (period === "am" && hour === 12) hour = 0
    if (hour < 0 || hour > 23) return null
    return hour * 60 + minute
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!twentyFourHourMatch) return null

  const hour = Number(twentyFourHourMatch[1])
  const minute = Number(twentyFourHourMatch[2])
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

export const isOvernightTiming = (openingTime, closingTime) => {
  const openingMinutes = parseClockToMinutes(openingTime)
  const closingMinutes = parseClockToMinutes(closingTime)
  if (openingMinutes === null || closingMinutes === null) return false
  return closingMinutes < openingMinutes
}

export const formatClock12Hour = (timeValue) => {
  const totalMinutes = parseClockToMinutes(timeValue)
  if (totalMinutes === null) return ""
  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`
}

export const getClosesNextDayHint = (openingTime, closingTime) => {
  if (!isOvernightTiming(openingTime, closingTime)) return null
  const label = formatClock12Hour(closingTime)
  return label ? `Closes next day at ${label}` : null
}
