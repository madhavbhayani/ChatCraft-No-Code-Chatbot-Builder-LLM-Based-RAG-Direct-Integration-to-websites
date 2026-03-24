import { useMemo, useState } from "react";
import {
  Palette,
  Type,
  Bot,
  Check,
  Sparkles,
  Circle,
  Square,
  SlidersHorizontal,
} from "lucide-react";

const THEME_COLORS = [
  "#DC2626",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#111827",
];

const FONT_OPTIONS = [
  "Inter",
  "Poppins",
  "Manrope",
  "DM Sans",
  "Montserrat",
  "Merriweather",
];

const BUBBLE_STYLES = [
  { id: "rounded", label: "Rounded", icon: Circle },
  { id: "soft-square", label: "Soft Square", icon: Square },
  { id: "compact", label: "Compact", icon: SlidersHorizontal },
];

function IconGallery() {
  // Auto-load any icons placed inside src/assets/customization_icons/
  const iconModules = useMemo(
    () => import.meta.glob("../../assets/customization_icons/*.{png,jpg,jpeg,webp,svg}", { eager: true }),
    []
  );

  const iconEntries = Object.entries(iconModules).map(([path, mod]) => ({
    path,
    src: mod.default,
    name: path.split("/").pop()?.replace(/\.[^/.]+$/, "") || "icon",
  }));

  if (iconEntries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
        No chatbot icons found yet. Add files to
        <span className="mx-1 font-mono text-charcoal">src/assets/customization_icons/</span>
        and they will appear here automatically.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {iconEntries.map((item) => (
        <button
          key={item.path}
          type="button"
          className="group border border-gray-200 rounded-xl bg-white p-3 hover:border-crimson/40 hover:shadow-sm transition text-left"
        >
          <div className="aspect-square rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden mb-2">
            <img src={item.src} alt={item.name} className="w-full h-full object-contain" />
          </div>
          <p className="text-xs text-gray-500 truncate" title={item.name}>
            {item.name}
          </p>
        </button>
      ))}
    </div>
  );
}

export default function CustomizationSection() {
  const [themeColor, setThemeColor] = useState(THEME_COLORS[0]);
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0]);
  const [bubbleStyle, setBubbleStyle] = useState(BUBBLE_STYLES[0].id);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Customization</h2>
          <p className="text-sm text-gray-500 mt-1">
            Customize chatbot visuals for your website. These are UI-only controls for now.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Bot size={15} />
                  Chatbot Icon
                </h3>
              </div>
              <div className="p-6">
                <IconGallery />
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Palette size={15} />
                  Theme Color
                </h3>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  {THEME_COLORS.map((color) => {
                    const selected = color === themeColor;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setThemeColor(color)}
                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition ${
                          selected ? "border-charcoal scale-105" : "border-white shadow"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      >
                        {selected ? <Check size={14} className="text-white" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Type size={15} />
                  Font Selection
                </h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {FONT_OPTIONS.map((font) => {
                  const selected = fontFamily === font;
                  return (
                    <button
                      key={font}
                      type="button"
                      onClick={() => setFontFamily(font)}
                      className={`text-left px-4 py-3 rounded-lg border transition ${
                        selected
                          ? "border-crimson bg-crimson/5"
                          : "border-gray-200 hover:border-crimson/30"
                      }`}
                    >
                      <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: font }}>
                        {font}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: font }}>
                        The quick brown fox jumps over the lazy dog.
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Sparkles size={15} />
                  Bubble Style
                </h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                {BUBBLE_STYLES.map((style) => {
                  const Icon = style.icon;
                  const selected = bubbleStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setBubbleStyle(style.id)}
                      className={`px-4 py-3 rounded-lg border flex items-center gap-2 text-sm transition ${
                        selected
                          ? "border-crimson bg-crimson/5 text-charcoal"
                          : "border-gray-200 text-gray-600 hover:border-crimson/30"
                      }`}
                    >
                      <Icon size={14} />
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="bg-white border border-gray-200 rounded-xl overflow-hidden h-fit sticky top-6">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-charcoal">Live Preview</h3>
            </div>
            <div className="p-6">
              <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                <div className="rounded-xl p-3 text-white text-sm mb-3" style={{ backgroundColor: themeColor, fontFamily }}>
                  Hi! I am your chatbot.
                </div>
                <div
                  className={`inline-block px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 ${
                    bubbleStyle === "rounded"
                      ? "rounded-2xl"
                      : bubbleStyle === "soft-square"
                      ? "rounded-md"
                      : "rounded-sm"
                  }`}
                  style={{ fontFamily }}
                >
                  Ask me anything about this website.
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Preview only. Backend integration for saving these settings will be added later.
              </p>
            </div>
          </aside>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
