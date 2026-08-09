import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { AlertCircle, Loader2, ChevronRight, Phone } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { authAPI } from "@food/api"
import { motion, AnimatePresence } from "framer-motion"
import defaultLogoImg from "@food/assets/switcheats-logo.png"
import { getModuleLogoUrl, loadBusinessSettings } from "@food/utils/businessSettings"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91", // required; default +91 for India
  })

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [logoUrl, setLogoUrl] = useState(defaultLogoImg)
  const submittingRef = useRef(false)

  useEffect(() => {
    const syncLogo = async () => {
      try {
        const cachedLogo = getModuleLogoUrl("user")
        if (cachedLogo) setLogoUrl(cachedLogo)

        const settings = await loadBusinessSettings()
        if (settings) {
          const userLogo = getModuleLogoUrl("user")
          if (userLogo) setLogoUrl(userLogo)
        }
      } catch (err) {
        debugWarn("Failed to load user module logo from business settings:", err)
      }
    }

    syncLogo()
    const handleSettingsUpdate = () => {
      const userLogo = getModuleLogoUrl("user")
      setLogoUrl(userLogo || defaultLogoImg)
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return

    try {
      const data = JSON.parse(stored)
      const fullPhone = String(data.phone || "").trim()
      const phoneDigits = fullPhone.replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)

      setFormData((prev) => ({
        ...prev,
        phone: phoneDigits || prev.phone,
      }))
    } catch (err) {
      debugError("Error parsing stored auth data:", err)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d{10}$/.test(cleanPhone)) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleChange = (e) => {
    const { name } = e.target
    let { value } = e.target

    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
      setError(validatePhone(value))
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const phoneError = validatePhone(formData.phone)
    setError(phoneError)
    if (phoneError) return
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const countryCode = formData.countryCode?.trim() || "+91"
      const phoneDigits = String(formData.phone ?? "").replace(/\D/g, "").slice(0, 10)
      if (phoneDigits.length !== 10) {
        setError("Phone number must be exactly 10 digits")
        setIsLoading(false)
        submittingRef.current = false
        return
      }
      const fullPhone = `${countryCode} ${phoneDigits}`
      await authAPI.sendOTP(fullPhone, "login", null)

      const ref = String(searchParams.get("ref") || "").trim()
      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode: ref || null,
        isSignUp: false,
        module: "user",
      }

      sessionStorage.setItem("userAuthData", JSON.stringify(authData))
      navigate("/food/user/auth/otp")
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AnimatedPage className="min-h-[100dvh] bg-zinc-50 dark:bg-[#0A0A0B] flex flex-col font-sans overflow-hidden relative">
      {/* Dynamic Background with Blurs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-[#f97316]/20 dark:bg-[#f97316]/10 blur-[80px]" />
        <div className="absolute top-[40%] -left-[20%] w-[60vw] h-[60vw] rounded-full bg-orange-400/20 dark:bg-orange-500/10 blur-[100px]" />
        <div className="absolute -bottom-[20%] right-[10%] w-[80vw] h-[80vw] rounded-full bg-[#ea580c]/10 dark:bg-[#ea580c]/5 blur-[120px]" />
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 relative z-10 py-12">
        <div className="w-full max-w-[420px] mx-auto flex flex-col items-center">
          
          {/* Logo & Branding */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center mb-10"
          >
            <div className="w-28 h-28 bg-white rounded-[2rem] flex items-center justify-center shadow-md mb-6 p-4">
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
            <h1 className="text-zinc-900 dark:text-white font-black text-5xl tracking-tighter leading-none mb-2">
              FOOD<span className="text-[#f97316]">ISS</span>
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium tracking-wide text-sm">
              Premium Food Delivery
            </p>
          </motion.div>

          {/* Glassmorphism Form Card */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="w-full bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl rounded-[2.5rem] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.05)] border border-white/50 dark:border-zinc-800/50"
          >
            <div className="mb-8">
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight mb-1">
                Welcome Back
              </h2>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Enter your mobile number to sign in.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <div className="relative group transition-all duration-300">
                  <div className="flex items-center gap-0 bg-white/50 dark:bg-black/20 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl focus-within:border-[#f97316] focus-within:ring-4 focus-within:ring-[#f97316]/10 transition-all overflow-hidden shadow-inner">
                    <div className="flex items-center px-4 h-14 bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white font-black text-base border-r border-zinc-200/80 dark:border-zinc-800/80">
                      <span>+91</span>
                    </div>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="Mobile Number"
                      value={formData.phone}
                      onChange={handleChange}
                      className="flex-1 w-full h-14 text-base sm:text-lg bg-transparent text-zinc-900 dark:text-white border-0 outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-bold placeholder:text-zinc-400 dark:placeholder:text-zinc-600 tracking-wide px-3 sm:px-4 min-w-0"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-1.5 text-xs font-bold text-red-500 pl-2"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button
                type="submit"
                disabled={isLoading || formData.phone.length !== 10}
                className="w-full h-14 bg-[#f97316] hover:bg-[#ea580c] text-white font-black text-base tracking-widest rounded-2xl transition-all duration-300 shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_12px_25px_rgba(249,115,22,0.4)] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none flex items-center justify-center gap-2 group"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </motion.div>

          {/* Footer */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-10 text-center"
          >
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide uppercase">
              By continuing, you agree to our policies
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-2 uppercase tracking-widest flex items-center justify-center gap-2">
              <Link to="/food/user/profile/terms" className="hover:text-[#f97316] transition-colors">Terms</Link>
              <span>•</span>
              <Link to="/food/user/profile/privacy" className="hover:text-[#f97316] transition-colors">Privacy</Link>
              <span>•</span>
              <Link to="/food/user/profile/help-content" className="hover:text-[#f97316] transition-colors">Support</Link>
            </p>
          </motion.div>
        </div>
      </div>
    </AnimatedPage>
  )
}

