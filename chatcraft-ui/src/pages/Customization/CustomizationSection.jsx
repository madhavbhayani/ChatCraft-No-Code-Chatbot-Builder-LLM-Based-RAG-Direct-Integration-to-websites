import { useEffect, useMemo, useState } from "react";
import { Palette, Type, Bot, Check, Upload, Search } from "lucide-react";

const DEFAULT_THEME_COLOR = "#DC2626";

const GOOGLE_FONTS = [
    "Alegreya",
    "Almarai",
    "Amiri",
    "Archivo",
    "Arvo",
    "Asap",
    "Asap Condensed",
    "Assistant",
    "Atkinson Hyperlegible",
    "Barlow",
    "Barlow Condensed",
    "Barlow Semi Condensed",
    "Baskervville",
    "Bigelow Rules",
    "Bitter",
    "Bodoni Moda",
    "Bona Nova",
    "Bungee",
    "Cabin",
    "Cairo",
    "Cardo",
    "Caveat",
    "Chakra Petch",
    "Comfortaa",
    "Cormorant",
    "Courier Prime",
    "Crimson Text",
    "DM Sans",
    "Domine",
    "Dosis",
    "EB Garamond",
    "Enriqueta",
    "Familjen Grotesk",
    "Fontdiner Swanky",
    "Fredoka",
    "Freckle Face",
    "Fresca",
    "Fugaz One",
    "IBM Plex Arabic",
    "IBM Plex Mono",
    "IBM Plex Sans",
    "IM Fell DW Pica",
    "Inconsolata",
    "Indie Flower",
    "Inter",
    "JetBrains Mono",
    "Josefin Sans",
    "Jost",
    "Kanit",
    "Laila",
    "Lato",
    "Ledger",
    "Lexend",
    "Libre Baskerville",
    "Libre Franklin",
    "Lora",
    "Manrope",
    "Merriweather",
    "Mitr",
    "Montserrat",
    "Mulish",
    "Niramit",
    "Noto Sans",
    "Noto Sans Arabic",
    "Noto Sans Thai",
    "Noto Serif",
    "Nunito",
    "Open Sans",
    "Oswald",
    "Outfit",
    "Overpass",
    "Overpass Mono",
    "Oxygen",
    "Pacifico",
    "Pattaya",
    "Playfair Display",
    "Playfair Display SC",
    "Plus Jakarta Sans",
    "Poppins",
    "Proza Libre",
    "PT Sans",
    "Quattrocento",
    "Quattrocento Sans",
    "Quicksand",
    "Radley",
    "Raleway",
    "Righteous",
    "Roboto",
    "Roboto Mono",
    "Ropa Sans",
    "Rubik",
    "Sora",
    "Source Code Pro",
    "Source Sans 3",
    "Space Grotesk",
    "Space Mono",
    "Syne",
    "Teko",
    "Titillium Web",
    "Ubuntu",
    "Unbounded",
    "Urbanist",
    "Varela Round",
    "Work Sans",
    "Yantramanav",
    "Zilla Slab",
    "Aleo",
    "Aref Ruqaa",
    "Bai Jamjuree",
    "Bebas Neue",
    "Carter One",
    "Catamaran",
    "Chivo",
    "Exo 2",
    "Fira Sans",
    "Hind",
    "Hind Madurai",
    "Karla",
    "Lobster",
    "Maven Pro",
    "Mukta",
    "Noto Kufi Arabic",
    "Noto Naskh Arabic",
    "Prompt",
    "Rajdhani",
    "Rubik Mono One",
    "Signika",
].sort();

const SUPPORTED_FORMATS = ["jpeg", "jpg", "png", "svg", "webp"];
const MAX_FILE_SIZE = 250 * 1024;
const loadedFonts = new Set();

function loadGoogleFont(fontName) {
  if (!fontName || loadedFonts.has(fontName) || typeof document === "undefined") return;

  const family = encodeURIComponent(fontName).replace(/%20/g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600&display=swap`;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-font-family", fontName);
  document.head.appendChild(link);
  loadedFonts.add(fontName);
}

function hexToRgbString(hex) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return "";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function rgbStringToHex(value) {
  const match = value.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
  if (!match) return "";

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);

  if ([r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) return "";
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function IconGallery({ onIconSelect }) {
  const [uploadError, setUploadError] = useState("");
  const [uploadedIcon, setUploadedIcon] = useState(null);
  const [selectedIconKey, setSelectedIconKey] = useState("");

  const iconModules = useMemo(
    () => import.meta.glob("../../assets/customization_icons/*.{png,jpg,jpeg,webp,svg}", { eager: true }),
    []
  );

  const iconEntries = Object.entries(iconModules).map(([path, mod]) => ({
    key: path,
    src: mod.default,
    name: path.split("/").pop()?.replace(/\.[^/.]+$/, "") || "icon",
  }));

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    setUploadError("");
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_FORMATS.includes(extension)) {
      setUploadError("Unsupported format. Use: jpeg, jpg, png, svg, webp.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File too large: ${(file.size / 1024).toFixed(1)}KB. Max 250KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const uploaded = {
        key: "uploaded",
        src: String(loadEvent.target?.result || ""),
        name: file.name.replace(/\.[^/.]+$/, ""),
      };
      setUploadedIcon(uploaded);
      setSelectedIconKey(uploaded.key);
      onIconSelect?.(uploaded.src);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <label
          className={`relative cursor-pointer border-2 border-dashed rounded-lg bg-gray-50 p-2 transition hover:border-crimson/40 hover:bg-gray-100 ${
            selectedIconKey === "uploaded" ? "border-crimson bg-crimson/5" : "border-gray-300"
          }`}
          title="Upload icon"
        >
          <div className="w-12 h-12 flex flex-col items-center justify-center text-gray-500">
            <Upload size={16} />
            <span className="text-[10px] mt-1 leading-tight">Upload</span>
          </div>
          <input
            type="file"
            accept={SUPPORTED_FORMATS.map((ext) => `.${ext}`).join(",")}
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>

        {iconEntries.map((icon) => (
          <button
            key={icon.key}
            type="button"
            onClick={() => {
              setSelectedIconKey(icon.key);
              onIconSelect?.(icon.src);
            }}
            className={`border rounded-lg bg-white p-2 transition hover:border-crimson/40 hover:shadow-sm ${
              selectedIconKey === icon.key ? "border-crimson bg-crimson/5" : "border-gray-200"
            }`}
            title={icon.name}
          >
            <img src={icon.src} alt={icon.name} className="w-12 h-12 object-contain" />
          </button>
        ))}

        {uploadedIcon && (
          <button
            type="button"
            onClick={() => {
              setSelectedIconKey(uploadedIcon.key);
              onIconSelect?.(uploadedIcon.src);
            }}
            className={`border rounded-lg bg-white p-2 transition hover:border-crimson/40 hover:shadow-sm ${
              selectedIconKey === uploadedIcon.key ? "border-crimson bg-crimson/5" : "border-gray-200"
            }`}
            title={uploadedIcon.name}
          >
            <img src={uploadedIcon.src} alt={uploadedIcon.name} className="w-12 h-12 object-contain" />
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Supported: JPEG, JPG, PNG, SVG, WEBP. Max size: 250KB.
      </p>
      {uploadError && <p className="text-xs text-crimson mt-1">{uploadError}</p>}
    </div>
  );
}

function FontSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? GOOGLE_FONTS.filter((font) => font.toLowerCase().includes(search.toLowerCase()))
    : GOOGLE_FONTS;

  useEffect(() => {
    loadGoogleFont(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    // Preload fonts visible in the current filtered list for accurate preview styles.
    filtered.slice(0, 40).forEach((font) => loadGoogleFont(font));
  }, [open, filtered]);

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-left text-sm font-medium text-charcoal hover:border-crimson/30 transition flex items-center justify-between"
      >
        <span style={{ fontFamily: value }}>{value}</span>
        <Search size={14} className="text-gray-400" />
      </button>

      {open && (
        <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[120] relative">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search fonts..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-crimson"
              autoFocus
            />
          </div>

          <div>
            {filtered.length > 0 ? (
              filtered.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => {
                    onChange(font);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition ${
                    value === font ? "bg-crimson/10 text-crimson font-semibold" : "hover:bg-gray-50"
                  }`}
                  style={{ fontFamily: font }}
                >
                  {font}
                  {value === font && <Check size={14} className="float-right mt-0.5" />}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-gray-500">No fonts match your search.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomizationSection() {
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [hexValue, setHexValue] = useState(DEFAULT_THEME_COLOR);
  const [rgbValue, setRgbValue] = useState(hexToRgbString(DEFAULT_THEME_COLOR));
  const [hexError, setHexError] = useState("");
  const [rgbError, setRgbError] = useState("");
  const [fontFamily, setFontFamily] = useState("Roboto");

  const handleColorPicker = (hex) => {
    const upperHex = hex.toUpperCase();
    setThemeColor(upperHex);
    setHexValue(upperHex);
    setRgbValue(hexToRgbString(upperHex));
    setHexError("");
    setRgbError("");
  };

  const handleHexChange = (value) => {
    setHexValue(value.toUpperCase());
    setHexError("");
    if (!value.trim()) return;

    const normalized = value.trim().toUpperCase();
    if (!/^#([0-9A-F]{6})$/.test(normalized)) {
      setHexError("Enter HEX like #DC2626");
      return;
    }

    setThemeColor(normalized);
    setRgbValue(hexToRgbString(normalized));
  };

  const handleRgbChange = (value) => {
    setRgbValue(value);
    setRgbError("");
    if (!value.trim()) return;

    const hex = rgbStringToHex(value);
    if (!hex) {
      setRgbError("Use RGB format: R, G, B (0-255)");
      return;
    }

    setThemeColor(hex);
    setHexValue(hex);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Customization</h2>
          <p className="text-sm text-gray-500 mt-1">Customize chatbot visuals for your website.</p>
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
                <IconGallery onIconSelect={setSelectedIcon} />
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Palette size={15} />
                  Theme Color
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(event) => handleColorPicker(event.target.value)}
                    className="h-10 w-14 rounded-md border border-gray-200 cursor-pointer bg-white"
                    aria-label="Pick color"
                  />
                  <span className="text-sm text-gray-600">Select your theme color</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">HEX</label>
                    <input
                      type="text"
                      value={hexValue}
                      onChange={(event) => handleHexChange(event.target.value)}
                      placeholder="#DC2626"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-crimson"
                    />
                    {hexError && <p className="text-xs text-crimson mt-1">{hexError}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">RGB</label>
                    <input
                        type="text"
                        value={rgbValue}
                        onChange={(event) => handleRgbChange(event.target.value)}
                        placeholder="220, 38, 38"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-crimson"
                    />
                    {rgbError && <p className="text-xs text-crimson mt-1">{rgbError}</p>}
                    </div>
                </div>
                </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-visible relative z-30">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                    <Type size={15} />
                    Font Selection
                </h3>
                </div>
                <div className="p-6 relative z-40">
                <FontSelector value={fontFamily} onChange={setFontFamily} />
                <p className="text-xs text-gray-500 mt-3">Choose from {GOOGLE_FONTS.length}+ Google free fonts</p>
                </div>
            </section>
        </div>

          <aside className="bg-white border border-gray-200 rounded-xl overflow-hidden h-fit sticky top-6 z-10">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-charcoal">Live Preview</h3>
            </div>
            <div className="p-6">
              <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                <div
                  className="rounded-lg p-3 text-white text-sm mb-3 w-fit max-w-xs"
                  style={{ backgroundColor: themeColor, fontFamily }}
                >
                  Hi! I am your chatbot.
                </div>
                <div
                  className="inline-block px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg ml-auto block"
                  style={{ fontFamily }}
                >
                  Ask me anything about this website.
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-gray-500">
                <p>
                  <strong>Color:</strong> <span className="font-mono">{themeColor}</span>
                </p>
                <p>
                  <strong>Font:</strong> {fontFamily}
                </p>
                {selectedIcon && <p className="text-green-600">Selected icon ready</p>}
              </div>
            </div>
          </aside>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
