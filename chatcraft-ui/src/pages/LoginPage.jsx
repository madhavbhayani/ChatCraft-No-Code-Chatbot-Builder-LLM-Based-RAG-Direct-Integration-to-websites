import { useState } from "react";
import { LogIn, Mail, Lock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.email || !form.password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      // TODO: Replace with actual API call
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }

      const data = await res.json();
      // TODO: Store token in auth store
      localStorage.setItem("token", data.token);
      toast.success("Logged in successfully!");
      navigate("/dashboard");
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

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>
          <p className="text-muted text-sm mt-2">Log in to your account</p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-light-rose rounded-xl p-8 shadow-sm"
        >
          {/* Email */}
          <div className="mb-5">
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

          {/* Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                           placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-lg font-semibold text-sm
                       hover:bg-rose-pink transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <LogIn size={18} />
            {loading ? "Logging in..." : "Log In"}
          </button>

          {/* Register link */}
          <p className="text-center text-sm text-muted mt-5">
            Don't have an account?{" "}
            <a href="/register" className="text-crimson font-medium hover:underline">
              Sign up
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
