import { UserPlus, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NavButtons() {
  const navigate = useNavigate();

  return (
    <div className="absolute top-6 right-8 z-50 flex items-center gap-3">
      <button
        onClick={() => navigate("/login")}
        className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-5 py-2 rounded-full font-semibold text-sm
                   hover:bg-charcoal hover:text-white transition-all duration-200 cursor-pointer"
      >
        <LogIn size={16} />
        Log In
      </button>
      <button
        onClick={() => navigate("/register")}
        className="flex items-center gap-2 bg-crimson text-white px-5 py-2 rounded-full font-semibold text-sm
                   hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25"
      >
        <UserPlus size={16} />
        Sign Up
      </button>
    </div>
  );
}
