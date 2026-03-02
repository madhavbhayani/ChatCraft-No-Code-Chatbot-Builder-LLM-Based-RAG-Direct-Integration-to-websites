import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Rocket, Puzzle, Globe, Settings, Search } from "lucide-react";
import { isLoggedIn } from "../utils/auth";

const docSections = [
  {
    icon: Rocket,
    title: "Getting Started",
    description: "Learn how to create your first chatbot project and get up and running in minutes.",
    status: "coming-soon",
  },
  {
    icon: Puzzle,
    title: "Integrations",
    description: "Connect your chatbot with LLM providers, APIs, and third-party services.",
    status: "coming-soon",
  },
  {
    icon: Globe,
    title: "Deploying to Websites",
    description: "Embed your chatbot on any website with a simple script tag or iframe.",
    status: "coming-soon",
  },
  {
    icon: Settings,
    title: "Managing Your Chatbot",
    description: "Configure settings, monitor conversations, and fine-tune your bot's behaviour.",
    status: "coming-soon",
  },
  {
    icon: BookOpen,
    title: "RAG Pipeline",
    description: "Upload documents and build a knowledge base for intelligent, context-aware responses.",
    status: "coming-soon",
  },
];

export default function DocsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-soft-white">
      {/* Top Bar */}
      <header className="border-b border-light-rose bg-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
          >
            <ArrowLeft size={18} />
            Home
          </button>

          <h1 className="text-xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>

          {isLoggedIn() ? (
            <button
              onClick={() => navigate("/dashboard")}
              className="text-sm font-semibold text-crimson hover:underline cursor-pointer"
            >
              Dashboard
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-semibold text-crimson hover:underline cursor-pointer"
            >
              Log in
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-5">
            <BookOpen size={28} />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-3">Documentation</h2>
          <p className="text-muted text-base max-w-xl mx-auto">
            Everything you need to build, integrate, deploy, and manage your chatbots with ChatCraft.
          </p>
        </div>

        {/* Search (placeholder) */}
        <div className="max-w-lg mx-auto mb-12">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search documentation..."
              disabled
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-light-rose bg-white text-charcoal text-sm
                         placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition
                         disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-muted text-center mt-2">Search coming soon</p>
        </div>

        {/* Doc Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {docSections.map((section) => (
            <div
              key={section.title}
              className="bg-white border border-light-rose rounded-xl p-6 hover:shadow-md transition-shadow relative"
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-light-rose text-crimson mb-4">
                <section.icon size={20} />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">{section.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{section.description}</p>
              <span className="inline-block mt-4 text-xs font-semibold text-dusty-rose bg-light-rose px-3 py-1 rounded-full">
                Coming Soon
              </span>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted">
            Have questions?{" "}
            <a href="mailto:madhavbhayani21@gmail.com" className="text-crimson font-medium hover:underline">
              Email us
            </a>{" "}
            or{" "}
            <a
              href="https://linkedin.com/in/madhavbhayani"
              target="_blank"
              rel="noopener noreferrer"
              className="text-crimson font-medium hover:underline"
            >
              connect on LinkedIn
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
