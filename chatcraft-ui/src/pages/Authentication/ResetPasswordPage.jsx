import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";
  const otp = location.state?.otp || "";

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Redirect if no email/otp
  if (!email || !otp) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-charcoal mb-2">Invalid Reset Link</h2>
          <p className="text-muted text-sm mb-4">Please start the password reset process again.</p>
          <button
            onClick={() => navigate("/forgot-password")}
            className="text-crimson font-semibold text-sm hover:underline cursor-pointer"
          >
            Go to Forgot Password
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.password || !form.confirm) {
      toast.error("Please fill in both fields.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
          new_password: form.password,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");

      setSuccess(true);
      toast.success("Password reset successfully!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-full bg-green-100 text-success mb-6 animate-bounce">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-extrabold text-charcoal mb-2">Password Reset!</h2>
          <p className="text-muted text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
      {/* Back button */}
      <button
        onClick={() => navigate("/forgot-password")}
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
        <div className="bg-white border border-light-rose rounded-xl p-8 shadow-sm">
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-6">
            <Lock size={28} />
          </div>

          <h2 className="text-xl font-bold text-charcoal text-center mb-2">Set New Password</h2>
          <p className="text-muted text-sm text-center mb-6">
            Enter your new password for <span className="font-semibold text-charcoal">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">New Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 8 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  placeholder="Repeat your password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-lg font-semibold text-sm
                         hover:bg-rose-pink transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
