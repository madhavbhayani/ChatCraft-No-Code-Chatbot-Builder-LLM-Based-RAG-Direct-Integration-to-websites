import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Globe,
  FileText,
  Key,
  Zap,
  Check,
  Loader2,
  Upload,
  Trash2,
  Info,
  ExternalLink,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Activity,
  Search,
  Shield,
  Star,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Clock,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { getSession, isLoggedIn } from "../../utils/auth";
import { apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");

const STEPS = [
  { id: 1, title: "API Key", desc: "Add your Gemini API key for embeddings", icon: Key },
  { id: 2, title: "Crawl & Upload", desc: "Crawl your website and upload additional data", icon: Globe },
  { id: 3, title: "Generate Embeddings", desc: "Convert text chunks into vector embeddings", icon: Zap },
];

const STEP_SLUG_BY_ID = {
  1: "api_key",
  2: "crawl_upload",
  3: "embed",
};

const STEP_ID_BY_SLUG = {
  api_key: 1,
  crawl_upload: 2,
  embed: 3,
};

export default function IntegratePage() {
  const navigate = useNavigate();
  const { projectId, stepSlug } = useParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Step 1 state
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawledPages, setCrawledPages] = useState([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [crawlReport, setCrawlReport] = useState(null);

  // Subdomain discovery state
  const [domainInput, setDomainInput] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [subdomainResults, setSubdomainResults] = useState(null);
  const [selectedSubdomains, setSelectedSubdomains] = useState(new Set());
  const [showLowPriority, setShowLowPriority] = useState(false);

  // Step 2 state (upload)
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Step 1 state (API Key)
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyValidated, setKeyValidated] = useState(false);

  // Step 3 state (Embed)
  const [embedding, setEmbedding] = useState(false);
  const [embedStats, setEmbedStats] = useState(null);
  const [embedJobId, setEmbedJobId] = useState(null);
  const [embedProgress, setEmbedProgress] = useState(null);
  const [embedPlan, setEmbedPlan] = useState(null);
  const [pausing, setPausing] = useState(false);
  const embedPollRef = useRef(null);

  // Crawl job polling state
  const [crawlJobId, setCrawlJobId] = useState(null);
  const [crawlProgress, setCrawlProgress] = useState(null);
  const crawlPollRef = useRef(null);

  // Status
  const [statusData, setStatusData] = useState(null);

  const getToken = useCallback(() => {
    const session = getSession();
    return session?.token || "";
  }, []);

  const goToStep = useCallback(
    (stepId, replace = false) => {
      const slug = STEP_SLUG_BY_ID[stepId] || "api_key";
      navigate(`/console/integrate/${projectId}/${slug}`, { replace });
    },
    [navigate, projectId]
  );

  // Fetch setup status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/console/status/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);

        const done = new Set();
        if (data.setup_step >= 1) done.add(1);
        if (data.setup_step >= 2) done.add(2);
        if (data.setup_step >= 3) done.add(3);
        setCompletedSteps(done);

        if (data.has_api_key) setKeyValidated(true);
        if (data.website_urls && data.website_urls.length > 0) {
          setWebsiteUrl(data.website_urls.join(", "));
        } else if (data.website_url) {
          setWebsiteUrl(data.website_url);
        }

        // Populate documents list for crawled pages display
        if (data.documents && data.documents.length > 0) {
          setCrawledPages(
            data.documents.map((d) => ({
              id: d.id,
              url: d.source_url,
              title: d.title,
              type: d.source_type,
              status: d.status,
            }))
          );
        }

        // Only show "complete" state if ALL chunks are embedded (no pending)
        const pending = data.pending_chunks ?? (data.chunk_count - data.embedded_count);
        if (data.embedded_count > 0 && pending === 0) {
          setEmbedStats({ embedded: data.embedded_count, total: data.chunk_count });
        }

        // --- Resume active crawl job on page refresh ---
        if (data.active_crawl_job_id) {
          setCrawlJobId(data.active_crawl_job_id);
          setCrawling(true);
          if (stepSlug !== "crawl_upload") {
            goToStep(2, true);
          }
          // Don't call startCrawlPolling here; it's done in a separate useEffect below
        }

        // --- Resume active embed job on page refresh ---
        if (data.active_embed_job_id) {
          setEmbedJobId(data.active_embed_job_id);
          setEmbedding(true);
          if (stepSlug !== "embed") {
            goToStep(3, true);
          }
        }

        // Fetch embed plan for Step 3
        const pendingForPlan = data.pending_chunks ?? (data.chunk_count - data.embedded_count);
        if (pendingForPlan > 0 && !data.active_embed_job_id) {
          try {
            const planRes = await fetch(`${API}/console/embed-plan/${projectId}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (planRes.ok) {
              const plan = await planRes.json();
              setEmbedPlan(plan);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, getToken, stepSlug, goToStep]);

  useEffect(() => {
    const stepId = STEP_ID_BY_SLUG[stepSlug];
    if (!stepId) {
      goToStep(1, true);
      return;
    }
    setCurrentStep(stepId);
  }, [stepSlug, goToStep]);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }
    // Fetch project name
    const session = getSession();
    fetch(`${API}/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProjectName(d.project.name);
          if (d.project.id !== projectId) {
            const slug = stepSlug && STEP_ID_BY_SLUG[stepSlug] ? stepSlug : "api_key";
            navigate(`/console/integrate/${d.project.id}/${slug}`);
          }
        }
      })
      .catch(() => {});

    fetchStatus();
  }, [navigate, projectId, fetchStatus, stepSlug]);

  // ---------- Crawl polling ----------
  const stopCrawlPolling = useCallback(() => {
    if (crawlPollRef.current) {
      clearInterval(crawlPollRef.current);
      crawlPollRef.current = null;
    }
  }, []);

  const startCrawlPolling = useCallback((jobId) => {
    stopCrawlPolling();
    console.log("[crawl-poll] Starting polling for job:", jobId);
    crawlPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/console/crawl-status/${jobId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) {
          console.warn("[crawl-poll] Non-OK response:", res.status);
          return;
        }
        const data = await res.json();
        console.log("[crawl-poll] Received:", data.status, data.current_phase, "crawled:", data.crawled_urls, "logs:", data.recent_logs?.length);
        setCrawlProgress(data);

        if (data.status === "done") {
          stopCrawlPolling();
          setCrawling(false);
          setCompletedSteps((prev) => new Set([...prev, 2]));
          toast.success(`Crawl complete: ${data.crawled_urls} pages extracted`);
          fetchStatus();
        } else if (data.status === "failed") {
          stopCrawlPolling();
          setCrawling(false);
          toast.error(data.error_message || "Crawl failed");
        }
      } catch (err) {
        console.error("[crawl-poll] Error:", err);
      }
    }, 2500);
  }, [getToken, stopCrawlPolling, fetchStatus]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopCrawlPolling();
      if (embedPollRef.current) clearInterval(embedPollRef.current);
    };
  }, [stopCrawlPolling]);

  // Auto-resume crawl polling when crawlJobId is set (e.g. after page refresh)
  useEffect(() => {
    if (crawlJobId && crawling && !crawlPollRef.current) {
      startCrawlPolling(crawlJobId);
    }
  }, [crawlJobId, crawling, startCrawlPolling]);

  // ---------- Step 1: Discover Subdomains ----------
  const handleDiscoverSubdomains = async () => {
    const domain = domainInput.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    if (!domain) {
      toast.error("Please enter a domain");
      return;
    }

    // Validate: reject if user entered a subdomain (more than one dot in domain part, excluding TLDs like co.uk)
    const parts = domain.split(".");
    if (parts.length > 3 || (parts.length === 3 && !["co", "com", "org", "net", "ac", "gov"].includes(parts[parts.length - 2]))) {
      toast.error("Please enter only the main domain (e.g., shopify.com), not a subdomain");
      return;
    }

    setDiscovering(true);
    setSubdomainResults(null);
    try {
      const res = await fetch(`${API}/console/discover-subdomains/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discovery failed");

      setSubdomainResults(data);

      // Auto-select recommended subdomains that are live
      const autoSelected = new Set();
      data.subdomains?.forEach((s) => {
        if (s.is_live && s.auto_selected) {
          autoSelected.add(s.subdomain);
        }
      });
      if (data.main_site?.is_live) {
        autoSelected.add(data.main_site.subdomain);
      }
      setSelectedSubdomains(autoSelected);
      toast.success(`Found ${data.subdomains?.length || 0} subdomains`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const toggleSubdomain = (subdomain) => {
    setSelectedSubdomains((prev) => {
      const next = new Set(prev);
      if (next.has(subdomain)) {
        next.delete(subdomain);
      } else {
        next.add(subdomain);
      }
      return next;
    });
  };

  // ---------- Step 1: Crawl ----------
  const handleCrawl = async () => {
    // Build URLs list from selected subdomains or fallback to single URL
    let urlsToCrawl = [];
    if (subdomainResults && selectedSubdomains.size > 0) {
      urlsToCrawl = Array.from(selectedSubdomains).map((s) => "https://" + s);
    } else if (domainInput.trim()) {
      const d = domainInput.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      urlsToCrawl = ["https://" + d];
    }

    if (urlsToCrawl.length === 0) {
      toast.error("Please select at least one subdomain to crawl");
      return;
    }
    if (!consentChecked) {
      toast.error("Please consent to crawling before proceeding");
      return;
    }

    setCrawling(true);
    setCrawlProgress(null);
    try {
      const res = await fetch(`${API}/console/crawl/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ urls: urlsToCrawl }),
      });
      const data = await res.json();
      console.log("[crawl] Response:", res.status, data);
      if (!res.ok && res.status !== 202) throw new Error(data.error || "Crawl failed");

      if (data.job_id) {
        setCrawlJobId(data.job_id);
        toast.success(`Crawl started for ${urlsToCrawl.length} URL(s)! Tracking progress...`);
        startCrawlPolling(data.job_id);
      } else {
        setCrawledPages(
          (data.documents || []).map((d) => ({
            id: d.id,
            url: d.url,
            title: d.title,
            words: d.words,
            content_type: d.content_type,
            faqs: d.faqs,
            type: "web",
          }))
        );
        if (data.report) setCrawlReport(data.report);
        setCompletedSteps((prev) => new Set([...prev, 2]));
        toast.success(data.message);
        setCrawling(false);
      }
    } catch (err) {
      toast.error(err.message);
      setCrawling(false);
    }
  };

  // ---------- Step 2: Upload ----------

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExts = [".txt", ".md", ".csv", ".html"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExts.includes(ext)) {
      toast.error("Only .txt, .md, .csv, .html files are allowed");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("File too large (max 3MB)");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/console/upload/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadedFiles((prev) => [
        ...prev,
        { id: data.document_id, name: data.filename, words: data.words },
      ]);
      toast.success(`Uploaded "${data.filename}" (${data.words} words)`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---------- Step 3: API Key ----------
  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter your Gemini API key");
      return;
    }

    setSavingKey(true);
    try {
      const res = await fetch(`${API}/console/api-key/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to validate API key");

      setKeyValidated(true);
      setCompletedSteps((prev) => new Set([...prev, 1]));
      toast.success("API key validated and saved!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  // ---------- Embed polling ----------
  const stopEmbedPolling = useCallback(() => {
    if (embedPollRef.current) {
      clearInterval(embedPollRef.current);
      embedPollRef.current = null;
    }
  }, []);

  const startEmbedPolling = useCallback((jobId) => {
    stopEmbedPolling();
    embedPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/console/embed-status/${jobId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) {
          console.warn("[embed-poll] Non-OK response:", res.status);
          return;
        }
        const data = await res.json();
        console.log("[embed-poll] Received:", data.status, "embedded:", data.embedded, "/", data.total_chunks);
        setEmbedProgress(data);

        if (data.status === "done") {
          stopEmbedPolling();
          setEmbedding(false);
          setPausing(false);
          setEmbedStats({ embedded: data.embedded, total: data.total_chunks });
          setCompletedSteps((prev) => new Set([...prev, 3]));
          toast.success(`Embeddings complete: ${data.embedded} chunks embedded`);
          fetchStatus();
        } else if (data.status === "paused") {
          stopEmbedPolling();
          setEmbedding(false);
          setPausing(false);
          toast.warning(data.error_message || `Embedding paused after ${data.embedded} chunks.`);
          fetchStatus();
        } else if (data.status === "failed") {
          stopEmbedPolling();
          setEmbedding(false);
          setPausing(false);
          toast.error(data.error_message || "Embedding failed");
        }
      } catch (err) {
        console.error("Embed poll error:", err);
      }
    }, 3000);
  }, [getToken, stopEmbedPolling, fetchStatus]);

  // Auto-resume embed polling when embedJobId is set (e.g. after page refresh)
  useEffect(() => {
    if (embedJobId && embedding && !embedPollRef.current) {
      startEmbedPolling(embedJobId);
    }
  }, [embedJobId, embedding, startEmbedPolling]);

  // ---------- Step 3: Embed ----------
  const handleEmbed = async () => {
    setEmbedding(true);
    setEmbedProgress(null);
    setPausing(false);
    try {
      const res = await fetch(`${API}/console/embed/${projectId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const data = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(data.error || "Embedding failed");

      if (data.job_id) {
        setEmbedJobId(data.job_id);
        toast.success("Embedding started! You can pause anytime.");
        startEmbedPolling(data.job_id);
      } else {
        setEmbedStats(data);
        setCompletedSteps((prev) => new Set([...prev, 3]));
        toast.success(data.message);
        setEmbedding(false);
      }
    } catch (err) {
      toast.error(err.message);
      setEmbedding(false);
    }
  };

  const handlePauseEmbed = async () => {
    if (!embedJobId) return;
    setPausing(true);
    try {
      const res = await fetch(`${API}/console/embed-pause/${embedJobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to pause");
      toast.info("Pause signal sent. Job will stop after current chunk.");
    } catch (err) {
      toast.error(err.message);
      setPausing(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-white animate-slide-in-right">
      {/* Top Bar */}
      <header className="bg-transparent sticky top-0 z-50 backdrop-blur-sm border-b border-light-rose">
        <div className="max-w-full px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1.5 text-muted hover:text-charcoal transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
              <span className="text-sm font-medium">Dashboard</span>
            </button>
            <span className="text-light-rose">|</span>
            <h1 className="text-lg font-bold tracking-tight text-charcoal">
              Chat<span className="text-crimson">Craft</span>
            </h1>
          </div>
          {!loading && (
            <div className="text-sm text-muted">
              Setting up <span className="font-semibold text-charcoal">{projectName}</span>
            </div>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <Loader2 size={32} className="text-crimson animate-spin" />
        </div>
      ) : (

      <div className="max-w-6xl mx-auto px-6 py-8 flex gap-8">
        {/* Left: Vertical Stepper -- content below is inside the !loading ternary */}
        <div className="w-72 shrink-0">
          <div className="sticky top-24">
            <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-6">Setup Steps</h3>
            <div className="space-y-1">
              {STEPS.map((step, idx) => {
                const isActive = currentStep === step.id;
                const isComplete = completedSteps.has(step.id);
                const Icon = step.icon;

                return (
                  <div key={step.id}>
                    <button
                      onClick={() => goToStep(step.id)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all duration-200 text-left cursor-pointer
                        ${isActive ? "bg-crimson/5 border border-crimson/20" : "hover:bg-charcoal/3 border border-transparent"}
                      `}
                    >
                      {/* Step indicator */}
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold transition-all duration-200
                          ${isComplete ? "bg-success text-white" : isActive ? "bg-crimson text-white" : "bg-light-rose text-muted"}
                        `}
                      >
                        {isComplete ? <Check size={16} /> : step.id}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold ${isActive ? "text-crimson" : isComplete ? "text-success" : "text-charcoal"}`}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-muted mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </button>

                    {/* Connector line */}
                    {idx < STEPS.length - 1 && (
                      <div className="ml-[22px] w-0.5 h-4 bg-light-rose" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Step Content */}
        <div className="flex-1 min-w-0">
          {/* ========== STEP 1: API Key ========== */}
          {currentStep === 1 && (
            <StepCard
              step={1}
              title="Gemini API Key"
              subtitle="We need your Gemini API key to generate text embeddings. Your key is encrypted with AES-256."
            >
              <div className="space-y-5">
                {/* Info box */}
                <div className="flex items-start gap-3 p-4 rounded-lg border border-light-rose bg-light-rose/20">
                  <Info size={18} className="text-crimson shrink-0 mt-0.5" />
                  <div className="text-sm text-charcoal/80">
                    <p className="font-semibold text-charcoal mb-1">Gemini API key is free!</p>
                    <p>
                      Get your free API key from{" "}
                      <a
                        href="https://aistudio.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-crimson font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        Google AI Studio <ExternalLink size={12} />
                      </a>
                      . The key will be encrypted and stored securely.
                    </p>
                  </div>
                </div>

                {/* Key input */}
                {keyValidated ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                    <CheckCircle2 size={20} className="text-success" />
                    <div>
                      <p className="text-sm font-semibold text-charcoal">API Key Validated & Saved</p>
                      <p className="text-xs text-muted">Your key is encrypted and stored securely.</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                                 placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition font-mono"
                    />
                  </div>
                )}

                {/* Save button */}
                {!keyValidated && (
                  <button
                    onClick={handleSaveKey}
                    disabled={savingKey || !apiKey.trim()}
                    className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingKey ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Validating & Saving...
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        Validate & Save Key
                      </>
                    )}
                  </button>
                )}

                {keyValidated && (
                  <button
                    onClick={() => goToStep(2)}
                    className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    Proceed to Step 2
                  </button>
                )}
              </div>
            </StepCard>
          )}

          {/* ========== STEP 2: Crawl ========== */}
          {currentStep === 2 && (
            <StepCard
              step={2}
              title="Crawl Your Website"
              subtitle="Enter your main domain to discover subdomains, then select which ones to crawl."
            >
              <div className="space-y-5">
                {/* Domain Input */}
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Main Domain</label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        placeholder="shopify.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                                   placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                        onKeyDown={(e) => e.key === "Enter" && !discovering && handleDiscoverSubdomains()}
                      />
                    </div>
                    <button
                      onClick={handleDiscoverSubdomains}
                      disabled={discovering || !domainInput.trim()}
                      className="flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-lg font-semibold text-sm
                                 hover:bg-charcoal/80 transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {discovering ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Discovering...
                        </>
                      ) : (
                        <>
                          <Search size={16} />
                          Discover
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted mt-1.5">
                    Enter only the main domain (e.g., <span className="font-medium">shopify.com</span>). We'll automatically discover all subdomains.
                  </p>
                </div>

                {/* Subdomain Discovery Results */}
                {subdomainResults && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className="text-emerald-600" />
                        <h4 className="text-sm font-bold text-charcoal">
                          {subdomainResults.subdomains?.filter((s) => s.is_live).length} Live Subdomains Found
                        </h4>
                        <span className="text-xs text-muted">
                          ({subdomainResults.subdomains?.length} total discovered)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const allLive = subdomainResults.subdomains?.filter((s) => s.is_live).map((s) => s.subdomain) || [];
                            setSelectedSubdomains(new Set(allLive));
                          }}
                          className="text-xs text-crimson hover:text-rose-pink font-medium cursor-pointer"
                        >
                          Select All Live
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setSelectedSubdomains(new Set())}
                          className="text-xs text-muted hover:text-charcoal font-medium cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Recommended (High Priority) */}
                    {(() => {
                      const highItems = subdomainResults.subdomains?.filter((s) => s.is_live && s.priority === "high") || [];
                      if (highItems.length === 0) return null;
                      return (
                        <div>
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Star size={12} />
                            Recommended ({highItems.length})
                          </p>
                          <div className="space-y-1.5">
                            {highItems.map((s) => (
                              <SubdomainRow
                                key={s.subdomain}
                                subdomain={s}
                                selected={selectedSubdomains.has(s.subdomain)}
                                onToggle={() => toggleSubdomain(s.subdomain)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Medium Priority */}
                    {(() => {
                      const medItems = subdomainResults.subdomains?.filter((s) => s.is_live && s.priority === "medium") || [];
                      if (medItems.length === 0) return null;
                      return (
                        <div>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                            Other Live ({medItems.length})
                          </p>
                          <div className="space-y-1.5">
                            {medItems.map((s) => (
                              <SubdomainRow
                                key={s.subdomain}
                                subdomain={s}
                                selected={selectedSubdomains.has(s.subdomain)}
                                onToggle={() => toggleSubdomain(s.subdomain)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Low Priority (collapsed) */}
                    {(() => {
                      const lowItems = subdomainResults.subdomains?.filter(
                        (s) => s.is_live && s.priority === "low"
                      ) || [];
                      const deadItems = subdomainResults.subdomains?.filter((s) => !s.is_live) || [];
                      if (lowItems.length === 0 && deadItems.length === 0) return null;
                      return (
                        <div>
                          <button
                            onClick={() => setShowLowPriority(!showLowPriority)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 cursor-pointer hover:text-gray-600"
                          >
                            {showLowPriority ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            Low Priority & Inactive ({lowItems.length + deadItems.length})
                          </button>
                          {showLowPriority && (
                            <div className="space-y-1.5">
                              {lowItems.map((s) => (
                                <SubdomainRow
                                  key={s.subdomain}
                                  subdomain={s}
                                  selected={selectedSubdomains.has(s.subdomain)}
                                  onToggle={() => toggleSubdomain(s.subdomain)}
                                />
                              ))}
                              {deadItems.map((s) => (
                                <SubdomainRow
                                  key={s.subdomain}
                                  subdomain={s}
                                  selected={false}
                                  onToggle={() => {}}
                                  disabled
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Selection Summary */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-crimson/5 border border-crimson/20">
                      <Info size={14} className="text-crimson shrink-0" />
                      <p className="text-xs text-charcoal">
                        <span className="font-bold text-crimson">{selectedSubdomains.size}</span> subdomain{selectedSubdomains.size !== 1 ? "s" : ""} selected for crawling.
                        Each will be crawled for all its pages.
                      </p>
                    </div>
                  </div>
                )}

                {/* Consent Checkbox */}
                {(subdomainResults || domainInput.trim()) && (
                  <label className="flex items-start gap-3 p-4 rounded-lg border border-light-rose bg-light-rose/20 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-crimson focus:ring-crimson accent-crimson"
                    />
                    <div className="text-sm text-charcoal/80 leading-relaxed">
                      <span className="font-semibold text-charcoal">I consent</span> to ChatCraft accessing and
                      crawling my website content. The extracted text will be stored securely in our database and used
                      solely for training this chatbot's knowledge base. No data will be shared with third parties.
                    </div>
                  </label>
                )}

                {/* Crawl Button */}
                {(subdomainResults ? selectedSubdomains.size > 0 : domainInput.trim()) && (
                  <button
                    onClick={handleCrawl}
                    disabled={crawling || !consentChecked || (subdomainResults && selectedSubdomains.size === 0)}
                    className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {crawling ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Crawling {selectedSubdomains.size} subdomain{selectedSubdomains.size !== 1 ? "s" : ""}...
                      </>
                    ) : (
                      <>
                        <Globe size={16} />
                        Start Crawling ({selectedSubdomains.size || 1} URL{(selectedSubdomains.size || 1) !== 1 ? "s" : ""})
                      </>
                    )}
                  </button>
                )}

                {/* ===== Crawl: Waiting for first poll ===== */}
                {crawling && !crawlProgress && (
                  <div className="mt-4 p-5 rounded-xl border border-light-rose bg-white animate-fade-in">
                    <div className="flex items-center gap-3">
                      <Loader2 size={18} className="text-crimson animate-spin" />
                      <div>
                        <p className="text-sm font-bold text-charcoal">Initializing crawl job...</p>
                        <p className="text-xs text-muted">Waiting for progress data from the server...</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===== Crawl Progress Panel ===== */}
                {crawling && crawlProgress && (
                  <div className="mt-4 p-5 rounded-xl border border-light-rose bg-white space-y-4 animate-fade-in">
                    {/* Phase indicator */}
                    <div className="flex items-center gap-3">
                      <Activity size={18} className="text-crimson animate-pulse" />
                      <div>
                        <p className="text-sm font-bold text-charcoal">
                          {crawlProgress.current_phase === "crawling" && "Finding pages..."}
                          {crawlProgress.current_phase === "comparing" && "Comparing with existing data..."}
                          {crawlProgress.current_phase === "processing" && "Processing & storing pages..."}
                          {crawlProgress.current_phase === "chunking" && "Auto-chunking pages into smaller pieces..."}
                          {crawlProgress.current_phase === "failed" && "Crawl failed"}
                          {(!crawlProgress.current_phase || crawlProgress.current_phase === "") && "Starting crawl..."}
                        </p>
                        <p className="text-xs text-muted">Job ID: {crawlProgress.id?.slice(0, 8)}...</p>
                      </div>
                    </div>

                    {/* During crawling phase: show page counter instead of progress bar */}
                    {crawlProgress.current_phase === "crawling" && (
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-crimson/5 border border-crimson/15">
                        <div className="flex items-center gap-2">
                          <Globe size={16} className="text-crimson animate-pulse" />
                          <span className="text-lg font-bold text-crimson">{crawlProgress.crawled_urls || 0}</span>
                          <span className="text-sm text-charcoal/70">Pages Found & Crawled</span>
                        </div>
                        {crawlProgress.skipped_urls > 0 && (
                          <span className="text-xs text-muted">({crawlProgress.skipped_urls} skipped)</span>
                        )}
                      </div>
                    )}

                    {/* After crawling phase: show progress bar for comparing/processing/chunking */}
                    {crawlProgress.current_phase !== "crawling" && crawlProgress.total_urls > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-charcoal">
                            Progress: {crawlProgress.crawled_urls + crawlProgress.skipped_urls} / {crawlProgress.total_urls} URLs
                          </span>
                          <span className="text-xs text-muted">
                            {Math.round(((crawlProgress.crawled_urls + crawlProgress.skipped_urls) / crawlProgress.total_urls) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-light-rose rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-crimson to-rose-pink rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, ((crawlProgress.crawled_urls + crawlProgress.skipped_urls) / crawlProgress.total_urls) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stats grid — only show after discovery is done */}
                    {crawlProgress.current_phase !== "crawling" && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <MiniStat label="Total URLs" value={crawlProgress.total_urls} />
                        <MiniStat label="New/Updated" value={crawlProgress.crawled_urls} color="text-success" />
                        <MiniStat label="Skipped" value={crawlProgress.skipped_urls} color="text-muted" />
                        <MiniStat label="Chunks" value={crawlProgress.chunks_created} color="text-crimson" />
                      </div>
                    )}

                    {/* Live log */}
                    {crawlProgress.recent_logs && crawlProgress.recent_logs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Live Activity</p>
                        <div className="max-h-48 overflow-y-auto rounded-lg bg-charcoal/[0.03] border border-light-rose p-2 space-y-0.5 font-mono text-[11px]">
                          {crawlProgress.recent_logs
                            .slice()
                            .reverse()
                            .slice(0, 20)
                            .map((entry, i) => (
                              <div key={i} className="text-charcoal/70 leading-relaxed truncate">
                                {entry.msg}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Crawl DONE summary */}
                {!crawling && crawlProgress && crawlProgress.status === "done" && (
                  <div className="mt-4 p-5 rounded-xl border border-success/30 bg-success/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-success" />
                      <h4 className="text-sm font-bold text-charcoal">Crawl Complete!</h4>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <MiniStat label="Pages Stored" value={crawlProgress.crawled_urls} color="text-success" />
                      <MiniStat label="Unchanged" value={crawlProgress.skipped_urls} color="text-muted" />
                      <MiniStat label="Total URLs" value={crawlProgress.total_urls} />
                      <MiniStat label="Chunks Created" value={crawlProgress.chunks_created} color="text-crimson" />
                    </div>
                    {crawlProgress.recent_logs && crawlProgress.recent_logs.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted hover:text-charcoal font-medium">Show crawl log</summary>
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-charcoal/[0.03] border border-light-rose p-2 space-y-0.5 font-mono text-[11px]">
                          {crawlProgress.recent_logs
                            .slice()
                            .reverse()
                            .map((entry, i) => (
                              <div key={i} className="text-charcoal/70 leading-relaxed truncate">
                                {entry.msg}
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Crawl Quality Report (legacy / sync result) */}
                {crawlReport && (
                  <div className="mt-4 p-5 rounded-xl border border-light-rose bg-white">
                    <h4 className="text-sm font-bold text-charcoal mb-3">Crawl Quality Report</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <ReportStat label="Pages Crawled" value={crawlReport.pages_crawled} color="text-success" />
                      <ReportStat label="Total Words" value={crawlReport.total_words?.toLocaleString()} color="text-success" />
                      <ReportStat label="FAQs Detected" value={crawlReport.faqs_detected} color="text-crimson" />
                      <ReportStat label="Avg Words/Page" value={crawlReport.avg_words_per_page} color="text-charcoal" />
                      {crawlReport.thin_content_skipped > 0 && (
                        <ReportStat label="Thin Content Skipped" value={crawlReport.thin_content_skipped} color="text-warning" />
                      )}
                      {crawlReport.robotstxt_blocked > 0 && (
                        <ReportStat label="Robots.txt Blocked" value={crawlReport.robotstxt_blocked} color="text-warning" />
                      )}
                      {crawlReport.duplicates_skipped > 0 && (
                        <ReportStat label="Duplicates Skipped" value={crawlReport.duplicates_skipped} color="text-muted" />
                      )}
                    </div>
                    <p className="text-xs text-muted mt-3">
                      Crawled in {crawlReport.crawl_duration_secs?.toFixed(1)}s
                      {crawlReport.js_rendered && (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                          JS Rendered
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Crawled Pages Results (from fetchStatus on reload) */}
                {!crawling && !crawlProgress && crawledPages.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 size={16} className="text-success" />
                      <h4 className="text-sm font-bold text-charcoal">
                        {crawledPages.filter((p) => p.type === "web").length} Pages Crawled
                      </h4>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {crawledPages
                        .filter((p) => p.type === "web")
                        .map((page, i) => (
                          <div
                            key={page.id || i}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-soft-white border border-light-rose text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-charcoal truncate">{page.title || page.url}</p>
                                {page.content_type && page.content_type !== "general" && (
                                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0
                                    ${page.content_type === "faq" ? "bg-crimson/10 text-crimson" :
                                      page.content_type === "article" ? "bg-blue-100 text-blue-600" :
                                      "bg-amber-100 text-amber-600"}`}
                                  >
                                    {page.content_type}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted truncate">{page.url}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {page.faqs > 0 && (
                                <span className="text-xs text-crimson font-medium">{page.faqs} FAQ{page.faqs > 1 ? "s" : ""}</span>
                              )}
                              {page.words && (
                                <span className="text-xs text-muted">{page.words} words</span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                    <button
                      onClick={() => goToStep(3)}
                      className="mt-4 flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                                 hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm"
                    >
                      Proceed to Step 3
                    </button>
                  </div>
                )}
                {/* Upload Additional Files Section */}
                <div className="p-5 rounded-xl border border-light-rose bg-white">
                  <h4 className="text-sm font-bold text-charcoal mb-2">Upload Additional Files</h4>
                  <p className="text-xs text-muted mb-4">
                    Upload custom data files to enrich your chatbot's knowledge. Files are automatically chunked for best results.
                    Supported formats: <span className="font-semibold">.txt, .md, .csv, .html</span> (max 3MB each)
                  </p>

                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.csv,.html"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 border border-crimson text-crimson px-5 py-2 rounded-lg font-semibold text-sm
                                 hover:bg-crimson/5 transition-all duration-200 cursor-pointer disabled:opacity-50"
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Upload File
                        </>
                      )}
                    </button>
                  </div>

                  {/* Uploaded files list */}
                  {uploadedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {uploadedFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-soft-white border border-light-rose text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-crimson" />
                            <span className="font-medium text-charcoal">{file.name}</span>
                          </div>
                          <span className="text-xs text-muted">{file.words} words</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Proceed to Embed */}
                {(completedSteps.has(2) || crawledPages.length > 0 || uploadedFiles.length > 0) && !crawling && (
                  <button
                    onClick={() => goToStep(3)}
                    className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    Proceed to Step 3
                  </button>
                )}
              </div>
            </StepCard>
          )}

          {/* ========== STEP 3: Embed ========== */}
          {currentStep === 3 && (
            <StepCard
              step={3}
              title="Generate Embeddings"
              subtitle="Convert all text chunks into 768-dimensional vectors using Gemini Embedding API. This powers semantic search."
            >
              <div className="space-y-5">
                {/* Explanation */}
                <div className="p-4 rounded-lg border border-light-rose bg-white">
                  <h4 className="text-sm font-bold text-charcoal mb-2">How Embeddings Work</h4>
                  <p className="text-xs text-muted leading-relaxed">
                    Each text chunk is sent to the <span className="font-semibold">gemini-embedding-001</span> model,
                    which returns a 768-dimensional vector like{" "}
                    <code className="bg-light-rose px-1.5 py-0.5 rounded text-xs font-mono">[0.023, -0.841, 0.156, ..., 0.492]</code>.
                    Vectors capture the <em>meaning</em> of text — similar meanings produce similar vectors.
                    When a user asks a question, we embed it and find the closest matching chunks.
                  </p>
                </div>

                {/* Stats */}
                {statusData && (
                  <div className="grid grid-cols-4 gap-4">
                    <StatBox label="Documents" value={statusData.document_count} />
                    <StatBox label="Chunks" value={statusData.chunk_count} />
                    <StatBox label="Embedded" value={statusData.embedded_count} />
                    <StatBox label="Pending" value={statusData.pending_chunks ?? (statusData.chunk_count - statusData.embedded_count)} />
                  </div>
                )}

                {/* Embed result — all done */}
                {embedStats ? (
                  <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={20} className="text-success" />
                      <p className="text-sm font-semibold text-charcoal">Embeddings Complete!</p>
                    </div>
                    <p className="text-xs text-muted">
                      Successfully embedded {embedStats.embedded}/{embedStats.total} chunks.
                      Your chatbot's knowledge base is ready.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Embed Plan — show before embedding starts */}
                    {!embedding && embedPlan && embedPlan.pending_chunks > 0 && (
                      <div className="p-5 rounded-xl border border-light-rose bg-white space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar size={16} className="text-crimson" />
                          <h4 className="text-sm font-bold text-charcoal">Embedding Plan</h4>
                          <div className="relative group">
                            <button
                              type="button"
                              className="w-5 h-5 rounded-full border border-light-rose text-muted flex items-center justify-center hover:bg-light-rose/40 transition-colors"
                              aria-label="How plan is calculated"
                            >
                              <Info size={12} />
                            </button>
                            <div className="absolute left-6 top-0 z-20 hidden group-hover:block w-72 p-3 rounded-lg bg-charcoal text-white text-xs leading-relaxed shadow-lg">
                              Plan is estimated using Gemini free-tier assumptions.
                              <br />
                              Formula: today chunks = min(pending, RPD limit), estimated minutes = (today chunks x 0.65s) / 60.
                              <br />
                              Values: RPM {embedPlan.rpm_limit}, RPD {embedPlan.rpd_limit}.
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 rounded-lg bg-crimson/5 border border-crimson/15 text-center">
                            <p className="text-lg font-bold text-crimson">{embedPlan.pending_chunks}</p>
                            <p className="text-[10px] text-muted">Total Pending</p>
                          </div>
                          <div className="p-3 rounded-lg bg-success/5 border border-success/15 text-center">
                            <p className="text-lg font-bold text-success">{embedPlan.today_chunks}</p>
                            <p className="text-[10px] text-muted">Today's Batch</p>
                          </div>
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                            <p className="text-lg font-bold text-amber-600">{embedPlan.tomorrow_chunks}</p>
                            <p className="text-[10px] text-muted">Tomorrow+</p>
                          </div>
                          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                            <p className="text-lg font-bold text-blue-600">~{embedPlan.estimated_time_minutes} min</p>
                            <p className="text-[10px] text-muted">Est. Today</p>
                          </div>
                        </div>
                        {embedPlan.total_days > 1 && (
                          <div className="text-xs text-muted">
                            Estimated completion window: <span className="font-semibold text-charcoal">{embedPlan.total_days} day(s)</span>
                          </div>
                        )}

                        <button
                          onClick={handleEmbed}
                          disabled={embedding}
                          className="w-full flex items-center justify-center gap-2 bg-crimson text-white px-4 py-2.5 rounded-lg font-semibold text-sm
                                     hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <Play size={16} />
                          Start Embedding
                        </button>
                      </div>
                    )}

                    {/* No pending chunks but also not complete */}
                    {!embedding && embedPlan && embedPlan.pending_chunks === 0 && statusData?.embedded_count > 0 && (
                      <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 size={20} className="text-success" />
                          <p className="text-sm font-semibold text-charcoal">All chunks are embedded!</p>
                        </div>
                        <p className="text-xs text-muted">
                          {statusData.embedded_count} chunks embedded. Your chatbot is ready.
                        </p>
                      </div>
                    )}

                    {/* Embed progress — active job */}
                    {embedding && (
                      <div className="p-5 rounded-xl border border-light-rose bg-white space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Zap size={18} className="text-crimson animate-pulse" />
                            <div>
                              <p className="text-sm font-bold text-charcoal">
                                Embedding chunks with Gemini API...
                              </p>
                              {embedProgress && (
                                <p className="text-xs text-muted">
                                  {embedProgress.embedded} / {embedProgress.total_chunks} chunks embedded
                                  {embedProgress.failed > 0 && (
                                    <span className="text-crimson ml-2">({embedProgress.failed} failed)</span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Pause button */}
                          <button
                            onClick={handlePauseEmbed}
                            disabled={pausing}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold
                                       hover:bg-amber-100 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {pausing ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Pausing...
                              </>
                            ) : (
                              <>
                                <Pause size={14} />
                                Pause
                              </>
                            )}
                          </button>
                        </div>

                        {/* Progress bar */}
                        {embedProgress && embedProgress.total_chunks > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-medium text-charcoal">
                                Progress: {embedProgress.embedded} / {embedProgress.total_chunks}
                              </span>
                              <span className="text-xs text-muted">
                                {Math.round((embedProgress.embedded / embedProgress.total_chunks) * 100)}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-light-rose rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-crimson to-rose-pink rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, (embedProgress.embedded / embedProgress.total_chunks) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Embedding info during embedding */}
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Clock size={12} />
                          <span>Progress updates every 10s</span>
                        </div>
                      </div>
                    )}

                    {/* Paused state — show resume option */}
                    {!embedding && embedProgress?.status === "paused" && (
                      <div className="p-5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                        <div className="flex items-center gap-2">
                          <Pause size={18} className="text-amber-600" />
                          <div>
                            <p className="text-sm font-bold text-charcoal">Embedding Paused</p>
                            <p className="text-xs text-muted">{embedProgress.error_message}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>{embedProgress.embedded} / {embedProgress.total_chunks} chunks embedded so far</span>
                        </div>
                        <button
                          onClick={handleEmbed}
                          disabled={embedding}
                          className="flex items-center gap-2 bg-crimson text-white px-5 py-2 rounded-lg font-semibold text-sm
                                     hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <Play size={14} />
                          Resume Embedding
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Go to Dashboard */}
                {embedStats && (
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="flex items-center gap-2 bg-success text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-success/80 transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    <Check size={16} />
                    Setup Complete — Go to Dashboard
                  </button>
                )}
              </div>
            </StepCard>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function StepCard({ step, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-light-rose shadow-sm overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-crimson via-rose-pink to-dusty-rose" />
      <div className="p-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-bold text-crimson uppercase tracking-wider">Step {step}</span>
        </div>
        <h2 className="text-xl font-bold text-charcoal mb-1">{title}</h2>
        <p className="text-sm text-muted mb-6">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="p-4 rounded-xl border border-light-rose bg-soft-white text-center">
      <p className="text-2xl font-bold text-charcoal">{value ?? 0}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function ReportStat({ label, value, color = "text-charcoal" }) {
  return (
    <div className="p-3 rounded-lg border border-light-rose bg-soft-white text-center">
      <p className={`text-lg font-bold ${color}`}>{value ?? 0}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, color = "text-charcoal" }) {
  return (
    <div className="p-2 rounded-lg border border-light-rose bg-soft-white text-center">
      <p className={`text-base font-bold ${color}`}>{value ?? 0}</p>
      <p className="text-[10px] text-muted mt-0.5">{label}</p>
    </div>
  );
}

function SubdomainRow({ subdomain, selected, onToggle, disabled = false }) {
  const priorityColors = {
    high: "bg-emerald-50 border-emerald-200 text-emerald-700",
    medium: "bg-blue-50 border-blue-200 text-blue-600",
    low: "bg-gray-50 border-gray-200 text-gray-500",
  };
  const priorityBadge = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-blue-100 text-blue-600",
    low: "bg-gray-100 text-gray-500",
  };

  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer select-none
        ${disabled ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200" :
          selected ? "bg-crimson/5 border-crimson/30" : "bg-soft-white border-light-rose hover:border-crimson/20"}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-crimson focus:ring-crimson accent-crimson shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-charcoal truncate">{subdomain.subdomain}</span>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${priorityBadge[subdomain.priority] || priorityBadge.medium}`}>
            {subdomain.category}
          </span>
          {!subdomain.is_live && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
              Offline
            </span>
          )}
        </div>
      </div>
      {subdomain.recommended && (
        <span className="text-[10px] font-semibold text-emerald-600 shrink-0">Recommended</span>
      )}
    </label>
  );
}
