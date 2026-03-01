import {
  Blocks,
  Bot,
  Database,
  Globe,
  Zap,
  Shield,
  MessageSquare,
  BarChart3,
} from "lucide-react";

const features = [
  {
    icon: <Blocks size={28} />,
    title: "Visual Flow Builder",
    description:
      "Design conversation flows with an intuitive drag-and-drop canvas. No coding required — connect nodes, set conditions, and define your bot logic visually.",
  },
  {
    icon: <Bot size={28} />,
    title: "Multi-LLM Integration",
    description:
      "Connect to OpenAI GPT, Anthropic Claude, Google Gemini, or local models via Ollama. Switch providers, set temperature, and customize prompts per node.",
  },
  {
    icon: <Database size={28} />,
    title: "RAG Knowledge Base",
    description:
      "Upload PDFs, DOCX, text files, or scrape URLs. Documents are chunked, embedded, and indexed so your bot answers from your own data with source citations.",
  },
  {
    icon: <Globe size={28} />,
    title: "One-Click Website Embed",
    description:
      "Generate a lightweight script tag and paste it into any website. Customizable widget with your brand colors, avatar, and welcome message.",
  },
  {
    icon: <MessageSquare size={28} />,
    title: "Live Chat & Testing",
    description:
      "Test your bot in real-time with a built-in chat preview. Debug panel shows RAG retrieval, LLM calls, and the exact flow path taken.",
  },
  {
    icon: <Zap size={28} />,
    title: "Smart Node Types",
    description:
      "Trigger, Message, Input, Condition, API Call, Webhook, Delay, Variable, Carousel, and Human Handoff — everything you need in one toolbox.",
  },
  {
    icon: <Shield size={28} />,
    title: "Secure & Scalable",
    description:
      "JWT authentication, domain whitelisting, rate limiting, and encrypted API keys. Built on Go for performance and reliability at scale.",
  },
  {
    icon: <BarChart3 size={28} />,
    title: "Analytics Dashboard",
    description:
      "Track total conversations, resolution rates, drop-off points, and average session duration. Understand your bot's performance at a glance.",
  },
];

export default function AboutSection() {
  return (
    <section id="about" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-crimson text-sm font-semibold tracking-wider uppercase mb-3">
            About ChatCraft
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-charcoal mb-5">
            Everything You Need to Build
            <span className="text-crimson"> AI Chatbots</span>
          </h2>
          <p className="text-muted text-lg max-w-2xl mx-auto">
            ChatCraft is a no-code platform that combines a visual builder, LLM intelligence,
            and retrieval-augmented generation into a single, powerful tool.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group bg-soft-white border border-light-rose rounded-xl p-6 hover:shadow-lg transition-shadow duration-200"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-light-rose text-crimson mb-4 group-hover:bg-crimson group-hover:text-white transition-colors duration-200">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-charcoal mb-2">{feature.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* How it works mini-flow */}
        <div id="features" className="mt-24">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-extrabold text-charcoal mb-4">
              How It Works
            </h3>
            <p className="text-muted text-base max-w-xl mx-auto">
              From idea to live chatbot in three simple steps — no engineering team required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              step="01"
              title="Design Your Flow"
              description="Open the visual builder, drag nodes onto the canvas, and connect them to create your conversation logic."
            />
            <StepCard
              step="02"
              title="Add Intelligence"
              description="Connect an LLM provider, upload your knowledge base, and configure RAG nodes for context-aware responses."
            />
            <StepCard
              step="03"
              title="Deploy & Embed"
              description="Publish your bot with one click, copy the embed snippet, and paste it into your website's HTML."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, title, description }) {
  return (
    <div className="text-center p-6">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-crimson text-white text-xl font-bold mb-4">
        {step}
      </div>
      <h4 className="text-lg font-bold text-charcoal mb-2">{title}</h4>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}
