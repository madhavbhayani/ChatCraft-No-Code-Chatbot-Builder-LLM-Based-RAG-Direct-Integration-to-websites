import { useState } from "react";
import { UserPlus, Mail, Lock, User, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { saveSession } from "../../utils/auth";
import { signInWithGoogle } from "../../firebase";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import { apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { idToken, user: firebaseUser } = await signInWithGoogle();

      const res = await fetch(`${API}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server returned an invalid response. Is the backend running?");
      }

      if (!res.ok) {
        throw new Error(data.error || "Google sign-in failed");
      }

      saveSession(data.token, data.user);
      toast.success("Account created with Google!");
      navigate("/dashboard");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        toast.error(err.message || "Google sign-in failed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server returned an invalid response. Is the backend running?");
      }

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // Auto-login after registration
      saveSession(data.token, data.user);
      toast.success("Account created! Please verify your email.");
      navigate("/verify-email", { state: { email: form.email } });
    } catch (err) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="fixed top-6 left-8 flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>
          <p className="text-muted text-sm mt-2">Create your free account</p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-light-rose rounded-xl p-8 shadow-sm"
        >
          {/* Google Sign-In */}
          <div className="mb-6">
            <GoogleSignInButton onClick={handleGoogleSignIn} loading={googleLoading} label="Sign up with Google" />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-light-rose"></div>
            <span className="text-xs text-muted font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-light-rose"></div>
          </div>

          {/* Row 1: Name + Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Password + Confirm */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
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
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat your password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-lg font-semibold text-sm
                       hover:bg-rose-pink transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <UserPlus size={18} />
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          {/* Login link */}
          <p className="text-center text-sm text-muted mt-5">
            Already have an account?{" "}
            <a href="/login" className="text-crimson font-medium hover:underline">
              Log in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
