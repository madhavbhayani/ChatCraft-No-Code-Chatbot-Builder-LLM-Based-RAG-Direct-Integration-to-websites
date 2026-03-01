import { UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SignUpButton() {
  const navigate = useNavigate();

  return (
    <div className="fixed top-6 right-8 z-50">
      <button
        onClick={() => navigate("/register")}
        className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                   hover:bg-rose-pink transition-colors duration-200 cursor-pointer shadow-md"
      >
        <UserPlus size={18} />
        Sign Up
      </button>
    </div>
  );
}
