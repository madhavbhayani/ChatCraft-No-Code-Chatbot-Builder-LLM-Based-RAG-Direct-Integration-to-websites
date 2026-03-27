import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Mail, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getSession, saveSession } from "../../utils/auth";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || getSession()?.user?.email || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef([]);
  const otpSentRef = useRef(false);

  // Auto-send OTP on mount (ref guard prevents double-call in React Strict Mode)
  useEffect(() => {
    if (email && !otpSentRef.current) {
      otpSentRef.current = true;
      handleResend(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Redirect if no email
  useEffect(() => {
    if (!email) {
      navigate("/login");
    }
  }, [email, navigate]);

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && newOtp.every((d) => d !== "")) {
      handleVerify(newOtp.join(""));
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

    // Focus last filled or next empty
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      handleVerify(pasted);
    }
  };

  const handleVerify = async (code) => {
    if (!code || code.length !== 6) {
      toast.error("Please enter the 6-digit code.");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/v1/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      setVerified(true);

      // Update session to reflect email_verified
      const session = getSession();
      if (session?.user) {
        session.user.email_verified = true;
        saveSession(session.token, session.user);
      }

      toast.success("Email verified!");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      toast.error(err.message || "Verification failed.");
      // Clear inputs on failure
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async (silent = false) => {
    if (cooldown > 0) return;
    setResending(true);

    try {
      const res = await fetch("/api/v1/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      setCooldown(60);
      if (!silent) toast.success("A new code has been sent to your email.");
    } catch (err) {
      if (!silent) toast.error(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-full bg-green-100 text-success mb-6 animate-bounce">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-extrabold text-charcoal mb-2">Email Verified!</h2>
          <p className="text-muted text-sm">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-6 left-8 flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
      >
        <ArrowLeft size={18} />
        Back
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
          {/* Mail Icon */}
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-6">
            <Mail size={28} />
          </div>

          <h2 className="text-xl font-bold text-charcoal mb-2">Verify your email</h2>
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
                onChange={(e) => handleChange(idx, e.target.value)}
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
            onClick={() => handleVerify(otp.join(""))}
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
              "Verify Email"
            )}
          </button>

          {/* Resend */}
          <div className="text-sm text-muted">
            Didn't receive the code?{" "}
            <button
              onClick={() => handleResend(false)}
              disabled={resending || cooldown > 0}
              className="inline-flex items-center gap-1 text-crimson font-medium hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
            >
              <RefreshCw size={12} className={resending ? "animate-spin" : ""} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
