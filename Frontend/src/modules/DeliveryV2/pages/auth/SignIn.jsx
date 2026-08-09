import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, AlertCircle, FastForward, Navigation } from "lucide-react"
import { Button } from "@food/components/ui/button"
import defaultLogoImg from "@food/assets/switcheats-logo.png"
import { getModuleLogoUrl, loadBusinessSettings } from "@food/utils/businessSettings"

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [logoUrl, setLogoUrl] = useState(defaultLogoImg)

  useEffect(() => {
    const syncLogo = async () => {
      try {
        const cachedLogo = getModuleLogoUrl("delivery")
        if (cachedLogo) setLogoUrl(cachedLogo)

        const settings = await loadBusinessSettings()
        if (settings) {
          const moduleLogo = getModuleLogoUrl("delivery")
          if (moduleLogo) setLogoUrl(moduleLogo)
        }
      } catch (err) {
        // keep fallback logo
      }
    }

    syncLogo()
    const handleSettingsUpdate = () => {
      const moduleLogo = getModuleLogoUrl("delivery")
      setLogoUrl(moduleLogo || defaultLogoImg)
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData((prev) => ({ ...prev, phone: phoneDigits }))
        }
      } catch (err) {
        // ignore malformed session data
      }
    }
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

  const handleSendOTP = async () => {
    setError("")
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem(
        "deliveryAuthData",
        JSON.stringify({
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          purpose: "login",
          module: "delivery",
        })
      )
      navigate("/food/delivery/otp")
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send OTP")
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    if (error) setError(validatePhone(value))
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-50 flex flex-col font-sans overflow-hidden relative selection:bg-[#0D9488]/10">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[100%] h-[50%] bg-[#0D9488]/10 skew-y-[-12deg] transform-gpu" />
        <div className="absolute top-[5%] right-[-10%] w-[60%] h-[40%] bg-[#2DD4BF]/5 skew-y-[12deg] transform-gpu" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/80 to-white" />
        <div className="absolute top-[20%] left-0 w-full h-px bg-gradient-to-r from-transparent via-[#0D9488]/20 to-transparent opacity-50 animate-pulse" />
        <div className="absolute top-[25%] left-0 w-full h-px bg-gradient-to-r from-transparent via-[#0D9488]/10 to-transparent opacity-30 animate-pulse delay-700" />
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 py-12"
        style={{ paddingBottom: keyboardInset ? `${keyboardInset + 20}px` : undefined }}
      >
        <div className="w-full max-w-md">
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mb-12 flex flex-col items-center text-center"
          >
            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-md p-3 mb-6 mx-auto">
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

            <h1 className="text-4xl font-black text-zinc-900 italic tracking-tighter leading-none mb-2">
              FOODISS <span className="text-[#0D9488] not-italic opacity-80 font-light">CAPTAIN</span>
            </h1>
            <p className="text-[#0D9488] text-[10px] font-black uppercase tracking-[0.4em] opacity-50">
              Fleet Force Management
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.06)] relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-zinc-50/50 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <div className="mb-10">
                <h2 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">
                  Ready to Move?
                </h2>
                <p className="text-zinc-500 text-sm font-medium">
                  Sign in with your mobile number to start your shift.
                </p>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-[#0D9488] uppercase tracking-[0.3em] ml-1 opacity-70">
                    Captain Identity
                  </label>

                  <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-2xl focus-within:border-[#0D9488]/50 focus-within:ring-4 focus-within:ring-[#0D9488]/5 transition-all overflow-hidden h-16 group">
                    <div className="px-5 bg-zinc-100/50 border-r border-zinc-200 text-zinc-700 font-black text-lg h-full flex items-center group-focus-within:text-[#0D9488] transition-colors">
                      +91
                    </div>
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      maxLength={10}
                      inputMode="numeric"
                      placeholder="Mobile Number"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      className="flex-1 w-full bg-transparent border-0 outline-none ring-0 placeholder:text-zinc-300 text-base sm:text-lg font-black tracking-wide px-3 sm:px-4 text-zinc-900 h-full min-w-0"
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#0D9488] pl-2"
                      >
                        <AlertCircle className="h-4 w-4" />
                        <span>{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Button
                  onClick={handleSendOTP}
                  disabled={isSending || formData.phone.length !== 10}
                  className="w-full h-16 rounded-2xl font-black text-base tracking-widest uppercase transition-all duration-300 bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-[0_12px_30px_rgba(13,148,136,0.3)] active:scale-[0.98] disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2 group"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <span>Go Online</span>
                      <FastForward className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-4 text-[#0D9488]/30">
              <Navigation className="w-3 h-3" />
              <div className="h-px w-8 bg-current" />
              <p className="text-[10px] font-black uppercase tracking-widest">
                Support Fleet
              </p>
              <div className="h-px w-8 bg-current" />
            </div>

            <div className="flex items-center justify-center gap-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              <Link to="/food/delivery/terms" className="hover:text-[#0D9488] transition-colors">Terms</Link>
              <span className="w-1 h-1 rounded-full bg-zinc-200" />
              <Link to="/food/delivery/profile/privacy" className="hover:text-[#0D9488] transition-colors">Privacy</Link>
              <span className="w-1 h-1 rounded-full bg-zinc-200" />
              <Link to="/food/delivery/help/content" className="hover:text-[#0D9488] transition-colors">Support</Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
