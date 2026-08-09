import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import apiClient, { authAPI } from "@food/api"
import { setAuthData as setUserAuthData } from "@food/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { motion, AnimatePresence } from "framer-motion"

const FULL_NAME_REGEX = /^[A-Za-z ]+$/

export default function OTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedData, setVerifiedData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const inputRefs = useRef([])
  const submittingRef = useRef(false)

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("user_authenticated") === "true"
    if (isAuthenticated) {
      navigate("/food/user", { replace: true })
      return
    }

    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) {
      navigate("/food/user/auth/login", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    if (data.method === "email" && data.email) {
      setContactInfo(data.email)
    } else if (data.phone) {
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        setContactInfo(`${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`)
      } else {
        setContactInfo(data.phone || "")
      }
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0] && !showNameInput) {
      inputRefs.current[0].focus()
    }
  }, [showNameInput])

  const ensureNotificationPermission = async () => {
    try {
      if (typeof Notification === "undefined") return
      if (Notification.permission === "default") {
        await Notification.requestPermission()
      }
    } catch {
      // ignore
    }
  }

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (!showNameInput && newOtp.slice(0, 4).every((digit) => digit !== "")) {
      handleVerify(newOtp.slice(0, 4).join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (!showNameInput && digits.length === 4) {
      handleVerify(newOtp.join(""))
    } else {
      inputRefs.current[Math.min(digits.length, 3)]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput || submittingRef.current) return

    const code = (otpValue || otp.join("")).replace(/\D/g, "")
    const code4 = code.slice(0, 4)
    if (code4.length !== 4) {
      setError("OTP must be exactly 4 digits")
      return
    }

    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      const referralCode = authData?.referralCode || null

      let fcmToken = null
      let platform = "web"
      try {
        const resolved = await resolveDeviceFcmToken("user", { allowPrompt: true })
        fcmToken = resolved?.token || null
        platform = resolved?.platform || "web"
      } catch (e) {
        console.warn("Failed to get FCM token during login", e)
      }

      if (!fcmToken && typeof Notification !== "undefined" && Notification.permission === "denied") {
        console.warn(
          "[FCM] Browser notification permission is BLOCKED. Token cannot be created. " +
            "Chrome → site settings → Notifications → Allow for this site, then login again.",
        )
      }

      const response = await authAPI.verifyOTP(
        phone, code4, purpose, providedName, email, "user", null, referralCode, fcmToken, platform
      )
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken ?? null
      const user = data.user

      if (!accessToken || !user || !refreshToken) {
        throw new Error("Invalid response from server")
      }

      const hasName = user.name && String(user.name).trim().length > 0 && String(user.name).toLowerCase() !== "null"
      const needsName = data.isNewUser === true || !hasName

      if (needsName) {
        setVerifiedData(data)
        setShowNameInput(true)
        setIsLoading(false)
        submittingRef.current = false
        return
      }

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, user, refreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      await registerWebPushForCurrentModule("/food/user", { force: true }).catch(() => {})
      setSuccess(true)
      setTimeout(() => navigate("/food/user"), 800)
    } catch (err) {
      const status = err?.response?.status
      let message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Verification failed."
      if (status === 401) message = "Invalid or expired code."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const handleSubmitName = async () => {
    const normalizedName = String(name || "").replace(/\s+/g, " ").trim()
    if (!normalizedName || normalizedName.length < 2) {
      setNameError("Please enter a valid name")
      return
    }
    if (!FULL_NAME_REGEX.test(normalizedName)) {
      setNameError("Name can contain only letters and spaces")
      return
    }

    setIsLoading(true)
    setError("")
    setNameError("")

    try {
      const { accessToken, refreshToken, user } = verifiedData

      try {
        await apiClient.patch(
          "/food/user/profile",
          { name: normalizedName },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
      } catch (e) {
        console.error("Failed to update name on backend, but proceeding with login", e)
      }

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, { ...user, name: normalizedName }, refreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      await registerWebPushForCurrentModule("/food/user", { force: true }).catch(() => {})
      setSuccess(true)
      setTimeout(() => navigate("/food/user"), 800)
    } catch (err) {
      setError("Failed to complete registration. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return
    setIsLoading(true)
    setError("")
    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      await authAPI.sendOTP(phone, purpose, email)
      setResendTimer(60)
      setOtp(["", "", "", ""])
    } catch (err) {
      setError("Failed to resend OTP.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!authData) return null

  return (
    <AnimatedPage className="min-h-[100dvh] bg-zinc-50 flex flex-col font-sans overflow-hidden relative selection:bg-orange-500/10">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[100vw] h-[100vw] rounded-full bg-[#f97316]/10 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[-20%] w-[80vw] h-[80vw] rounded-full bg-orange-400/10 blur-[100px]" />
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 relative z-10 py-12">
        <div className="w-full max-w-[440px] mx-auto">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-12"
          >
            <button
              onClick={() => navigate(-1)}
              className="p-3 bg-white border border-zinc-100 rounded-2xl shadow-sm mb-8 hover:bg-zinc-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-900" />
            </button>

            <h1 className="text-4xl font-black text-zinc-900 tracking-tighter leading-none mb-3">
              {showNameInput ? "TELL US YOUR" : "VERIFY YOUR"} <br />
              <span className="text-[#f97316] italic uppercase">{showNameInput ? "NAME" : "PHONE"}</span>
            </h1>
            <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider">
              {showNameInput
                ? "Help us personalize your experience."
                : `4-digit code sent to ${contactInfo}`}
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white/80 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)]"
          >
            <AnimatePresence mode="wait">
              {!showNameInput ? (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-10"
                >
                  <div className="flex justify-center gap-2 sm:gap-4">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="tel"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onFocus={() => { void ensureNotificationPermission() }}
                        onChange={(e) => handleChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        disabled={isLoading}
                        className="w-14 h-16 sm:w-16 sm:h-20 text-center text-2xl sm:text-3xl font-black bg-zinc-50 border-2 border-zinc-100 focus:border-[#f97316] focus:bg-white rounded-2xl text-zinc-900 transition-all outline-none focus:shadow-sm"
                        placeholder="•"
                      />
                    ))}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 text-xs font-bold text-red-500 justify-center bg-red-50 py-3 rounded-xl"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>{error}</span>
                    </motion.div>
                  )}

                  <div className="flex flex-col items-center gap-6">
                    {resendTimer > 0 ? (
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                        Resend code in <span className="text-[#f97316]">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={isLoading}
                        className="text-xs font-black text-[#f97316] uppercase tracking-widest underline underline-offset-8 decoration-2"
                      >
                        Resend Now
                      </button>
                    )}

                    <Button
                      onClick={() => handleVerify()}
                      disabled={isLoading || otp.some((d) => !d)}
                      className="w-full h-16 bg-[#f97316] hover:bg-[#ea580c] text-white font-black text-base uppercase tracking-widest rounded-2xl transition-all shadow-[0_12px_24px_rgba(249,115,22,0.3)] flex items-center justify-center gap-2 group"
                    >
                      {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                        <>
                          <span>Verify</span>
                          <CheckCircle2 className="w-5 h-5 opacity-50" />
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] ml-1">
                      Your Identity
                    </label>
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl focus-within:border-[#f97316]/50 focus-within:ring-4 focus-within:ring-orange-500/5 transition-all overflow-hidden">
                      <Input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          const sanitized = e.target.value.replace(/[^A-Za-z ]/g, "")
                          setName(sanitized)
                          if (nameError) setNameError("")
                        }}
                        autoFocus
                        disabled={isLoading}
                        placeholder="e.g. Aman Kuril"
                        className="h-16 bg-transparent border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xl font-black px-6 text-zinc-900"
                      />
                    </div>
                    {nameError && <p className="text-xs font-bold text-red-500 pl-2">{nameError}</p>}
                  </div>

                  <Button
                    onClick={handleSubmitName}
                    disabled={isLoading || name.trim().length < 2}
                    className="w-full h-16 bg-[#f97316] hover:bg-[#ea580c] text-white font-black text-base uppercase tracking-widest rounded-2xl transition-all shadow-[0_12px_24px_rgba(249,115,22,0.3)]"
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Complete Setup"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <footer className="mt-12 text-center">
            <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-[0.4em]">
              Foodiss Secure Network
            </p>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15 }}
              className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mb-8"
            >
              <CheckCircle2 className="w-12 h-12 text-[#f97316]" />
            </motion.div>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight mb-2 italic uppercase">Welcome Back!</h2>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Successfully authenticated</p>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  )
}
