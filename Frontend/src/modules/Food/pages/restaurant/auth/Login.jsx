import { useEffect, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Loader2, AlertCircle, ArrowRight } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import { motion, AnimatePresence } from "framer-motion"
import defaultLogoImg from "@food/assets/switcheats-logo.png"
import { getModuleLogoUrl, loadBusinessSettings } from "@food/utils/businessSettings"

const DEFAULT_COUNTRY_CODE = "+91"

export default function RestaurantLogin() {
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return {
      phone: saved || "",
      countryCode: DEFAULT_COUNTRY_CODE,
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [logoUrl, setLogoUrl] = useState(defaultLogoImg)

  useEffect(() => {
    const syncLogo = async () => {
      try {
        const cachedLogo = getModuleLogoUrl("restaurant")
        if (cachedLogo) setLogoUrl(cachedLogo)

        const settings = await loadBusinessSettings()
        if (settings) {
          const moduleLogo = getModuleLogoUrl("restaurant")
          if (moduleLogo) setLogoUrl(moduleLogo)
        }
      } catch (err) {
        // keep fallback logo
      }
    }

    syncLogo()
    const handleSettingsUpdate = () => {
      const moduleLogo = getModuleLogoUrl("restaurant")
      setLogoUrl(moduleLogo || defaultLogoImg)
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateKeyboardInset = () => {
      const viewport = window.visualViewport
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }

    updateKeyboardInset()
    window.visualViewport.addEventListener("resize", updateKeyboardInset)
    window.visualViewport.addEventListener("scroll", updateKeyboardInset)

    return () => {
      window.visualViewport.removeEventListener("resize", updateKeyboardInset)
      window.visualViewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === "") return "Phone number required"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length !== 10) return "Must be 10 digits"
    if (!["6", "7", "8", "9"].includes(digitsOnly[0])) return "Invalid number"
    return ""
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)
    if (error) setError(validatePhone(value))
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      await restaurantAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem(
        "restaurantAuthData",
        JSON.stringify({
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          module: "restaurant",
        })
      )
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      setError(apiErr?.response?.data?.message || "Failed to send OTP")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 flex flex-col font-sans overflow-hidden relative selection:bg-indigo-500/10">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full bg-indigo-500/10 blur-[100px] translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[60vw] h-[60vw] md:w-[30vw] md:h-[30vw] rounded-full bg-blue-500/10 blur-[80px] -translate-x-1/3 translate-y-1/3" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wMikiLz48L3N2Zz4=')] opacity-50" />
      </div>

      <div
        className="flex-1 flex flex-col justify-center px-6 relative z-10 py-12"
        style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
      >
        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mb-12 flex flex-col items-center text-center"
          >
            <div className="w-20 h-20 bg-white rounded-[1.5rem] flex items-center justify-center shadow-md mb-6 p-3 mx-auto">
              <img
                src={logoUrl}
                alt="Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  if (e.target.src !== defaultLogoImg) {
                    e.target.src = defaultLogoImg
                  }
                }}
              />
            </div>
            <h1 className="text-3xl font-light tracking-tight text-zinc-900 mb-2">
              Foodiss <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-600">Partner</span>
            </h1>
            <p className="text-sm text-zinc-500">
              Access your restaurant management dashboard.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className="bg-white/70 backdrop-blur-xl border border-white rounded-[2.5rem] p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)]"
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest pl-1">
                  Registered Mobile
                </label>

                <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-2xl focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all overflow-hidden h-14">
                  <div className="flex items-center justify-center px-4 h-full bg-zinc-100 border-r border-zinc-200 text-zinc-600 font-medium text-lg">
                    +91
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    className="flex-1 w-full h-full bg-transparent border-0 outline-none ring-0 placeholder:text-zinc-300 text-base sm:text-lg font-medium tracking-wide px-3 sm:px-4 text-zinc-900 min-w-0"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-1.5 text-xs text-red-500 pl-1 pt-1 font-medium"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button
                onClick={handleSendOTP}
                disabled={isSending || formData.phone.length !== 10}
                className="w-full h-14 rounded-2xl font-semibold text-base transition-all duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed Securely</span>
                    <ArrowRight className="w-4 h-4 opacity-70" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-12 text-center"
          >
            <p className="text-xs text-zinc-400 mb-3 font-medium">
              Protected by enterprise-grade security.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs font-semibold text-zinc-400">
              <Link to="/food/restaurant/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
              <span className="w-1 h-1 rounded-full bg-zinc-300" />
              <Link to="/food/restaurant/privacy" className="hover:text-indigo-600 transition-colors">Privacy</Link>
              <span className="w-1 h-1 rounded-full bg-zinc-300" />
              <Link to="/food/restaurant/help-content" className="hover:text-indigo-600 transition-colors">Support</Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
