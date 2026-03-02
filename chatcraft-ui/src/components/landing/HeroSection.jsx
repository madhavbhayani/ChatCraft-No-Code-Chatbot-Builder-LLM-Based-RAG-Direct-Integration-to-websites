import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn } from "../../utils/auth";

export default function HeroSection() {
  const navigate = useNavigate();

  const handleGetStarted = (e) => {
    e.preventDefault();
    if (isLoggedIn()) {
      navigate("/dashboard");
    } else {
      navigate("/login");
    }
  };

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 py-24 bg-soft-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-light-rose rounded-full opacity-40 blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-light-rose rounded-full opacity-30 blur-3xl" />

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-black text-charcoal leading-tight tracking-tight mb-6">
          Your Ideas, One Chatbot
          <span className="text-crimson block mt-2">Zero Code Required</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-12 leading-relaxed">
            Build custom chatbots in minutes. Just describe your vision, and ChatCraft brings it to life — no coding, no hassle. Perfect for businesses, creators, and anyone with a great idea to share.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleGetStarted}
            className="group flex items-center gap-2 bg-crimson text-white px-8 py-3.5 rounded-full font-semibold text-base
                       hover:bg-rose-pink transition-all duration-200 shadow-lg shadow-crimson/25 cursor-pointer"
          >
            Get Started Free
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform duration-200" />
          </button>
          <button
            onClick={() => navigate("/docs")}
            className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-8 py-3.5 rounded-full font-semibold text-base
                       hover:bg-charcoal hover:text-white transition-all duration-200 cursor-pointer"
          >
            View Docs
          </button>
        </div>
      </div>
    </section>
  );
}
