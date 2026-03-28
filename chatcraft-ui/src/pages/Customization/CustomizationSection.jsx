import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Palette, Type, Bot, Check, Upload, Search, Save, X, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "../../utils/auth";
import { apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");
const DEFAULT_THEME_COLOR = "#DC2626";
const DEFAULT_USER_FONT_COLOR = "#FFFFFF";
const DEFAULT_BOT_FONT_COLOR = "#111827";

const GOOGLE_FONTS = [
  "Alegreya", "Almarai", "Amiri", "Archivo", "Arvo", "Asap", "Asap Condensed", "Assistant",
  "Atkinson Hyperlegible", "Barlow", "Barlow Condensed", "Barlow Semi Condensed", "Baskervville",
  "Bigelow Rules", "Bitter", "Bodoni Moda", "Bona Nova", "Bungee", "Cabin", "Cairo", "Cardo",
  "Caveat", "Chakra Petch", "Comfortaa", "Cormorant", "Courier Prime", "Crimson Text", "DM Sans",
  "Domine", "Dosis", "EB Garamond", "Enriqueta", "Familjen Grotesk", "Fontdiner Swanky", "Fredoka",
  "Freckle Face", "Fresca", "Fugaz One", "IBM Plex Arabic", "IBM Plex Mono", "IBM Plex Sans",
  "IM Fell DW Pica", "Inconsolata", "Indie Flower", "Inter", "JetBrains Mono", "Josefin Sans", "Jost",
  "Kanit", "Laila", "Lato", "Ledger", "Lexend", "Libre Baskerville", "Libre Franklin", "Lora",
  "Manrope", "Merriweather", "Mitr", "Montserrat", "Mulish", "Niramit", "Noto Sans",
  "Noto Sans Arabic", "Noto Sans Thai", "Noto Serif", "Nunito", "Open Sans", "Oswald", "Outfit",
  "Overpass", "Overpass Mono", "Oxygen", "Pacifico", "Pattaya", "Playfair Display", "Playfair Display SC",
  "Plus Jakarta Sans", "Poppins", "Proza Libre", "PT Sans", "Quattrocento", "Quattrocento Sans",
  "Quicksand", "Radley", "Raleway", "Righteous", "Roboto", "Roboto Mono", "Ropa Sans", "Rubik",
  "Sora", "Source Code Pro", "Source Sans 3", "Space Grotesk", "Space Mono", "Syne", "Teko",
  "Titillium Web", "Ubuntu", "Unbounded", "Urbanist", "Varela Round", "Work Sans", "Yantramanav",
  "Zilla Slab", "Aleo", "Aref Ruqaa", "Bai Jamjuree", "Bebas Neue", "Carter One", "Catamaran",
  "Chivo", "Exo 2", "Fira Sans", "Hind", "Hind Madurai", "Karla", "Lobster", "Maven Pro", "Mukta",
  "Noto Kufi Arabic", "Noto Naskh Arabic", "Prompt", "Rajdhani", "Rubik Mono One", "Signika",
].sort();

const SUPPORTED_FORMATS = ["jpeg", "jpg", "png", "svg", "webp"];
const MAX_FILE_SIZE = 250 * 1024;
const loadedFonts = new Set();

function loadGoogleFont(fontName) {
  if (!fontName || loadedFonts.has(fontName) || typeof document === "undefined") return;
  const family = encodeURIComponent(fontName).replace(/%20/g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(fontName);
}

function normalizeHexColor(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^#([0-9A-Fa-f]{6})$/.test(trimmed)) return trimmed.toUpperCase();

  const match = trimmed.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
  if (!match) return fallback;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if ([r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) return fallback;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}


function IconGallery({
  selectedIcon,
  setSelectedIcon,
  uploadedFile,
  setUploadedFile,
  uploadedPreviewUrl,
  uploadingError,
  setUploadingError,
  onDeleteUploaded,
}) {

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
    setUploadingError("");
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_FORMATS.includes(extension)) {
      setUploadingError("Unsupported format. Use: jpeg, jpg, png, svg, webp.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadingError(`File too large: ${(file.size / 1024).toFixed(1)}KB. Max 250KB.`);
      return;
    }

    // One icon only: latest selection replaces prior upload.
    setUploadedFile(file);
    setSelectedIcon({ source: "uploaded", url: "", name: file.name });
  };

  const hasUploadedIcon = selectedIcon?.source === "uploaded" && (!!uploadedFile || !!selectedIcon?.url);
  const uploadedIconUrl = uploadedPreviewUrl || selectedIcon?.url || "";

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        {!hasUploadedIcon ? (
          <label
            className="relative cursor-pointer border-2 border-dashed rounded-lg bg-gray-50 p-2 transition hover:border-crimson/40 hover:bg-gray-100 border-gray-300"
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
        ) : null}

        {iconEntries.map((icon) => (
          <button
            key={icon.key}
            type="button"
            onClick={() => {
              setUploadedFile(null);
              setUploadingError("");
              setSelectedIcon({ source: "predefined", url: icon.src, name: icon.name });
            }}
            className={`border rounded-lg bg-white p-2 transition hover:border-crimson/40 hover:shadow-sm ${
              selectedIcon?.source === "predefined" && selectedIcon?.url === icon.src
                ? "border-crimson bg-crimson/5"
                : "border-gray-200"
            }`}
            title={icon.name}
          >
            <img src={icon.src} alt={icon.name} className="w-12 h-12 object-contain" />
          </button>
        ))}

        {hasUploadedIcon && uploadedIconUrl ? (
          <div className="relative group border border-crimson bg-crimson/5 rounded-lg p-2" title={selectedIcon?.name || "Uploaded icon"}>
            <img src={uploadedIconUrl} alt={selectedIcon?.name || "uploaded-icon"} className="w-12 h-12 object-contain" />
            <button
              type="button"
              onClick={onDeleteUploaded}
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-charcoal text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition"
              title="Remove uploaded icon"
              aria-label="Remove uploaded icon"
            >
              <X size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-gray-500 mt-2">Supported: JPEG, JPG, PNG, SVG, WEBP. Max size: 250KB.</p>
      {uploadingError ? <p className="text-xs text-crimson mt-1">{uploadingError}</p> : null}
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

      {open ? (
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
                  {value === font ? <Check size={14} className="float-right mt-0.5" /> : null}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-gray-500">No fonts match your search.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CustomizationSection({ projectName = "" }) {
  const { projectId } = useParams();

  const [selectedIcon, setSelectedIcon] = useState({ source: "none", url: "", name: "" });
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadingError, setUploadingError] = useState("");

  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [userFontColor, setUserFontColor] = useState(DEFAULT_USER_FONT_COLOR);
  const [botFontColor, setBotFontColor] = useState(DEFAULT_BOT_FONT_COLOR);
  const [fontFamily, setFontFamily] = useState("Roboto");
  const [chatbotName, setChatbotName] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState("");

  const token = getSession()?.token || "";

  useEffect(() => {
    if (!uploadedFile) {
      setUploadedPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(uploadedFile);
    setUploadedPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadedFile]);

  useEffect(() => {
    if (!projectId || !token) {
      setLoadingSettings(false);
      return;
    }

    const fetchCustomization = async () => {
      try {
        const res = await fetch(`${API}/console/customization/${projectId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Failed to load customization");
        }
        const data = await res.json();
        setThemeColor(normalizeHexColor(data.theme_color, DEFAULT_THEME_COLOR));
        setUserFontColor(normalizeHexColor(data.user_font_color, DEFAULT_USER_FONT_COLOR));
        setBotFontColor(normalizeHexColor(data.bot_font_color, DEFAULT_BOT_FONT_COLOR));
        if (data.font_family) {
          setFontFamily(data.font_family);
        }
        setChatbotName((data.chatbot_name || "").toString());
        if (data.icon_url) {
          setSelectedIcon({ source: data.icon_source || "uploaded", url: data.icon_url, name: "saved" });
          setUploadedFile(null);
        }
      } catch (err) {
        // Non-blocking load failure
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchCustomization();
  }, [projectId, token]);

  const handleColorPicker = (hex) => {
    const upperHex = hex.toUpperCase();
    setThemeColor(upperHex);
  };

  const handleSave = async () => {
    if (!projectId) {
      toast.error("Project ID not found");
      return;
    }
    if (!token) {
      toast.error("Session expired. Please log in again.");
      return;
    }
    if (uploadingError) {
      toast.error("Fix validation errors before saving");
      return;
    }
    if (chatbotName.trim().length > 120) {
      toast.error("Chatbot name must be 120 characters or fewer");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("theme_color", themeColor);
      formData.append("user_font_color", userFontColor);
      formData.append("bot_font_color", botFontColor);
      formData.append("font_family", fontFamily);
      formData.append("chatbot_name", chatbotName.trim());
      formData.append("icon_source", selectedIcon?.source || "none");

      if (selectedIcon?.source === "predefined" && selectedIcon?.url) {
        formData.append("selected_icon_url", selectedIcon.url);
      }

      // Upload happens only when Save is clicked.
      if (selectedIcon?.source === "uploaded") {
        if (uploadedFile) {
          formData.append("icon_file", uploadedFile);
        } else if (selectedIcon?.url) {
          formData.append("selected_icon_url", selectedIcon.url);
        } else {
          toast.error("Please select one icon file before saving");
          setSaving(false);
          return;
        }
      }

      const res = await fetch(`${API}/console/customization/${projectId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || "Failed to save customization");
      }

      const nextSource = payload?.icon_source || selectedIcon?.source || "none";
      setChatbotName((payload?.chatbot_name || "").toString());
      if (nextSource === "none") {
        setSelectedIcon({ source: "none", url: "", name: "" });
      } else if (payload?.icon_url) {
        setSelectedIcon((prev) => ({
          ...prev,
          url: payload.icon_url,
          source: nextSource,
          name: prev?.name || (nextSource === "uploaded" ? "uploaded" : "icon"),
        }));
      }
      setUploadedFile(null);
      setUploadingError("");

      toast.success("Customization saved successfully");
    } catch (err) {
      toast.error(err.message || "Failed to save customization");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUploadedIcon = () => {
    setUploadedFile(null);
    setUploadingError("");
    setSelectedIcon({ source: "none", url: "", name: "" });
  };

  const chatbotAvatarUrl = selectedIcon?.source === "uploaded"
    ? (uploadedPreviewUrl || selectedIcon?.url || "")
    : (selectedIcon?.url || "");
  const previewProjectName = projectName?.trim() || "there";
  const previewChatbotName = chatbotName.trim() || "ChatCraft Assistant";

  if (loadingSettings) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-crimson animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-charcoal">Customization</h2>
            <p className="text-sm text-gray-500 mt-1">Customize chatbot visuals for your website.</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loadingSettings}
            className="inline-flex items-center gap-2 bg-charcoal text-white px-4 py-2 rounded-lg hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save Customization"}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:items-start">
          <div className="xl:col-span-2 space-y-6">
            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Bot size={15} />
                  Chatbot Name
                </h3>
              </div>
              <div className="p-6 space-y-2">
                <input
                  type="text"
                  value={chatbotName}
                  onChange={(event) => setChatbotName(event.target.value.slice(0, 120))}
                  placeholder="Enter chatbot name"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40"
                />
                <p className="text-xs text-gray-500">This name is used as your chatbot identity. Max 120 characters.</p>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Bot size={15} />
                  Chatbot Icon
                </h3>
              </div>
              <div className="p-6">
                <IconGallery
                  selectedIcon={selectedIcon}
                  setSelectedIcon={setSelectedIcon}
                  uploadedFile={uploadedFile}
                  setUploadedFile={setUploadedFile}
                  uploadedPreviewUrl={uploadedPreviewUrl}
                  uploadingError={uploadingError}
                  setUploadingError={setUploadingError}
                  onDeleteUploaded={handleDeleteUploadedIcon}
                />
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
                  <span className="text-xs font-mono text-gray-500">{themeColor}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
                  <Type size={15} />
                  Font Colors
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={userFontColor}
                    onChange={(event) => setUserFontColor(event.target.value.toUpperCase())}
                    className="h-10 w-14 rounded-md border border-gray-200 cursor-pointer bg-white"
                    aria-label="Pick user text color"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm text-gray-700 font-medium">User message text</p>
                    <p className="text-xs font-mono text-gray-500">{userFontColor}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={botFontColor}
                    onChange={(event) => setBotFontColor(event.target.value.toUpperCase())}
                    className="h-10 w-14 rounded-md border border-gray-200 cursor-pointer bg-white"
                    aria-label="Pick chatbot text color"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm text-gray-700 font-medium">Chatbot message text</p>
                    <p className="text-xs font-mono text-gray-500">{botFontColor}</p>
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

          <aside className="xl:sticky xl:top-6 self-start z-10">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-charcoal">Live Preview</h3>
              </div>
              <div className="p-6">
                <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50 space-y-3">
                  <div className="flex justify-end items-end gap-2">
                    <div
                      className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm"
                      style={{ backgroundColor: themeColor, fontFamily, color: userFontColor }}
                    >
                      Hii {previewProjectName}, help me!
                    </div>
                    <div className="h-8 w-8 rounded-full bg-charcoal text-white flex items-center justify-center shrink-0">
                      <User size={14} />
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {chatbotAvatarUrl ? (
                        <img src={chatbotAvatarUrl} alt="Chatbot icon" className="h-full w-full object-cover" />
                      ) : (
                        <Bot size={14} className="text-charcoal" />
                      )}
                    </div>
                    <div
                      className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 text-sm bg-white border border-gray-200"
                      style={{ fontFamily, color: botFontColor }}
                    >
                      Hi! I am {previewChatbotName}. Please tell me what kind of help you want.
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <p><strong>Name:</strong> {previewChatbotName}</p>
                  <p><strong>Color:</strong> <span className="font-mono">{themeColor}</span></p>
                  <p><strong>User text:</strong> <span className="font-mono">{userFontColor}</span></p>
                  <p><strong>Chatbot text:</strong> <span className="font-mono">{botFontColor}</span></p>
                  <p><strong>Font:</strong> {fontFamily}</p>
                  {selectedIcon?.source !== "none" ? <p className="text-green-600">Selected icon ready</p> : null}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
