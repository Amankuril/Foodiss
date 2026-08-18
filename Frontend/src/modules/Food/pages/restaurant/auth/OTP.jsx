import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { motion, AnimatePresence } from "framer-motion"

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)

  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        setContactInfo(
          phoneMatch ? `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}` : data.phone || ""
        )
      }
    } else {
      navigate("/food/restaurant/login")
      return
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
    const focusFirstInput = () => inputRefs.current[0]?.focus()
    const frameId = requestAnimationFrame(() => {
      focusFirstInput()
      window.setTimeout(focusFirstInput, 120)
    })
    return () => cancelAnimationFrame(frameId)
  }, [authData])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
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
    if (digits.length === 4) handleVerify(newOtp.join(""))
    else inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (hasSubmittedRef.current && !otpValue) return
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) throw new Error("Session expired.")
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      let fcmToken = null
      let platform = "web"
      try {
        const resolved = await resolveDeviceFcmToken("restaurant", { allowPrompt: true })
        fcmToken = resolved?.token || null
        platform = resolved?.platform || "web"
      } catch (e) {
        // Continue login even if FCM resolve fails
      }

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email, fcmToken, platform)
      const data = response?.data?.data || response?.data
      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setRestaurantPendingPhone(normalizedPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        const resumeStep = Number(data?.onboardingDraft?.currentStep) || 1
        const safeStep = resumeStep >= 1 && resumeStep <= 4 ? resumeStep : 1
        navigate(`/food/restaurant/onboarding?step=${safeStep}`, { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        registerWebPushForCurrentModule("/food/restaurant", { force: true }).catch(() => {})
        navigate("/food/restaurant", { replace: true })
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP."
      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) setRestaurantPendingPhone(pendingPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }
      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return
    setIsLoading(true)
    setError("")
    try {
      if (!authData) throw new Error("Session expired.")
      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      await restaurantAPI.sendOTP(phone, purpose, email)
      setResendTimer(60)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError("Failed to resend OTP.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!authData) return null

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 flex flex-col font-sans overflow-hidden relative selection:bg-indigo-600/10">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[100vw] h-[100vw] rounded-full bg-indigo-500/5 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[-20%] w-[80vw] h-[80vw] rounded-full bg-blue-600/5 blur-[100px]" />
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 relative z-10 py-12">
        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-12 relative flex flex-col items-center text-center"
          >
            <div className="absolute left-0 top-0">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-3 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:bg-zinc-50 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-zinc-900" />
              </button>
            </div>

            <div className="inline-flex items-center justify-center p-3.5 bg-indigo-50 rounded-2xl mb-6 backdrop-blur-sm border border-indigo-100/50 mt-16">
              <ShieldCheck className="w-8 h-8 text-indigo-600" strokeWidth={1.5} />
            </div>

            <h1 className="text-4xl font-black tracking-tighter text-zinc-900 leading-none mb-3 uppercase italic">
              Identity <span className="text-indigo-600">Verification</span>
            </h1>
            <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">
              Secure code sent to <span className="text-zinc-900">{contactInfo}</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white/80 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)]"
          >
            <div className="space-y-10">
              <div className="flex justify-center gap-2 sm:gap-4">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    disabled={isLoading}
                    className="w-14 h-16 sm:w-16 sm:h-20 text-center text-2xl sm:text-3xl font-black bg-zinc-50 border-2 border-zinc-100 focus:border-indigo-600 focus:bg-white rounded-2xl text-zinc-900 transition-all outline-none focus:shadow-sm"
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
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div className="space-y-6">
                <Button
                  onClick={() => handleVerify()}
                  disabled={isLoading || otp.some((d) => !d)}
                  className="w-full h-16 rounded-2xl font-black text-base uppercase tracking-widest transition-all duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_12px_24px_rgba(79,70,233,0.3)] active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Verify Identity"}
                </Button>

                <div className="flex flex-col items-center gap-6">
                  {resendTimer > 0 ? (
                    <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                      Resend available in <span className="text-indigo-600">{resendTimer}s</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isLoading}
                      className="text-xs font-black text-indigo-600 uppercase tracking-widest underline underline-offset-8 decoration-2"
                    >
                      Resend Code
                    </button>
                  )}

                  <Link
                    to="/food/restaurant/login"
                    className="text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Use different account
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-12 text-center"
          >
            <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-[0.4em]">
              Partner Security Network &bull; {companyName.toUpperCase()}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
