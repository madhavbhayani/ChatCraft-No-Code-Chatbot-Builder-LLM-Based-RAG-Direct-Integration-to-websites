import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  // Step 1: Enter email
  const [email, setEmail] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);

  // Step 2: Enter OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email.");
      return;
    }

    setSendingOtp(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reset code");

      toast.success("Reset code sent to your email.");
      setOtpSent(true);
      setCooldown(60);
      // Focus first OTP input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend code");
      setCooldown(60);
      toast.success("A new reset code has been sent.");
    } catch (err) {
      toast.error(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-proceed when all 6 digits entered
    if (value && index === 5 && newOtp.every((d) => d !== "")) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    }
  };

  const handleVerifyOtp = async (code) => {
    if (!code || code.length !== 6) {
      toast.error("Please enter the 6-digit code.");
      return;
    }

    setVerifying(true);
    // Navigate to reset page with email and OTP
    navigate("/reset-password", { state: { email, otp: code } });
  };

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
      {/* Back button */}
      <button
        onClick={() => navigate("/login")}
        className="fixed top-6 left-8 flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
      >
        <ArrowLeft size={18} />
        Back to Login
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>
        </div>

        {/* Card */}
        <div className="bg-white border border-light-rose rounded-xl p-8 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-6">
            <Mail size={28} />
          </div>

          {!otpSent ? (
            <>
              <h2 className="text-xl font-bold text-charcoal mb-2">Forgot Password?</h2>
              <p className="text-muted text-sm mb-6">
                Enter your email and we'll send you a code to reset your password.
              </p>

              <form onSubmit={handleSendOtp}>
                <div className="mb-5 text-left">
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                                 placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingOtp}
                  className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-lg font-semibold text-sm
                             hover:bg-rose-pink transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {sendingOtp ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Code"
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-charcoal mb-2">Enter Reset Code</h2>
              <p className="text-muted text-sm mb-1">We've sent a 6-digit code to</p>
              <p className="text-charcoal font-semibold text-sm mb-8">{email}</p>

              {/* OTP Inputs */}
              <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={verifying}
                    className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-light-rose bg-soft-white text-charcoal
                               focus:outline-none focus:border-crimson focus:ring-2 focus:ring-crimson/20 transition-all
                               disabled:opacity-50"
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                onClick={() => handleVerifyOtp(otp.join(""))}
                disabled={verifying || otp.some((d) => d === "")}
                className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-lg font-semibold text-sm
                           hover:bg-rose-pink transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mb-6"
              >
                {verifying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Continue"
                )}
              </button>

              {/* Resend */}
              <div className="text-sm text-muted">
                Didn't receive the code?{" "}
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="inline-flex items-center gap-1 text-crimson font-medium hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                >
                  <RefreshCw size={12} className={resending ? "animate-spin" : ""} />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                </button>
              </div>
            </>
          )}

          {/* Login link */}
          <p className="text-center text-sm text-muted mt-6">
            Remember your password?{" "}
            <a href="/login" className="text-crimson font-medium hover:underline">
              Log in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
