import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Mail,
  Lock,
  Shield,
  CheckCircle2,
  Loader2,
  Link as LinkIcon,
  AlertCircle,
  KeyRound,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getSession, saveSession, clearSession, isLoggedIn } from "../utils/auth";
import { signInWithGoogle } from "../firebase";

export default function AccountPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // Link Google
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  // Setup Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirm: "" });
  const [settingPassword, setSettingPassword] = useState(false);

  // Change Email
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  // Delete Account
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getToken = () => {
    const session = getSession();
    return session?.token || "";
  };

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }
    fetchAccount();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAccount = async () => {
    try {
      const res = await fetch("/api/v1/account", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load account");
      setAccount(data);
    } catch (err) {
      toast.error(err.message);
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  // --- Link Google ---
  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    try {
      const { idToken } = await signInWithGoogle();

      const res = await fetch("/api/v1/account/link-google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ id_token: idToken }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to link Google");

      toast.success("Google account linked!");
      await fetchAccount();
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        toast.error(err.message || "Failed to link Google.");
      }
    } finally {
      setLinkingGoogle(false);
    }
  };

  // --- Setup Password ---
  const handleSetupPassword = async (e) => {
    e.preventDefault();
    if (passwordForm.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    setSettingPassword(true);
    try {
      const res = await fetch("/api/v1/account/setup-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ password: passwordForm.password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set password");

      toast.success("Password set successfully!");
      setShowPasswordForm(false);
      setPasswordForm({ password: "", confirm: "" });
      await fetchAccount();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSettingPassword(false);
    }
  };

  // --- Change Email ---
  const handleSendEmailOtp = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error("Please enter a new email.");
      return;
    }

    setSendingEmailOtp(true);
    try {
      const res = await fetch("/api/v1/account/change-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ new_email: newEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      toast.success("OTP sent to new email!");
      setShowEmailOtp(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const handleConfirmEmail = async (e) => {
    e.preventDefault();
    if (!emailOtp.trim()) {
      toast.error("Please enter the OTP.");
      return;
    }

    setConfirmingEmail(true);
    try {
      const res = await fetch("/api/v1/account/confirm-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ new_email: newEmail, otp: emailOtp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm email");

      // Update session
      const session = getSession();
      if (session?.user) {
        session.user.email = newEmail;
        saveSession(session.token, session.user);
      }

      toast.success("Email changed successfully!");
      setShowEmailForm(false);
      setShowEmailOtp(false);
      setNewEmail("");
      setEmailOtp("");
      await fetchAccount();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirmingEmail(false);
    }
  };

  // --- Delete Account ---
  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      clearSession();
      toast.success("Account deleted successfully.");
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <Loader2 size={32} className="text-crimson animate-spin" />
      </div>
    );
  }

  const user = account?.user;
  const hasGoogle = account?.has_google;
  const hasPassword = account?.has_password;

  return (
    <div className="min-h-screen bg-soft-white">
      {/* Top Bar */}
      <header className="border-b border-light-rose bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
          >
            <ArrowLeft size={18} />
            Dashboard
          </button>

          <h1 className="text-xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>

          <div className="w-24" /> {/* spacer */}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-extrabold text-charcoal mb-1">Account Settings</h2>
        <p className="text-muted text-sm mb-8">Manage your profile, sign-in methods, and email.</p>

        {/* Top Row: Profile + Sign-In Methods side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {/* Profile Info */}
          <section className="bg-white border border-light-rose rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-light-rose text-crimson font-bold text-lg">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <h3 className="text-lg font-bold text-charcoal">{user?.name}</h3>
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <Mail size={13} />
                  {user?.email}
                  {user?.email_verified ? (
                    <span className="inline-flex items-center gap-0.5 text-success text-xs font-medium ml-2">
                      <CheckCircle2 size={12} /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-warning text-xs font-medium ml-2">
                      <AlertCircle size={12} /> Not verified
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <Shield size={12} />
              Auth method: <span className="font-semibold text-charcoal capitalize">{user?.auth_method}</span>
            </div>
            <div className="text-xs text-muted">
              Member since{" "}
              <span className="text-charcoal font-medium">
                {new Date(user?.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </section>

          {/* Sign-In Methods */}
          <section className="bg-white border border-light-rose rounded-xl p-6">
            <h3 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
              <KeyRound size={16} className="text-crimson" />
              Sign-in Methods
            </h3>

            {/* Google Link */}
            <div className="flex items-center justify-between py-3 border-b border-light-rose">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
                  <path fill="#34A853" d="M6.3 14.7l7 5.1C15.2 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.8 6.3 14.7z"/>
                  <path fill="#FBBC05" d="M24 45c5.4 0 10.2-1.8 14-4.9l-6.7-5.5C29.5 36.1 27 37 24 37c-6 0-10.6-3.1-11.7-8.5l-7 5.4C8.5 40.3 15.7 45 24 45z"/>
                  <path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-.8 3.1-2.5 5.3-4.7 6.9l6.7 5.5C41.6 37.5 46 31 46 24c0-1.3-.2-2.7-.5-4z"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Google</p>
                  <p className="text-xs text-muted">
                    {hasGoogle ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>
              {hasGoogle ? (
                <span className="flex items-center gap-1.5 text-success text-xs font-semibold bg-green-50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 size={13} /> Linked
                </span>
              ) : (
                <button
                  onClick={handleLinkGoogle}
                  disabled={linkingGoogle}
                  className="flex items-center gap-1.5 text-sm font-semibold text-crimson border border-crimson px-4 py-1.5 rounded-full
                             hover:bg-crimson hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                >
                  {linkingGoogle ? <Loader2 size={14} className="animate-spin" /> : <LinkIcon size={14} />}
                  {linkingGoogle ? "Linking..." : "Link Google"}
                </button>
              )}
            </div>

            {/* Password */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Lock size={20} className="text-muted" />
                <div>
                  <p className="text-sm font-semibold text-charcoal">Password</p>
                  <p className="text-xs text-muted">
                    {hasPassword ? "Password is set" : "No password set"}
                  </p>
                </div>
              </div>
              {hasPassword ? (
                <span className="flex items-center gap-1.5 text-success text-xs font-semibold bg-green-50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 size={13} /> Set
                </span>
              ) : (
                <button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-crimson border border-crimson px-4 py-1.5 rounded-full
                             hover:bg-crimson hover:text-white transition-all duration-200 cursor-pointer"
                >
                  <Lock size={14} />
                  Set Password
                </button>
              )}
            </div>

            {/* Password Form (expandable) */}
            {showPasswordForm && !hasPassword && (
              <form onSubmit={handleSetupPassword} className="mt-4 pt-4 border-t border-light-rose space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">New Password</label>
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                      placeholder="Min. 8 characters"
                      className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                                 placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Confirm Password</label>
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                      placeholder="Repeat your password"
                      className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                                 placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={settingPassword}
                    className="flex items-center gap-2 bg-crimson text-white px-5 py-2 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {settingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                    {settingPassword ? "Setting..." : "Set Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordForm({ password: "", confirm: "" });
                    }}
                    className="text-sm text-muted font-medium hover:text-charcoal cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        {/* Change Email — full width */}
        <section className="bg-white border border-light-rose rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-charcoal flex items-center gap-2">
              <Mail size={16} className="text-crimson" />
              Email Address
            </h3>
            {!showEmailForm && (
              <button
                onClick={() => setShowEmailForm(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-crimson hover:underline cursor-pointer"
              >
                <Pencil size={13} />
                Change
              </button>
            )}
          </div>

          {!showEmailForm ? (
            <p className="text-sm text-charcoal">{user?.email}</p>
          ) : !showEmailOtp ? (
            <form onSubmit={handleSendEmailOtp} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-charcoal mb-1.5">New Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
              <button
                type="submit"
                disabled={sendingEmailOtp}
                className="flex items-center gap-2 bg-crimson text-white px-5 py-2.5 rounded-lg font-semibold text-sm
                           hover:bg-rose-pink transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {sendingEmailOtp ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {sendingEmailOtp ? "Sending..." : "Send Code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setNewEmail("");
                }}
                className="text-sm text-muted font-medium hover:text-charcoal cursor-pointer py-2.5"
              >
                Cancel
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmEmail} className="flex items-end gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted mb-1.5">
                  Enter the code sent to <span className="font-semibold text-charcoal">{newEmail}</span>
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm text-center
                             tracking-[0.5em] font-bold text-lg
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
              <button
                type="submit"
                disabled={confirmingEmail || emailOtp.length !== 6}
                className="flex items-center gap-2 bg-crimson text-white px-5 py-2.5 rounded-lg font-semibold text-sm
                           hover:bg-rose-pink transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {confirmingEmail ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {confirmingEmail ? "Confirming..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setShowEmailOtp(false);
                  setNewEmail("");
                  setEmailOtp("");
                }}
                className="text-sm text-muted font-medium hover:text-charcoal cursor-pointer py-2.5"
              >
                Cancel
              </button>
            </form>
          )}
        </section>

        {/* Delete Account — full width */}
        <section className="mt-5 bg-white border border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <Trash2 size={16} />
                Delete Account
              </h3>
              <p className="text-sm text-muted mt-1">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-600 border border-red-300 px-4 py-2 rounded-lg
                           hover:bg-red-50 transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                <Trash2 size={14} />
                Delete Account
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex items-center gap-1.5 text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg
                             hover:bg-red-700 transition-all duration-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {deletingAccount ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deletingAccount ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm text-muted font-medium hover:text-charcoal cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
