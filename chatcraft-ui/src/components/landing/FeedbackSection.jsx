import { useState } from "react";
import { ExternalLink, Mail, Type, AlignLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const GITHUB_REPO_URL =
  "https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites";

const reportTypeOptions = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

export default function FeedbackSection() {
  const [form, setForm] = useState({
    type: "bug",
    title: "",
    description: "",
    email: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error("Please enter a title for your report.");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Please enter a description.");
      return;
    }

    // Build labels
    const labelMap = { bug: "bug", feature: "enhancement", improvement: "improvement", other: "question" };
    const label = labelMap[form.type] || "bug";
    const typeLabel = reportTypeOptions.find((o) => o.value === form.type)?.label || form.type;

    // Build issue body
    const body = [
      `## ${typeLabel}`,
      "",
      `**Type:** ${typeLabel}`,
      form.email ? `**Reporter Email:** ${form.email}` : "",
      "",
      "### Description",
      form.description,
      "",
      "---",
      `_Submitted via ChatCraft Feedback Form_`,
    ]
      .filter(Boolean)
      .join("\n");

    // Build GitHub new issue URL
    const params = new URLSearchParams({
      title: `[${form.type.toUpperCase()}] ${form.title}`,
      body,
      labels: label,
    });

    const issueURL = `${GITHUB_REPO_URL}/issues/new?${params.toString()}`;
    window.open(issueURL, "_blank", "noopener,noreferrer");
    toast.success("Opening GitHub Issues — complete the submission there!");
  };

  return (
    <section id="feedback" className="py-24 px-6 bg-soft-white">
      <div className="max-w-xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-10">
          <span className="inline-block text-crimson text-sm font-semibold tracking-wider uppercase mb-3">
            Feedback
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-4">
            Found a bug? Have a suggestion?
          </h2>
          <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
            Report issues or propose improvements. Your submission opens a pre-filled
            GitHub issue — no account needed to draft it.
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-light-rose rounded-2xl p-6 md:p-8 shadow-sm space-y-5"
        >
          {/* Report Type — Select */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Report Type</label>
            <div className="relative">
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                           focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition cursor-pointer"
              >
                {reportTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title</label>
            <div className="relative">
              <Type size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Brief summary of the issue or idea"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                           placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description</label>
            <div className="relative">
              <AlignLeft size={16} className="absolute left-3 top-3 text-muted" />
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe the bug, steps to reproduce, or the feature you'd like to see..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                           placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition resize-none"
              />
            </div>
          </div>

          {/* Email (optional) */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Email <span className="text-muted font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                           placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-crimson text-white py-3 rounded-full font-semibold text-sm
                       hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25 mt-2"
          >
            <ExternalLink size={16} />
            Open Issue on GitHub
          </button>
        </form>
      </div>
    </section>
  );
}
