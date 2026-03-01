import { Github, Twitter, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <h3 className="text-xl font-extrabold mb-3">
              Chat<span className="text-crimson">Craft</span>
            </h3>
            <p className="text-sm text-dusty-rose leading-relaxed">
              No-code chatbot builder with LLM integration &amp; RAG.
              Design, train, and deploy AI-powered bots directly on your website.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-dusty-rose uppercase tracking-wider mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#about" className="text-white/70 hover:text-white transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#features" className="text-white/70 hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="/register" className="text-white/70 hover:text-white transition-colors">
                  Sign Up
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="text-sm font-semibold text-dusty-rose uppercase tracking-wider mb-4">
              Connect
            </h4>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
              >
                <Github size={20} />
              </a>
              <a
                href="#"
                className="text-white/70 hover:text-white transition-colors"
              >
                <Twitter size={20} />
              </a>
            </div>
          </div>
        </div>

        {/* Divider + Copyright */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/50">
            &copy; {new Date().getFullYear()} ChatCraft. All rights reserved.
          </p>
          <p className="text-xs text-white/50 flex items-center gap-1">
            Made with <Heart size={12} className="text-crimson" /> by Madhav Bhayani
          </p>
        </div>
      </div>
    </footer>
  );
}
