import {
  Github,
  Linkedin,
  GraduationCap,
  Code2,
  Server,
  Brain,
  Database,
} from "lucide-react";

export default function AboutSection() {
  return (
    <section id="about" className="py-24 px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* How it works mini-flow */}
        <div id="features">
          <div className="text-center mb-12">
            <span className="inline-block text-crimson text-sm font-semibold tracking-wider uppercase mb-3">
              Quick Overview
            </span>
            <h3 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-4">
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

        {/* Learning Project Section */}
        <div className="mt-28">
          <div className="text-center mb-10">
            <span className="inline-block text-crimson text-sm font-semibold tracking-wider uppercase mb-3">
              About This Project
            </span>
            <h3 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-4">
              A Learning Project
            </h3>
          </div>

          <div className="bg-soft-white border border-light-rose rounded-2xl p-10">
            {/* Intro */}
            <div className="flex items-start gap-5 mb-8">
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-full bg-light-rose text-crimson">
                <GraduationCap size={28} />
              </div>
              <div>
                <p className="text-charcoal text-base leading-relaxed">
                  ChatCraft is built by <span className="font-bold">Madhav Bhayani</span> as a hands-on
                  learning project exploring modern full-stack development. The goal is to understand how
                  no-code platforms, LLM orchestration, and RAG pipelines work by building one from scratch.
                </p>
              </div>
            </div>

            {/* Tech stack pills */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <TechPill icon={<Code2 size={16} />} label="React + Vite" />
              <TechPill icon={<Server size={16} />} label="Go Backend" />
              <TechPill icon={<Brain size={16} />} label="LLM Integration" />
              <TechPill icon={<Database size={16} />} label="RAG Pipeline" />
            </div>

            {/* Message */}
            <p className="text-muted text-sm text-center leading-relaxed mb-8">
              Contributions, feedback, and ideas are always welcome.
              This project is open-source — feel free to explore, learn, and build along!
            </p>

            {/* Connect buttons */}
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://github.com/madhavbhayani"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-charcoal text-white px-6 py-2.5 rounded-full text-sm font-semibold
                           hover:bg-charcoal/80 transition-colors duration-200"
              >
                <Github size={16} />
                GitHub
              </a>
              <a
                href="https://linkedin.com/in/madhavbhayani"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-6 py-2.5 rounded-full text-sm font-semibold
                           hover:bg-charcoal hover:text-white transition-colors duration-200"
              >
                <Linkedin size={16} />
                LinkedIn
              </a>
            </div>
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

function TechPill({ icon, label }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-white border border-light-rose rounded-full px-4 py-2 text-sm font-medium text-charcoal">
      <span className="text-crimson">{icon}</span>
      {label}
    </div>
  );
}
