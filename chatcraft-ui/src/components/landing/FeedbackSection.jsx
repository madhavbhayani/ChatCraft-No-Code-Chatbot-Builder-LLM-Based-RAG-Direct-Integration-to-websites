import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Product Manager, TechFlow",
    content:
      "ChatCraft transformed how we handle customer support. We built a fully functional AI chatbot in under an hour — no developers needed. The RAG feature is a game-changer for our documentation.",
    rating: 5,
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder, LearnHub",
    content:
      "The visual flow builder is incredibly intuitive. I connected GPT-4, uploaded our course materials, and had a smart tutor bot live on our site the same day. Students love it.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "CTO, HealthBridge",
    content:
      "We needed a HIPAA-aware chatbot that could answer from our medical docs. ChatCraft's knowledge base upload and LLM integration made it possible without a single line of code.",
    rating: 5,
  },
  {
    name: "James Okafor",
    role: "Marketing Lead, ShopEase",
    content:
      "The embed widget took us 2 minutes to put on our e-commerce site. Conversion rate on product questions went up 34%. The analytics dashboard tells us exactly what customers ask about.",
    rating: 4,
  },
  {
    name: "Elena Volkov",
    role: "Head of Support, DataSync",
    content:
      "We replaced three separate tools with ChatCraft. The condition nodes and human handoff feature mean our bot handles 80% of queries and seamlessly transfers the rest to agents.",
    rating: 5,
  },
  {
    name: "David Kim",
    role: "Freelance Developer",
    content:
      "I use ChatCraft for all my client projects now. Build once, customize per client, deploy everywhere. The multi-LLM support lets me pick the right model for each use case.",
    rating: 5,
  },
];

export default function FeedbackSection() {
  return (
    <section className="py-24 px-6 bg-soft-white">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-crimson text-sm font-semibold tracking-wider uppercase mb-3">
            Testimonials
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-charcoal mb-5">
            Loved by Builders
            <span className="text-crimson"> Everywhere</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            See what teams and creators are saying about building chatbots with ChatCraft.
          </p>
        </div>

        {/* Testimonial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white border border-light-rose rounded-xl p-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-200"
            >
              <div>
                <Quote size={24} className="text-dusty-rose mb-3" />
                <p className="text-charcoal text-sm leading-relaxed mb-4">
                  {t.content}
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-light-rose">
                <div className="flex items-center gap-1 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < t.rating ? "text-warning fill-warning" : "text-light-rose"}
                    />
                  ))}
                </div>
                <p className="text-sm font-bold text-charcoal">{t.name}</p>
                <p className="text-xs text-muted">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
