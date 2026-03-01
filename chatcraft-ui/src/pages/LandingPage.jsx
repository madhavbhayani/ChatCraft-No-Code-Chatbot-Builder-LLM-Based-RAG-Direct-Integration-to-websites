import SignUpButton from "../components/landing/SignUpButton";
import HeroSection from "../components/landing/HeroSection";
import AboutSection from "../components/landing/AboutSection";
import FeedbackSection from "../components/landing/FeedbackSection";
import Footer from "../components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-soft-white">
      <SignUpButton />
      <HeroSection />
      <AboutSection />
      <FeedbackSection />
      <Footer />
    </div>
  );
}
