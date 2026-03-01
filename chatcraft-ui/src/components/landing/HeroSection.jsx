import {
  Bot,
  Blocks,
  Zap,
  Globe,
  ArrowRight,
} from "lucide-react";

export default function HeroSection() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 py-24 bg-soft-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-light-rose rounded-full opacity-40 blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-light-rose rounded-full opacity-30 blur-3xl" />

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-light-rose text-crimson px-4 py-1.5 rounded-full text-sm font-medium mb-8">
          <Zap size={14} />
          No-Code Chatbot Builder with LLM &amp; RAG
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-black text-charcoal leading-tight tracking-tight mb-6">
          Build Intelligent Chatbots
          <span className="text-crimson block mt-2">Without Writing Code</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-12 leading-relaxed">
          Design, train, and deploy AI-powered chatbots with a visual drag-and-drop builder.
          Integrate LLMs, upload knowledge bases for RAG, and embed directly on your website — all in minutes.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <a
            href="#about"
            className="flex items-center gap-2 bg-crimson text-white px-8 py-3.5 rounded-lg font-semibold text-base
                       hover:bg-rose-pink transition-colors duration-200 shadow-lg"
          >
            Get Started Free
            <ArrowRight size={18} />
          </a>
          <a
            href="#features"
            className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-8 py-3.5 rounded-lg font-semibold text-base
                       hover:bg-charcoal hover:text-white transition-colors duration-200"
          >
            See How It Works
          </a>
        </div>

        {/* Feature pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <FeaturePill
            icon={<Blocks size={22} />}
            title="Visual Builder"
            description="Drag-and-drop flow editor"
          />
          <FeaturePill
            icon={<Bot size={22} />}
            title="LLM Powered"
            description="OpenAI, Claude, Gemini & more"
          />
          <FeaturePill
            icon={<Zap size={22} />}
            title="RAG Pipeline"
            description="Upload docs, get smart answers"
          />
          <FeaturePill
            icon={<Globe size={22} />}
            title="One-Click Embed"
            description="Add to any website instantly"
          />
        </div>
      </div>
    </section>
  );
}

function FeaturePill({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-white border border-light-rose rounded-xl px-6 py-6 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="text-crimson">{icon}</div>
      <h3 className="text-base font-bold text-charcoal">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
