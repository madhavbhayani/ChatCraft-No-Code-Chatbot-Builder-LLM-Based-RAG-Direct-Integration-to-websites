import { UserPlus, LogIn, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { isLoggedIn } from "../../utils/auth";

export default function NavButtons() {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());

  // Re-check on mount and when navigating back
  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  if (loggedIn) {
    return (
      <div className="absolute top-6 right-8 z-50 flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="group flex items-center gap-2 bg-crimson text-white px-8 py-3.5 rounded-full font-semibold text-base
                     hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25"
        >
          <UserCircle size={18} />
          My Account
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-6 right-8 z-50 flex items-center gap-3">
      <button
        onClick={() => navigate("/login")}
        className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-8 py-3.5 rounded-full font-semibold text-base
                   hover:bg-charcoal hover:text-white transition-all duration-200 cursor-pointer"
      >
        <LogIn size={18} />
        Log In
      </button>
      <button
        onClick={() => navigate("/register")}
        className="flex items-center gap-2 bg-crimson text-white px-8 py-3.5 rounded-full font-semibold text-base
                   hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25"
      >
        <UserPlus size={18} />
        Sign Up
      </button>
    </div>
  );
}
