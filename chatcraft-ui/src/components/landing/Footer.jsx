import { Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-charcoal py-16 px-6">
      <div className="max-w-6xl mx-auto text-center">
        {/* Large brand name with crimson gradient */}
        <h2
          className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter select-none leading-none mb-6 bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(180deg, #DC2626 0%, #DC262640 70%, #DC262615 100%)",
          }}
        >
          CHATCRAFT
        </h2>

        {/* Subtitle */}
        <p className="text-sm text-dusty-rose mb-10">
          a learning project by <span className="font-semibold text-white/70">Madhav Bhayani</span>
        </p>

        {/* Divider + Copyright */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/40">
            Built with <Heart size={10} className="text-crimson inline-block mx-0.5" /> by Madhav
          </p>
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} ChatCraft. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
