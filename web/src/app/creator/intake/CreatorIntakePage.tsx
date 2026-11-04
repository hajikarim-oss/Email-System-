import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  MapPin,
  Sparkles,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Pencil,
} from "lucide-react";

interface CreatorProfileData {
  id: string;
  handle: string;
  fullName: string | null;
  avatarUrl?: string | null;
  primaryEmail?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  category?: string | null;
  subGenres?: string[] | null;
  Macro_Vertical?: string | null;
  Micro_Niche?: string | null;
  followersCount?: number | string | null;
  followersRaw?: string | null;
  followerCount?: number | null;
  tier: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  shippingAddress?: string | null;
  address?: string | null;
  languages: string[];
  contentDescription: string | null;
  publicBio: string | null;
  commercialRates?: { reelRate?: string } | null;
  rateRange?: string | null;
  managementType?: string | null;
  agencyName?: string | null;
  intakeCompletionPct?: number;
  profileCompletionPct?: number;
  intakeStatus: string;
}

const LANGUAGE_OPTIONS: { label: string; hot?: boolean; primary?: boolean }[] = [
  { label: "Hindi", hot: true, primary: true },
  { label: "English", hot: true, primary: true },
  { label: "Hinglish", hot: true, primary: true },
  { label: "Marathi", primary: true },
  { label: "Tamil", primary: true },
  { label: "Telugu", primary: true },
  { label: "Bengali", primary: true },
  { label: "Kannada" },
  { label: "Gujarati" },
  { label: "Punjabi" },
  { label: "Malayalam" },
];

const GENRE_OPTIONS: { label: string; hot?: boolean; primary?: boolean }[] = [
  { label: "Lifestyle & Vlogs", hot: true, primary: true },
  { label: "Beauty & Skincare", hot: true, primary: true },
  { label: "Fashion & Styling", hot: true, primary: true },
  { label: "Tech & Gadgets", hot: true, primary: true },
  { label: "Comedy & Skits", hot: true, primary: true },
  { label: "Education", hot: true, primary: true },
  { label: "Fitness & Health", hot: true, primary: true },
  { label: "Finance & Business", hot: true, primary: true },
  { label: "Home & Living" },
  { label: "Food & Culinary" },
  { label: "Travel" },
  { label: "Parenting" },
  { label: "Automobile" },
  { label: "Gaming" },
  { label: "Motivation & Podcasts" },
];

const MARQUEE_ROW_1 = [
  { name: "ATOMBERG", logo: "/brands/atomberg-logo-new.png" },
  { name: "ZOFF SPICES", logo: "/brands/zoff-logo-white.png" },
  { name: "BLUE TYGA", logo: "/brands/bluetyga-logo-white.png" },
  { name: "BEATXP", logo: "/brands/beatxp-logo-white.png" },
  { name: "VIBHOR", logo: "/brands/vibhor-logo-new.png" },
  { name: "BIOPEAK", logo: "/brands/biopeak-logo-white.svg" },
  { name: "HAPPI PLANET", logo: "/brands/happi-planet-brand-color.png" },
  { name: "CHEQ", logo: "/brands/cheq-logo-white.png" },
];

const MARQUEE_ROW_2 = [
  { name: "SETU", logo: "/brands/setu-white.png" },
  { name: "PILGRIM", logo: "/brands/pilgrim-logo-white.png" },
  { name: "EAT ANYTIME", logo: "/brands/eatanytime-logo-white.png" },
  { name: "WAKEFIT", logo: "/brands/wakefit-logo-white.png" },
  { name: "TOOTHSI", logo: "/brands/toothsi-logo-white.png" },
  { name: "RENTOMOJO", logo: "/brands/rentomojo-logo-white.png" },
  { name: "RE'EQUIL", logo: "/brands/reequil-logo-white.png" },
  { name: "ONECARD", logo: "/brands/onecard-logo-white.png" },
];

const FLOWING_BG_ROWS = [
  MARQUEE_ROW_1.map((b) => b.logo),
  MARQUEE_ROW_2.map((b) => b.logo),
  [...MARQUEE_ROW_1.slice(0, 4), ...MARQUEE_ROW_2.slice(0, 4)].map(
    (b) => b.logo
  ),
];

function cleanCreatorName(raw: string | null | undefined, fallbackHandle: string): string {
  if (!raw || !raw.trim()) return fallbackHandle;
  // Strip noisy bio suffixes like "Vanshika Nigam | Content Creator" -> "Vanshika Nigam"
  const cleaned = raw
    .split(/[|•]/)[0]
    .replace(/\s+-\s+.*$/, "")
    .trim();
  return cleaned || raw.trim();
}

function formatFollowers(
  n: number | string | null | undefined,
  raw?: string | null
) {
  if (raw && raw.trim()) return raw.trim();
  const num = typeof n === "string" ? parseInt(n, 10) : n || 0;
  if (!num || isNaN(num)) return "Verified";
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(num);
}

function isScrapedCaption(text: string | null | undefined): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("likes,") ||
    lower.includes("comments -") ||
    lower.includes("comments –") ||
    /^\d+[km]?\s+likes/i.test(text.trim())
  );
}

const INPUT_CLASS =
  "w-full h-11 rounded-xl border border-stone-200 bg-white px-3.5 text-[14px] font-medium text-[#1D1D1F] placeholder:text-stone-400 outline-none transition-all duration-200 focus:border-[#E58A3B] focus:ring-4 focus:ring-[#E58A3B]/15";

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 16 : -16 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -16 : 16 }),
};

function InstagramIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="url(#ig-grad)"
      />
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="3.8"
        stroke="white"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3.3" stroke="white" strokeWidth="1.7" />
      <circle cx="16.2" cy="7.8" r="1" fill="white" />
    </svg>
  );
}

/* ── Live Instagram Profile Avatar with Story Ring & Fallback ── */
function CreatorAvatar({
  token,
  name,
  size = "md",
}: {
  token?: string;
  name: string;
  size?: "sm" | "md";
}) {
  const [imgError, setImgError] = useState(false);
  const dim = size === "sm" ? "size-9" : "size-12";
  const badgeDim = size === "sm" ? "size-3" : "size-3.5";
  const initial = (name.replace(/^@/, "")[0] || "C").toUpperCase();

  return (
    <div className="relative shrink-0">
      <div
        className={`${dim} rounded-full p-[2px] bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] shadow-xs`}
      >
        <div className="size-full rounded-full bg-[#1D1D1F] text-[#F7C636] flex items-center justify-center font-extrabold text-sm border-2 border-white overflow-hidden">
          {token && !imgError ? (
            <img
              src={`/api/creator/intake/${token}/avatar`}
              alt={name}
              onError={() => setImgError(true)}
              className="size-full object-cover"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[1.5px] shadow-xs">
        <InstagramIcon className={badgeDim} />
      </span>
    </div>
  );
}

function ReadinessRing({ pct }: { pct: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[48px] shrink-0">
      <svg viewBox="0 0 48 48" className="size-[48px] -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={r}
          stroke="#F3EFE6"
          strokeWidth="4.5"
          fill="none"
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          stroke="#E58A3B"
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-[#1D1D1F] tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Left Showcase Pane — Matches https://www.theboredmonkey.com/ Palette & Typography
   ═══════════════════════════════════════════════════════════════════════════ */
const SLIDE_MS = 5200;

function TBMShowcase({
  token,
  creatorName,
  handle,
  followersLabel,
  city,
  pincode,
  managementType,
  agencyName,
  languages,
  selectedGenres,
  matchProgress,
  matchedBrandCount,
}: {
  token?: string;
  creatorName: string;
  handle: string;
  followersLabel: string;
  city: string;
  pincode: string;
  managementType: "SELF" | "AGENCY";
  agencyName: string;
  languages: string[];
  selectedGenres: string[];
  matchProgress: number;
  matchedBrandCount: number;
}) {
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((p) => (p + 1) % 2);
      setTick((t) => t + 1);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const goToSlide = (k: number) => {
    setIdx(k);
    setTick((t) => t + 1);
  };

  return (
    <div
      className="relative flex h-full flex-col justify-between overflow-hidden p-7 lg:p-8 select-none"
      style={{
        background:
          "radial-gradient(circle at 85% 12%, #FFF3D1 0%, #FFFDF8 52%, #FAF6EE 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-12 -right-12 size-56 rounded-full opacity-45 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, #F7C636 0%, rgba(229,138,59,0.15) 65%, transparent 100%)",
        }}
      />

      {/* Top Row: Official Logo + Creator Invite Badge */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <a
          href="https://www.theboredmonkey.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center"
        >
          <img
            src="/theboredmonkey-logo.png"
            alt="TheBoredMonkey"
            className="h-7 w-auto object-contain"
          />
        </a>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F7C636] px-3 py-1 text-[11px] font-bold text-[#1D1D1F] shadow-2xs">
          <span className="size-1.5 rounded-full bg-[#1D1D1F]" />
          Creator Invite
        </span>
      </div>

      {/* Center: Exact Typography & Colors from https://www.theboredmonkey.com/ */}
      <div className="relative z-10 my-auto py-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#EED279] bg-[#FFFDF5] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#B8621B] mb-3">
          <Sparkles className="size-3 text-[#E58A3B]" />
          We have a collaboration waiting for you
        </div>

        <h2 className="text-[28px] lg:text-[31px] font-extrabold tracking-[-0.03em] text-[#1D1D1F] leading-[1.12]">
          We Think Like
          <br />
          <span className="bg-gradient-to-r from-[#EE7828] via-[#F49E32] to-[#F7C242] bg-clip-text text-transparent">
            Consultants.
          </span>
          <br />
          We Execute Like
          <br />
          <span className="bg-gradient-to-r from-[#EE7828] via-[#F49E32] to-[#F7C242] bg-clip-text text-transparent">
            Creators.
          </span>
        </h2>

        <p className="mt-2.5 text-[12.5px] leading-relaxed text-stone-600">
          We connect verified creators with India’s leading consumer brands.
          Confirm your niche, language & location so we can share your profile
          for upcoming campaigns.
        </p>

        {/* Fixed-Height Showcase Card Container (180px) */}
        <div className="mt-4 h-[180px] relative">
          <AnimatePresence mode="wait">
            {idx === 0 ? (
              <motion.div
                key="card-creator"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24 }}
                className="h-full w-full rounded-2xl border border-stone-200/90 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(29,29,31,0.08)] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                    Verified Creator Profile
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                    <CheckCircle2 className="size-3.5" /> {matchedBrandCount}+
                    Brand Matches
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <CreatorAvatar token={token} name={creatorName} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15.5px] font-extrabold text-[#1D1D1F] truncate">
                        {creatorName}
                      </span>
                      <CheckCircle2 className="size-3.5 text-sky-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] text-stone-500 mt-0.5">
                      <a
                        href={`https://instagram.com/${handle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-[#E58A3B] hover:underline truncate"
                      >
                        @{handle}
                      </a>
                      <span>•</span>
                      <span className="font-bold text-[#1D1D1F] shrink-0">
                        {followersLabel} Followers
                      </span>
                    </div>
                  </div>
                  <ReadinessRing pct={matchProgress} />
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-stone-100 text-[11px]">
                  <div className="rounded-lg bg-[#FAF8F5] px-2.5 py-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-stone-400 block">
                      Location
                    </span>
                    <span className="font-bold text-[#1D1D1F] truncate block">
                      {city || (pincode ? `PIN ${pincode}` : "Add PIN")}
                    </span>
                  </div>
                  <div className="rounded-lg bg-[#FAF8F5] px-2.5 py-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-stone-400 block">
                      Language
                    </span>
                    <span className="font-bold text-[#1D1D1F] truncate block">
                      {languages.slice(0, 2).join(", ") || "Select"}
                    </span>
                  </div>
                  <div className="rounded-lg bg-[#FAF8F5] px-2.5 py-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-stone-400 block">
                      Niche
                    </span>
                    <span className="font-bold text-[#E58A3B] truncate block">
                      {selectedGenres[0] || "Select"}
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="card-brands"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24 }}
                className="h-full w-full rounded-2xl border border-stone-900/15 bg-[#08080B] p-4 shadow-[0_16px_36px_-12px_rgba(8,8,11,0.45)] flex flex-col justify-between overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
                    Trusted by Market Leaders
                  </span>
                  <span className="text-[11px] font-bold text-[#F7C636]">
                    {managementType === "AGENCY" && agencyName
                      ? `Via ${agencyName}`
                      : "40+ Partner Brands"}
                  </span>
                </div>

                <div
                  className="flex flex-col gap-2 my-auto -mx-2"
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
                    maskImage:
                      "linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
                  }}
                >
                  <div className="flex overflow-hidden w-full select-none">
                    <div className="tbm-silk-left flex items-center gap-2">
                      {[...MARQUEE_ROW_1, ...MARQUEE_ROW_1].map((b, i) => (
                        <div
                          key={`r1-${i}`}
                          className="h-11 min-w-[112px] px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0"
                        >
                          <img
                            src={b.logo}
                            alt={b.name}
                            className="max-h-5 max-w-[82px] w-auto h-auto object-contain opacity-95"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex overflow-hidden w-full select-none">
                    <div className="tbm-silk-right flex items-center gap-2">
                      {[...MARQUEE_ROW_2, ...MARQUEE_ROW_2].map((b, i) => (
                        <div
                          key={`r2-${i}`}
                          className="h-11 min-w-[112px] px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0"
                        >
                          <img
                            src={b.logo}
                            alt={b.name}
                            className="max-h-5 max-w-[82px] w-auto h-auto object-contain opacity-95"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Progress Indicators */}
      <div className="relative z-10 space-y-2.5">
        <div className="flex items-center gap-2">
          {[0, 1].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => goToSlide(k)}
              aria-label={`Slide ${k + 1}`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 cursor-pointer"
            >
              {k < idx ? (
                <span className="block h-full w-full rounded-full bg-[#E58A3B]" />
              ) : k === idx ? (
                <motion.span
                  key={tick}
                  className="block h-full rounded-full bg-[#E58A3B]"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: SLIDE_MS / 1000, ease: "linear" }}
                />
              ) : (
                <span className="block h-full w-0 rounded-full bg-[#E58A3B]" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium text-stone-400">
          <span>theboredmonkey.com</span>
          <span>Creations & Connections</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Creator Intake Page
   ═══════════════════════════════════════════════════════════════════════════ */
export function CreatorIntakePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creator, setCreator] = useState<CreatorProfileData | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);

  const [userName, setUserName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [managementType, setManagementType] = useState<"SELF" | "AGENCY">("SELF");
  const [agencyName, setAgencyName] = useState("");
  const [pincode, setPincode] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [contentDescription, setContentDescription] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/creator/intake/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Invalid or expired invitation link");
        return res.json();
      })
      .then((data: CreatorProfileData) => {
        setCreator(data);
        const cleanHandle = data.handle ? data.handle.replace(/^@/, "").trim() : "";
        setUserName(cleanCreatorName(data.fullName, cleanHandle));

        const rawPhone = (
          data.whatsappNumber ||
          data.whatsapp ||
          data.phone ||
          ""
        )
          .replace(/\D/g, "")
          .slice(-10);
        setWhatsapp(rawPhone);

        if (data.managementType === "AGENCY" || data.agencyName) {
          setManagementType("AGENCY");
          setAgencyName(data.agencyName || "");
        } else {
          setManagementType("SELF");
        }

        setPincode(data.pincode || "");
        setCity(data.city || "");
        setState(data.state || "");
        setLanguages(
          data.languages?.length ? data.languages : ["Hindi", "English"]
        );

        const rawGenrePool: string[] = [];
        if (Array.isArray(data.subGenres) && data.subGenres.length > 0) {
          rawGenrePool.push(...data.subGenres);
        }
        if (data.category) {
          rawGenrePool.push(
            ...data.category
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }
        if (data.Macro_Vertical) {
          rawGenrePool.push(
            ...data.Macro_Vertical.split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }

        if (rawGenrePool.length > 0) {
          const matched: string[] = [];
          rawGenrePool.forEach((rg) => {
            const found = GENRE_OPTIONS.find(
              (g) =>
                g.label.toLowerCase() === rg.toLowerCase() ||
                g.label.toLowerCase().includes(rg.toLowerCase()) ||
                rg.toLowerCase().includes(g.label.split(" ")[0].toLowerCase())
            );
            if (found && !matched.includes(found.label)) {
              matched.push(found.label);
            } else if (!matched.includes(rg)) {
              matched.push(rg);
            }
          });
          setSelectedGenres(matched.length ? matched : ["Lifestyle & Vlogs"]);
        } else {
          setSelectedGenres(["Lifestyle & Vlogs"]);
        }

        const cleanDesc = !isScrapedCaption(data.contentDescription)
          ? data.contentDescription || ""
          : "";
        setContentDescription(cleanDesc);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load your profile");
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    const cleanPin = pincode.replace(/\D/g, "");
    if (cleanPin.length === 6) {
      setPincodeLoading(true);
      fetch(`https://api.postalpincode.in/pincode/${cleanPin}`)
        .then((r) => r.json())
        .then((res) => {
          if (res?.[0]?.Status === "Success" && res[0].PostOffice?.length > 0) {
            const po = res[0].PostOffice[0];
            setCity(po.District || po.Block || po.Name || "");
            setState(po.State || "");
          }
        })
        .catch(() => {})
        .finally(() => setPincodeLoading(false));
    } else {
      setCity("");
      setState("");
    }
  }, [pincode]);

  const toggleLanguage = (lang: string) => {
    setStepError(null);
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleGenre = (genre: string) => {
    setStepError(null);
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  // Dynamic personalized faded example prompt inside Content Description
  const dynamicExamplePrompt = useMemo(() => {
    const g = selectedGenres.slice(0, 2).join(" & ") || "Lifestyle";
    const l = languages.slice(0, 2).join(" & ") || "Hindi & English";
    return `I create 45–60s ${g} reels, honest product reviews & relatable storytelling in ${l}.`;
  }, [selectedGenres, languages]);

  const visibleLanguages = useMemo(() => {
    if (showAllLangs) return LANGUAGE_OPTIONS;
    return LANGUAGE_OPTIONS.filter(
      (item) => item.primary || languages.includes(item.label)
    );
  }, [showAllLangs, languages]);

  const visibleGenres = useMemo(() => {
    if (showAllGenres) return GENRE_OPTIONS;
    return GENRE_OPTIONS.filter(
      (item) => item.primary || selectedGenres.includes(item.label)
    );
  }, [showAllGenres, selectedGenres]);

  const matchProgress = useMemo(() => {
    let pct = 45;
    if (userName.trim().length > 1) pct += 10;
    if (
      whatsapp.replace(/\D/g, "").length === 10 &&
      (managementType === "SELF" || agencyName.trim().length > 1)
    )
      pct += 15;
    if (pincode.replace(/\D/g, "").length === 6) pct += 10;
    if (languages.length >= 2) pct += 5;
    if (selectedGenres.length >= 2) pct += 5;
    if (contentDescription.trim().length >= 8) pct += 10;
    return Math.min(pct, 100);
  }, [
    userName,
    whatsapp,
    managementType,
    agencyName,
    pincode,
    languages,
    selectedGenres,
    contentDescription,
  ]);

  const matchedBrandCount = useMemo(() => {
    let count = 10;
    count += Math.min(languages.length * 4, 12);
    count += Math.min(selectedGenres.length * 5, 15);
    if (city || pincode.length === 6) count += 6;
    if (contentDescription.trim().length >= 8) count += 5;
    return count;
  }, [languages, selectedGenres, city, pincode, contentDescription]);

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);
    if (!userName.trim()) {
      setStepError("Please confirm your name.");
      return;
    }
    if (whatsapp.replace(/\D/g, "").length < 10) {
      setStepError("Please enter your 10-digit WhatsApp number.");
      return;
    }
    if (managementType === "AGENCY" && !agencyName.trim()) {
      setStepError("Please enter your agency name.");
      return;
    }
    if (pincode.replace(/\D/g, "").length < 6) {
      setStepError("Please enter your 6-digit PIN code.");
      return;
    }
    if (token) {
      fetch(`/api/creator/intake/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: userName.trim(),
          whatsappNumber: whatsapp.replace(/\D/g, ""),
          managementType,
          agencyName: managementType === "AGENCY" ? agencyName.trim() : "",
          pincode: pincode.replace(/\D/g, ""),
          city: city.trim(),
          state: state.trim(),
        }),
      }).catch(() => {});
    }
    setDirection(1);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);
    if (!token) return;
    if (languages.length === 0) {
      setStepError("Please select at least one language.");
      return;
    }
    if (selectedGenres.length === 0) {
      setStepError("Please select at least one genre.");
      return;
    }

    const finalDescription =
      contentDescription.trim() || dynamicExamplePrompt;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/creator/intake/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: userName.trim(),
          whatsappNumber: whatsapp.replace(/\D/g, ""),
          managementType,
          agencyName: managementType === "AGENCY" ? agencyName.trim() : "",
          pincode: pincode.replace(/\D/g, ""),
          city: city.trim(),
          state: state.trim(),
          languages,
          category: selectedGenres[0] || "Lifestyle & Vlogs",
          subGenres: selectedGenres,
          contentDescription: finalDescription,
          isFinal: true,
        }),
      });
      if (!res.ok) throw new Error("Failed to save details");
      const updated = await res.json();
      setCreator(updated);
      setContentDescription(finalDescription);
      setSubmitted(true);
    } catch (err: any) {
      setStepError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FAF8F5] grid place-items-center p-4">
        <Loader2 className="w-6 h-6 text-[#E58A3B] animate-spin" />
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-dvh bg-[#FAF8F5] grid place-items-center p-4">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-stone-200 p-8 text-center shadow-lg">
          <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-[#1D1D1F] mb-1">
            Invitation Link Unavailable
          </h1>
          <p className="text-xs text-stone-500 mb-5">{error}</p>
          <a
            href="https://www.theboredmonkey.com/"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E58A3B] text-white text-xs font-semibold"
          >
            Visit TheBoredMonkey.com <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const cleanHandle = creator.handle.replace(/^@/, "");
  const displayCreatorName = cleanCreatorName(
    userName || creator.fullName,
    `@${cleanHandle}`
  );
  const followersLabel = formatFollowers(
    creator.followersCount ?? creator.followerCount,
    creator.followersRaw
  );

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center px-3 py-4 sm:px-6 sm:py-6 text-[#1D1D1F] bg-[#FAF8F5] overflow-x-hidden">
      <style>{`
        @keyframes tbmDiagFlow {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes tbmSilkLeft {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes tbmSilkRight {
          0% { transform: translate3d(-50%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .tbm-diag-row {
          display: flex;
          width: max-content;
          animation: tbmDiagFlow 80s linear infinite;
        }
        .tbm-diag-row-rev {
          display: flex;
          width: max-content;
          animation: tbmDiagFlow 90s linear infinite reverse;
        }
        .tbm-silk-left {
          width: max-content;
          animation: tbmSilkLeft 24s linear infinite;
        }
        .tbm-silk-right {
          width: max-content;
          animation: tbmSilkRight 24s linear infinite;
        }
      `}</style>

      {/* Diagonal Flowing Brand Logos Background */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden z-0 opacity-[0.055]"
        aria-hidden="true"
      >
        <div
          className="absolute -inset-[35%] flex flex-col justify-around gap-16"
          style={{ transform: "rotate(-15deg)" }}
        >
          {FLOWING_BG_ROWS.map((row, rIdx) => (
            <div
              key={rIdx}
              className={
                rIdx % 2 === 0 ? "tbm-diag-row" : "tbm-diag-row-rev"
              }
            >
              {[...row, ...row, ...row].map((src, i) => (
                <div
                  key={i}
                  className="mx-10 flex items-center justify-center w-28 h-12 shrink-0"
                >
                  <img
                    src={src}
                    alt=""
                    className="max-h-7 max-w-[95px] object-contain invert grayscale contrast-150"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[460px] lg:max-w-[980px]">
        {/* MOBILE-ONLY COMPACT HEADER (< 1024px) */}
        <div className="mb-3 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs lg:hidden">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-stone-100">
            <img
              src="/theboredmonkey-logo.png"
              alt="TheBoredMonkey"
              className="h-5 w-auto object-contain"
            />
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F7C636] px-2.5 py-0.5 text-[10px] font-bold text-[#1D1D1F]">
              Creator Invite
            </span>
          </div>
          <div className="flex items-center gap-3">
            <CreatorAvatar token={token} name={displayCreatorName} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-extrabold text-[#1D1D1F] truncate">
                  {displayCreatorName}
                </span>
                <CheckCircle2 className="size-3.5 text-sky-500 shrink-0" />
              </div>
              <div className="text-[11px] text-stone-500 flex items-center gap-1.5">
                <span className="font-bold text-[#E58A3B]">@{cleanHandle}</span>
                <span>•</span>
                <span className="font-bold text-[#1D1D1F]">
                  {followersLabel} Followers
                </span>
              </div>
            </div>
            <ReadinessRing pct={matchProgress} />
          </div>
        </div>

        {/* STANDARD FIXED-HEIGHT DESKTOP CARD (lg:h-[600px]) */}
        <div className="grid overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03),0_28px_65px_-28px_rgba(29,29,31,0.18)] lg:grid-cols-12 lg:h-[600px]">
          {/* Left Showcase Column (Desktop Only — 5 cols) */}
          <div className="hidden lg:block lg:col-span-5 lg:border-r lg:border-stone-200/80 lg:h-[600px]">
            <TBMShowcase
              token={token}
              creatorName={displayCreatorName}
              handle={cleanHandle}
              followersLabel={followersLabel}
              city={city}
              pincode={pincode}
              managementType={managementType}
              agencyName={agencyName}
              languages={languages}
              selectedGenres={selectedGenres}
              matchProgress={matchProgress}
              matchedBrandCount={matchedBrandCount}
            />
          </div>

          {/* Right Form Column (7 cols on desktop, fixed height lg:h-[600px]) */}
          <div className="lg:col-span-7 flex flex-col justify-between px-5 py-6 sm:px-9 sm:py-7 bg-white lg:h-[600px]">
            {/* Minimal Top Step Bar (No duplicate creator card clutter on desktop!) */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100 shrink-0">
              {step === 2 && !submitted ? (
                <button
                  type="button"
                  onClick={() => {
                    setDirection(-1);
                    setStep(1);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-[#1D1D1F] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" /> Back to Contact Details
                </button>
              ) : (
                <span className="text-xs font-bold text-stone-400">
                  Hey,{" "}
                  <span className="text-[#1D1D1F]">{displayCreatorName}</span>{" "}
                  👋
                </span>
              )}

              {!submitted && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection(-1);
                      setStep(1);
                    }}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      step === 1
                        ? "w-6 bg-[#E58A3B]"
                        : "w-2 bg-emerald-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        whatsapp.replace(/\D/g, "").length === 10 &&
                        pincode.replace(/\D/g, "").length === 6
                      ) {
                        setDirection(1);
                        setStep(2);
                      }
                    }}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      step === 2 ? "w-6 bg-[#E58A3B]" : "w-2 bg-stone-200"
                    }`}
                  />
                  <span className="ml-1 text-[11px] font-bold text-stone-400">
                    Step {step} of 2
                  </span>
                </div>
              )}
            </div>

            {/* Form Body */}
            <div className="flex-1 flex flex-col justify-center py-2">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                {submitted ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-6 space-y-4"
                  >
                    <div className="mx-auto w-fit">
                      <CreatorAvatar
                        token={token}
                        name={displayCreatorName}
                        size="md"
                      />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold text-[#1D1D1F]">
                        Profile Verified, {displayCreatorName}!
                      </h2>
                      <p className="text-[13px] text-stone-500 mt-1 max-w-sm mx-auto leading-relaxed">
                        Your niche ({selectedGenres.slice(0, 2).join(", ")}),
                        languages ({languages.slice(0, 2).join(", ")}), and
                        location ({city || pincode}) are now unlocked for{" "}
                        <span className="font-bold text-[#1D1D1F]">
                          {matchedBrandCount}+ active partner brands
                        </span>
                        .
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitted(false);
                        setStep(1);
                      }}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-[#EED279] bg-[#FFFDF5] text-xs font-bold text-[#1D1D1F] hover:bg-[#FFF9E6] cursor-pointer"
                    >
                      <Pencil className="size-3.5" /> Edit Details
                    </button>
                  </motion.div>
                ) : step === 1 ? (
                  <motion.form
                    key="step-1"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    onSubmit={handleStep1Next}
                    className="space-y-4"
                  >
                    <div>
                      <h1 className="text-[22px] sm:text-[24px] font-extrabold tracking-tight text-[#1D1D1F]">
                        Confirm Your{" "}
                        <span className="bg-gradient-to-r from-[#EE7828] to-[#F5A636] bg-clip-text text-transparent">
                          Creator Profile.
                        </span>
                      </h1>
                      <p className="text-[12.5px] text-stone-500 mt-0.5">
                        Direct contact & location for brand campaign matching
                      </p>
                    </div>

                    {stepError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {stepError}
                      </div>
                    )}

                    {/* User Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[12px] font-bold text-[#1D1D1F]">
                          User Name <span className="text-[#E58A3B]">*</span>
                        </label>
                        <span className="text-[11px] font-medium text-emerald-600">
                          ✓ @{cleanHandle}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={userName}
                          onChange={(e) => {
                            setStepError(null);
                            setUserName(e.target.value);
                          }}
                          placeholder="Your Full Name"
                          className={INPUT_CLASS}
                        />
                        {userName.trim().length > 1 && (
                          <Check className="size-4 text-emerald-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
                        )}
                      </div>
                    </div>

                    {/* Mobile / WhatsApp + Side Radio Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[12px] font-bold text-[#1D1D1F]">
                            WhatsApp Number{" "}
                            <span className="text-[#E58A3B]">*</span>
                          </label>
                        </div>
                        <div className="flex items-center h-11 rounded-xl border border-stone-200 bg-white overflow-hidden transition-all duration-200 focus-within:border-[#E58A3B] focus-within:ring-4 focus-within:ring-[#E58A3B]/15">
                          <span className="px-3 h-full flex items-center bg-[#FAF8F5] border-r border-stone-200 text-[13px] font-bold text-stone-600">
                            +91
                          </span>
                          <input
                            type="tel"
                            required
                            maxLength={10}
                            value={whatsapp}
                            onChange={(e) => {
                              setStepError(null);
                              setWhatsapp(
                                e.target.value.replace(/\D/g, "").slice(0, 10)
                              );
                            }}
                            placeholder="10-digit mobile number"
                            className="w-full h-full px-3 text-[14px] font-medium text-[#1D1D1F] placeholder:text-stone-400 outline-none bg-transparent"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-6">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[12px] font-bold text-[#1D1D1F]">
                            Managed By <span className="text-[#E58A3B]">*</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2 h-11">
                          <label
                            onClick={() => {
                              setStepError(null);
                              setManagementType("SELF");
                            }}
                            className={`cursor-pointer rounded-xl border px-2.5 flex items-center justify-center gap-1.5 text-[12px] font-bold transition-all select-none whitespace-nowrap ${
                              managementType === "SELF"
                                ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <span
                              className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                managementType === "SELF"
                                  ? "border-[#E58A3B] bg-[#E58A3B]"
                                  : "border-stone-300"
                              }`}
                            >
                              {managementType === "SELF" && (
                                <span className="size-1.5 rounded-full bg-white" />
                              )}
                            </span>
                            <span>Self-Managed</span>
                          </label>

                          <label
                            onClick={() => {
                              setStepError(null);
                              setManagementType("AGENCY");
                            }}
                            className={`cursor-pointer rounded-xl border px-2.5 flex items-center justify-center gap-1.5 text-[12px] font-bold transition-all select-none whitespace-nowrap ${
                              managementType === "AGENCY"
                                ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <span
                              className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                managementType === "AGENCY"
                                  ? "border-[#E58A3B] bg-[#E58A3B]"
                                  : "border-stone-300"
                              }`}
                            >
                              {managementType === "AGENCY" && (
                                <span className="size-1.5 rounded-full bg-white" />
                              )}
                            </span>
                            <span>Agency</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Conditional Empty Tab for Agency Name */}
                    <AnimatePresence initial={false}>
                      {managementType === "AGENCY" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 rounded-xl bg-[#FFFDF5] border border-[#EED279]">
                            <label className="block text-[11.5px] font-bold text-[#1D1D1F] mb-1">
                              Agency Name{" "}
                              <span className="text-[#E58A3B]">*</span>
                            </label>
                            <input
                              type="text"
                              required={managementType === "AGENCY"}
                              value={agencyName}
                              onChange={(e) => {
                                setStepError(null);
                                setAgencyName(e.target.value);
                              }}
                              placeholder="Enter your talent agency name"
                              className="w-full h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-[#1D1D1F] placeholder:text-stone-400 outline-none focus:border-[#E58A3B]"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Location PIN Code */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[12px] font-bold text-[#1D1D1F]">
                          Location PIN Code{" "}
                          <span className="text-[#E58A3B]">*</span>
                        </label>
                        {pincodeLoading ? (
                          <span className="text-[11px] text-[#E58A3B] flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" />{" "}
                            Detecting city...
                          </span>
                        ) : city ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <MapPin className="size-3" /> {city}
                            {state ? `, ${state}` : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-400">
                            Auto-detects your city
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={pincode}
                        onChange={(e) => {
                          setStepError(null);
                          setPincode(
                            e.target.value.replace(/\D/g, "").slice(0, 6)
                          );
                        }}
                        placeholder="Enter 6-digit PIN code (e.g. 400013)"
                        className={INPUT_CLASS}
                      />
                    </div>

                    {/* Primary CTA Button */}
                    <div className="pt-1">
                      <button
                        type="submit"
                        className="w-full h-11 rounded-full bg-[#E58A3B] hover:bg-[#d87c2d] text-white font-bold text-[14px] shadow-[0_4px_14px_rgba(229,138,59,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Continue to Niche & Languages</span>
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.form
                    key="step-2"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    onSubmit={handleSubmit}
                    className="space-y-3.5"
                  >
                    <div>
                      <h1 className="text-[21px] sm:text-[23px] font-extrabold tracking-tight text-[#1D1D1F]">
                        Languages, Niche &{" "}
                        <span className="bg-gradient-to-r from-[#EE7828] to-[#F5A636] bg-clip-text text-transparent">
                          Content Style.
                        </span>
                      </h1>
                    </div>

                    {stepError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {stepError}
                      </div>
                    )}

                    {/* Clean Unified Box: Languages Above + Genre + Content Description */}
                    <div className="rounded-2xl border border-stone-200/90 bg-[#FAF8F5] p-4 space-y-3.5">
                      {/* 1. Languages Above */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[12px] font-extrabold text-[#1D1D1F]">
                            Languages <span className="text-[#E58A3B]">*</span>
                          </label>
                          <span className="text-[10.5px] font-medium text-stone-400">
                            Select all you create in
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleLanguages.map((item) => {
                            const active = languages.includes(item.label);
                            return (
                              <button
                                key={item.label}
                                type="button"
                                onClick={() => toggleLanguage(item.label)}
                                className={`px-3 py-1 rounded-full text-[11.5px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                  active
                                    ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
                                }`}
                              >
                                {active && (
                                  <Check className="size-3 text-[#F7C636]" />
                                )}
                                <span>{item.label}</span>
                                {item.hot && !active && (
                                  <span className="size-1.5 rounded-full bg-[#E58A3B]" />
                                )}
                              </button>
                            );
                          })}
                          {!showAllLangs && (
                            <button
                              type="button"
                              onClick={() => setShowAllLangs(true)}
                              className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-dashed border-stone-300 text-stone-500 hover:text-[#1D1D1F] hover:border-stone-400 cursor-pointer"
                            >
                              + More
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 2. Genre / Niche (Multi-Select) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[12px] font-extrabold text-[#1D1D1F]">
                            Genre / Niche{" "}
                            <span className="text-[#E58A3B]">*</span>
                          </label>
                          <span className="text-[10.5px] font-semibold text-[#E58A3B]">
                            ★ High brand demand
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleGenres.map((item) => {
                            const active = selectedGenres.includes(item.label);
                            return (
                              <button
                                key={item.label}
                                type="button"
                                onClick={() => toggleGenre(item.label)}
                                className={`px-3 py-1 rounded-full text-[11.5px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                  active
                                    ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
                                }`}
                              >
                                {active && (
                                  <Check className="size-3 text-[#F7C636]" />
                                )}
                                <span>{item.label}</span>
                                {item.hot && (
                                  <span
                                    className={`text-[9px] font-bold ${
                                      active
                                        ? "text-[#F7C636]"
                                        : "text-[#E58A3B]"
                                    }`}
                                  >
                                    ★
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {!showAllGenres && (
                            <button
                              type="button"
                              onClick={() => setShowAllGenres(true)}
                              className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-dashed border-stone-300 text-stone-500 hover:text-[#1D1D1F] hover:border-stone-400 cursor-pointer"
                            >
                              + More
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3. Content Description with Banking-Grade Faded Ghost Example & Tab-to-Fill */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[12px] font-extrabold text-[#1D1D1F]">
                            Content Description
                          </label>
                          <span className="text-[10.5px] text-stone-400">
                            Brief summary of your content format
                          </span>
                        </div>

                        <div className="relative">
                          <textarea
                            rows={2}
                            value={contentDescription}
                            onKeyDown={(e) => {
                              if (
                                e.key === "Tab" &&
                                !contentDescription.trim()
                              ) {
                                e.preventDefault();
                                setContentDescription(dynamicExamplePrompt);
                              }
                            }}
                            onChange={(e) => {
                              setStepError(null);
                              setContentDescription(e.target.value);
                            }}
                            placeholder={`e.g. "${dynamicExamplePrompt}"`}
                            className="w-full rounded-xl border border-stone-200 bg-white p-3 text-[12.5px] text-[#1D1D1F] placeholder:text-stone-400/75 placeholder:italic outline-none transition-all focus:border-[#E58A3B] focus:ring-4 focus:ring-[#E58A3B]/15 resize-none leading-relaxed"
                          />
                          {!contentDescription.trim() && (
                            <button
                              type="button"
                              onClick={() =>
                                setContentDescription(dynamicExamplePrompt)
                              }
                              className="absolute bottom-2 right-2.5 px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-stone-200 text-[10px] font-semibold text-stone-500 hover:text-[#1D1D1F] hover:border-stone-300 transition-colors cursor-pointer"
                            >
                              Use example ↵
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Submit CTA */}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-11 rounded-full bg-[#E58A3B] hover:bg-[#d87c2d] text-white font-bold text-[14px] shadow-[0_4px_14px_rgba(229,138,59,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <span>Complete Creator Profile</span>
                          <Check className="size-4" />
                        </>
                      )}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-[11px] text-stone-400 shrink-0">
              <span>Verified Creator Onboarding</span>
              <span>© {new Date().getFullYear()} TheBoredMonkey</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default CreatorIntakePage;
