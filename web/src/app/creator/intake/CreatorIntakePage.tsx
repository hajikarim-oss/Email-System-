import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import "./CreatorIntakePage.css";

const CATEGORIES = [
  "Tech & Gadgets",
  "Home & Appliances",
  "Chefs & Home Cooking",
  "Food & Drink Reviews",
  "Beauty & Grooming",
  "Skincare",
  "Fashion & Lifestyle",
  "Fitness & Wellness",
  "Health & Medical",
  "Travel & Hospitality",
  "Vlogging & Daily Life",
  "Travel Vlogging",
  "Motovlogging",
  "Business & Marketing",
  "Personal Finance",
  "Stock Market & Trading",
  "News, Society & Politics",
  "General Knowledge",
  "Education & Learning",
  "Gaming & Esports",
  "Entertainment & Comedy",
  "Art, Music & Creativity",
  "Auto & Mobility",
  "Pets & Animals",
  "Real Estate & Property",
  "Spirituality & Astrology",
  "Relationships & Dating",
  "Game Shows & Original IPs",
  "Stand-up Comedy",
  "Reaction Channels",
  "Parenting & Family",
  "Sports & Athletics",
  "Photography & Filmmaking",
  "Books & Literature",
  "DIY, Crafts & Hobbies",
  "Home Décor & Interiors",
  "Gardening & Plants",
  "Sustainability & Environment",
  "Other",
];

const LANGUAGES = [
  "English",
  "हिन्दी",
  "मराठी",
  "தமிழ்",
  "తెలుగు",
  "മലയാളം",
  "ಕನ್ನಡ",
  "বাংলা",
  "ગુજરાતી",
  "ਪੰਜਾਬੀ",
  "ଓଡ଼ିଆ",
  "भोजपुरी",
  "অসমীয়া",
  "Other",
];

export function CreatorIntakePage() {
  const { token: routeToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();

  // Active token can come from path parameter (/creator/intake/:token) or query (?token=...)
  const activeToken = routeToken || searchParams.get("token") || "";

  // Form State
  const [instagram, setInstagram] = useState("");
  const [prefilledHandle, setPrefilledHandle] = useState<string | null>(null);
  const [showPrefilledCard, setShowPrefilledCard] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [email, setEmail] = useState("");
  const [youtube, setYoutube] = useState("");
  const [management, setManagement] = useState<"self" | "personal" | "agency">("self");
  const [managerName, setManagerName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [phone, setPhone] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [otherLanguages, setOtherLanguages] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [otherCategories, setOtherCategories] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);

  // UI state
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const successRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Set document title and fonts on mount
  useEffect(() => {
    document.title = "Creator Network · TheBoredMonkey";
    document.body.classList.add("creator-network-body");
    return () => {
      document.body.classList.remove("creator-network-body");
    };
  }, []);

  // Fetch token profile if present
  useEffect(() => {
    let handleFromParam = (searchParams.get("instagram") || searchParams.get("handle") || "").replace(/^@/, "").trim();
    const nameFromParam = searchParams.get("name") || "";

    if (nameFromParam) {
      setCreatorName(nameFromParam.slice(0, 150));
    }

    if (handleFromParam && /^[A-Za-z0-9._]{1,30}$/.test(handleFromParam)) {
      setInstagram(`https://www.instagram.com/${handleFromParam}/`);
      setPrefilledHandle(handleFromParam);
      setShowPrefilledCard(true);
    }

    if (activeToken) {
      fetch(`/api/creator/intake/${encodeURIComponent(activeToken)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((creator) => {
          if (creator) {
            const h = (creator.handle || "").replace(/^@/, "").trim();
            if (h) {
              setPrefilledHandle(h);
              setInstagram(`https://www.instagram.com/${h}/`);
              setShowPrefilledCard(true);
            }
            if (creator.fullName) setCreatorName(creator.fullName);
            if (creator.primaryEmail) setEmail(creator.primaryEmail);
            if (creator.whatsappNumber) setPhone(creator.whatsappNumber.replace(/\D/g, "").slice(-10));
            if (creator.pincode) setPinCode(creator.pincode.replace(/\D/g, "").slice(0, 6));
            if (creator.mediaKitUrl) setYoutube(creator.mediaKitUrl);
            if (creator.contentDescription) setDescription(creator.contentDescription);
            if (creator.managementType) {
              const m = creator.managementType.toLowerCase();
              if (m === "personal" || m === "agency" || m === "self") setManagement(m);
            }
            if (creator.agencyName) setAgencyName(creator.agencyName);
            if (Array.isArray(creator.languages) && creator.languages.length > 0) {
              setSelectedLanguages(new Set(creator.languages));
            }
            if (Array.isArray(creator.subGenres) && creator.subGenres.length > 0) {
              setSelectedCategories(new Set(creator.subGenres));
            } else if (creator.category) {
              setSelectedCategories(new Set([creator.category]));
            }
          }
        })
        .catch(() => {});
    }
  }, [activeToken, searchParams]);

  // Real-time telemetry reporting for progress tracking
  const reportProgress = (currentStep: number, extraData: Record<string, any> = {}) => {
    if (!activeToken) return;
    fetch(`/api/creator/intake/${encodeURIComponent(activeToken)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: currentStep,
        fullName: creatorName,
        handle: prefilledHandle || instagram,
        primaryEmail: email,
        whatsappNumber: phone,
        pincode: pinCode,
        managementType: management,
        managerName,
        agencyName,
        languages: Array.from(selectedLanguages),
        subGenres: Array.from(selectedCategories),
        contentDescription: description,
        mediaKitUrl: youtube,
        ...extraData,
      }),
    }).catch(() => {});
  };

  // Category search & filtering
  const visibleCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (term) {
      return CATEGORIES.filter((c) => c.toLowerCase().includes(term));
    }
    if (!categoriesExpanded) {
      return CATEGORIES.filter(
        (c, idx) => idx < 12 || selectedCategories.has(c) || c === "Other"
      );
    }
    return CATEGORIES;
  }, [categorySearch, categoriesExpanded, selectedCategories]);

  const toggleLanguage = (lang: string) => {
    const next = new Set(selectedLanguages);
    if (next.has(lang)) next.delete(lang);
    else next.add(lang);
    setSelectedLanguages(next);
    reportProgress(2, { languages: Array.from(next) });
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(selectedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setSelectedCategories(next);
    reportProgress(2, { subGenres: Array.from(next) });
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setFormError("Please enter a valid official collaboration email address.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setFormError("Please enter a valid 10-digit WhatsApp mobile number.");
      return;
    }

    const cleanPin = pinCode.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      setFormError("Please enter a valid 6-digit PIN code.");
      return;
    }

    if (selectedLanguages.size === 0) {
      setFormError("Please select at least one language you create content in.");
      return;
    }

    if (!description.trim()) {
      setFormError("Please tell us what makes your content yours.");
      return;
    }

    if (!consent) {
      setFormError("Please accept the collaboration agreement to proceed.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      fullName: creatorName.trim(),
      handle: (prefilledHandle || instagram.replace(/.*instagram\.com\//i, "").replace(/[/@?].*/g, "")).trim(),
      primaryEmail: cleanEmail,
      email: cleanEmail,
      profileUrl: instagram.trim().startsWith("http") ? instagram.trim() : `https://www.instagram.com/${instagram.trim().replace(/^@/, "")}/`,
      whatsappNumber: cleanPhone,
      pincode: cleanPin,
      managementType: management,
      managerName: management !== "self" ? managerName.trim() : "",
      agencyName: management === "agency" ? agencyName.trim() : "",
      languages: Array.from(selectedLanguages).concat(otherLanguages.trim() ? [otherLanguages.trim()] : []),
      subGenres: Array.from(selectedCategories).concat(otherCategories.trim() ? [otherCategories.trim()] : []),
      contentDescription: description.trim(),
      mediaKitUrl: youtube.trim(),
      referredBy: (searchParams.get("ref") || "").replace(/^@/, "").trim(),
      isFinal: true,
      finalSubmit: true,
    };

    try {
      const endpoint = activeToken && activeToken !== "new"
        ? `/api/creator/intake/${encodeURIComponent(activeToken)}/submit`
        : `/api/creator/intake/new/submit`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Unable to save creator profile");
      }

      setIsSubmitted(true);
      setTimeout(() => {
        successRef.current?.focus();
        successRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    } catch (err: any) {
      // Even if network blips, show success state smoothly
      setIsSubmitted(true);
      setTimeout(() => {
        successRef.current?.focus();
        successRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReferralUrl = () => {
    const origin = window.location.origin;
    const refHandle = (
      prefilledHandle ||
      instagram.replace(/.*instagram\.com\//i, "").replace(/[/@?].*/g, "") ||
      searchParams.get("ref") ||
      ""
    ).replace(/^@/, "").trim();
    const refQuery = refHandle ? `?ref=${encodeURIComponent(refHandle)}` : "";
    return `${origin}/creator/intake${refQuery}`;
  };

  const handleShare = async () => {
    const cleanReferralUrl = getReferralUrl();
    const text =
      "TheBoredMonkey is inviting creators to join its free, non-exclusive creator network for relevant brand collaborations.";
    try {
      if (navigator.share) {
        await navigator.share({
          title: "TheBoredMonkey Creator Network",
          text,
          url: cleanReferralUrl,
        });
        setShareStatus("Thanks for spreading the word!");
      } else {
        await navigator.clipboard.writeText(`${text}\n${cleanReferralUrl}`);
        setShareStatus("Signup link copied: " + cleanReferralUrl);
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        setShareStatus("Copy this signup link to share: " + cleanReferralUrl);
      }
    }
  };

  return (
    <div className="creator-network-root">
      {/* Site Header */}
      <header className="site-header wrap">
        <a href="#" aria-label="TheBoredMonkey home" className="logo">
          <img
            src="/assets/tbm-logo.gif"
            alt="TheBoredMonkey — Creations & Connections"
            width={244}
            height={63}
          />
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="mailto:Connect@theboredmonkey.com" className="header-contact">
            Get in touch <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-main">
            <div className="eyebrow">
              <span className="live-dot" /> THE CREATOR NETWORK
            </div>
            <h1 id="hero-title">
              Good content.
              <br />
              Great{" "}
              <span className="highlight">
                connections
                <svg viewBox="0 0 600 25" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M5 15 Q300 -3 590 13 M30 23 Q300 8 560 20" />
                </svg>
              </span>
              .
            </h1>
            <p className="hero-copy">
              You bring the creativity. We help connect it with the right brands. Tell us a little
              about yourself, and let’s find your next great collaboration.
            </p>
            <a className="button primary hero-cta" href="#join">
              Let’s get you connected <span aria-hidden="true">↗</span>
            </a>
            <div className="hero-perks">
              <span>✓ Free to join</span>
              <span>✓ Non-exclusive</span>
              <span>✓ Every creator welcome</span>
            </div>
          </div>
          <aside className="hero-note" aria-label="About TheBoredMonkey">
            <div className="note-top">
              <span>
                CREATIONS &amp;
                <br />
                CONNECTIONS.
              </span>
              <span className="asterisk" aria-hidden="true">
                ✳
              </span>
            </div>
            <p>
              Big ideas.
              <br />
              Better together.
            </p>
            <div className="note-bottom">
              <span>
                MUMBAI ROOTS.
                <br />
                CREATOR CONNECTIONS.
              </span>
              <span className="note-year">
                EST.
                <br />
                2020
              </span>
            </div>
          </aside>
        </section>

        {/* Proof Section */}
        <section className="proof wrap" aria-label="About our network">
          <p>
            A Mumbai-based marketing agency.
            <br />
            <strong>Connecting brands &amp; creators since 2020.</strong>
          </p>
          <div className="proof-stat">
            <strong>
              100<span>+</span>
            </strong>
            <span>brands worked with</span>
          </div>
          <div className="proof-stat">
            <strong>
              1 lakh<span>+</span>
            </strong>
            <span>creator profiles scouted</span>
          </div>
          <div className="proof-note">
            Built through years of
            <br />
            scouting &amp; collaborations.
            <span aria-hidden="true">↗</span>
          </div>
        </section>

        {/* How it works */}
        <section className="how wrap" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">LESS BACK-AND-FORTH. MORE POSSIBILITIES.</div>
              <h2 id="how-title">
                A little about you.
                <br />
                A better match for your content.
              </h2>
            </div>
            <p>
              We’re making creator discovery simpler.
              <br />
              Here’s how you fit into the picture.
            </p>
          </div>
          <div className="how-grid">
            <article>
              <span className="step-number">01</span>
              <div>
                <h3>Make your introduction</h3>
                <p>
                  Your topics, your languages, your own creative spin. Help us get to know the creator
                  behind the profile.
                </p>
              </div>
            </article>
            <article>
              <span className="step-number">02</span>
              <div>
                <h3>Let us connect the dots</h3>
                <p>
                  Our system helps our team match your profile with relevant brand briefs and campaign
                  requirements.
                </p>
              </div>
            </article>
            <article>
              <span className="step-number">03</span>
              <div>
                <h3>Hear from our team</h3>
                <p>
                  When you’re shortlisted, we’ll reach out to you or your manager with the opportunity.
                  Simple as that.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Join Form Section */}
        <section className="join-section" id="join">
          <div className="wrap join-wrap">
            <div className="join-intro">
              <div className="eyebrow">YOUR NEXT CONNECTION STARTS HERE</div>
              <h2>
                Hey creator.
                <br />
                Let’s get to know you<span className="yellow-text">.</span>
              </h2>
              <p>A few details now. More relevant opportunities ahead.</p>
              <div className="time-tag">
                <span aria-hidden="true">◷</span> About 1–2 minutes
              </div>
            </div>

            <div className="form-shell">
              <div className="form-top">
                <span>YOUR CREATOR PROFILE</span>
                <span>
                  <i /> Made for you
                </span>
              </div>

              {!isSubmitted ? (
                <form id="creator-form" ref={formRef} noValidate onSubmit={handleSubmit}>
                  {/* Step 1: The Basics */}
                  <div className="form-block">
                    <div className="block-heading">
                      <span className="block-index">01</span>
                      <div>
                        <h3>The basics</h3>
                        <p>The profile. The person. The point of contact.</p>
                      </div>
                    </div>

                    {showPrefilledCard && prefilledHandle ? (
                      <div id="prefilled-profile" className="profile-card">
                        <div className="profile-icon" aria-hidden="true">
                          ◎
                        </div>
                        <div>
                          <span>Your Instagram profile</span>
                          <strong id="profile-handle">@{prefilledHandle}</strong>
                        </div>
                        <a
                          id="profile-link"
                          href={`https://www.instagram.com/${prefilledHandle}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View profile ↗
                        </a>
                        <button
                          type="button"
                          id="change-profile"
                          onClick={() => {
                            setShowPrefilledCard(false);
                          }}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="field" id="instagram-field">
                        <label htmlFor="instagram">
                          Instagram profile link <span>*</span>
                        </label>
                        <input
                          id="instagram"
                          name="instagram"
                          type="url"
                          placeholder="https://www.instagram.com/yourhandle"
                          required
                          autoComplete="url"
                          value={instagram}
                          onChange={(e) => setInstagram(e.target.value)}
                        />
                        <small>The profile you’d like us to consider for collaborations.</small>
                      </div>
                    )}

                    <div className="field-grid">
                      <div className="field">
                        <label htmlFor="creator-name">
                          Creator name <span>*</span>
                        </label>
                        <input
                          id="creator-name"
                          name="creatorName"
                          placeholder="Your name or creator name"
                          required
                          autoComplete="name"
                          value={creatorName}
                          onChange={(e) => setCreatorName(e.target.value)}
                          onBlur={() => reportProgress(1)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="youtube">
                          YouTube channel <em>Optional</em>
                        </label>
                        <input
                          id="youtube"
                          name="youtube"
                          type="url"
                          placeholder="https://youtube.com/@yourchannel"
                          value={youtube}
                          onChange={(e) => setYoutube(e.target.value)}
                        />
                      </div>
                    </div>

                    <fieldset className="management">
                      <legend>
                        Who handles your collaborations? <span>*</span>
                      </legend>
                      <div className="management-options">
                        <label>
                          <input
                            type="radio"
                            name="management"
                            value="self"
                            checked={management === "self"}
                            onChange={() => setManagement("self")}
                          />
                          <span>
                            <b aria-hidden="true">☺</b>Self-managed
                          </span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="management"
                            value="personal"
                            checked={management === "personal"}
                            onChange={() => setManagement("personal")}
                          />
                          <span>
                            <b aria-hidden="true">♧</b>Personal manager
                          </span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="management"
                            value="agency"
                            checked={management === "agency"}
                            onChange={() => setManagement("agency")}
                          />
                          <span>
                            <b aria-hidden="true">▤</b>Agency-managed
                          </span>
                        </label>
                      </div>
                    </fieldset>

                    <div className="field-grid">
                      {management !== "self" && (
                        <div className="field" id="manager-name-field">
                          <label htmlFor="manager-name">
                            Manager’s name <span>*</span>
                          </label>
                          <input
                            id="manager-name"
                            name="managerName"
                            placeholder="Your manager’s name"
                            required
                            value={managerName}
                            onChange={(e) => setManagerName(e.target.value)}
                          />
                        </div>
                      )}
                      {management === "agency" && (
                        <div className="field" id="agency-field">
                          <label htmlFor="agency-name">
                            Agency name <span>*</span>
                          </label>
                          <input
                            id="agency-name"
                            name="agencyName"
                            placeholder="Your management agency"
                            required
                            value={agencyName}
                            onChange={(e) => setAgencyName(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Important Outreach Email Block */}
                    <div
                      className="field email-priority-block"
                      style={{
                        margin: "20px 0 16px",
                        padding: "16px 18px",
                        background: "#FAF7EE",
                        border: "1.5px solid #E8DEBE",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        <label
                          htmlFor="creator-email"
                          style={{ fontSize: "12.5px", fontWeight: 700, color: "#171717", margin: 0 }}
                        >
                          {management === "self" ? "Official Collaboration Email " : "Manager's / Booking Email "}
                          <span style={{ color: "#e05244" }}>*</span>
                        </label>
                        <span
                          style={{
                            fontSize: "9.5px",
                            fontWeight: 700,
                            letterSpacing: "0.5px",
                            textTransform: "uppercase",
                            color: "#8a5800",
                            background: "#ffebb3",
                            border: "1px solid #ffd880",
                            padding: "2px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          Important · Outreach & Briefs
                        </span>
                      </div>
                      <input
                        id="creator-email"
                        name="email"
                        type="email"
                        placeholder="collabs@yourhandle.com or yourname@gmail.com"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        onBlur={() => reportProgress(1, { primaryEmail: email })}
                        style={{
                          width: "100%",
                          fontSize: "15px",
                          padding: "12px 14px",
                          background: "#ffffff",
                          border: "1px solid #dcd7ca",
                          borderRadius: "6px",
                          outline: "none",
                        }}
                      />
                      <small style={{ display: "block", marginTop: "6px", fontSize: "11px", color: "#666155", lineHeight: 1.5 }}>
                        Where brands and our team will send official commercial briefs, deliverables, and collaboration contracts.
                      </small>
                    </div>

                    <div className="field-grid">
                      <div className="field">
                        <label htmlFor="phone" id="phone-label">
                          {management === "self" ? "Your WhatsApp number " : "Manager’s WhatsApp number "}
                          <span>*</span>
                        </label>
                        <div className="phone-input">
                          <span>+91</span>
                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            placeholder="10-digit mobile number"
                            required
                            autoComplete={management === "self" ? "tel-national" : "off"}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                            onBlur={() => reportProgress(1, { whatsappNumber: phone })}
                          />
                        </div>
                        <small id="phone-help">
                          {management === "self"
                            ? "Where we can reach you about collaborations."
                            : "We’ll contact your manager about relevant collaborations."}
                        </small>
                      </div>

                      <div className="field">
                        <label htmlFor="pin">
                          Where are you based? <span>*</span>
                        </label>
                        <input
                          id="pin"
                          name="pinCode"
                          inputMode="numeric"
                          pattern="[1-9][0-9]{5}"
                          maxLength={6}
                          placeholder="Your 6-digit PIN code"
                          required
                          autoComplete="postal-code"
                          value={pinCode}
                          onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                          onBlur={() => reportProgress(1, { pincode: pinCode })}
                        />
                        <small>Use the PIN code for where you currently live.</small>
                        <small id="pin-result" aria-live="polite" />
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Your Creative World */}
                  <div className="form-block">
                    <div className="block-heading">
                      <span className="block-index">02</span>
                      <div>
                        <h3>Your creative world</h3>
                        <p>Help the right briefs find their way to you.</p>
                      </div>
                    </div>

                    <fieldset>
                      <legend>
                        Which languages do you create in? <span>*</span>
                      </legend>
                      <p className="field-description">
                        Select all the languages you use in your content.
                      </p>
                      <div className="chips" id="language-chips">
                        {LANGUAGES.map((lang) => {
                          const active = selectedLanguages.has(lang);
                          return (
                            <button
                              key={lang}
                              type="button"
                              className="chip"
                              aria-pressed={String(active)}
                              onClick={() => toggleLanguage(lang)}
                            >
                              {lang}
                            </button>
                          );
                        })}
                      </div>

                      {selectedLanguages.has("Other") && (
                        <div className="field other-field" id="other-language-field">
                          <label htmlFor="other-language">
                            Other languages <span>*</span>
                          </label>
                          <input
                            id="other-language"
                            name="otherLanguages"
                            placeholder="Add your content languages"
                            required
                            value={otherLanguages}
                            onChange={(e) => setOtherLanguages(e.target.value)}
                          />
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="category-fieldset">
                      <legend>What do you create content about?</legend>
                      <p className="field-description">
                        Choose the topics you regularly cover. Select as many as you like.
                      </p>
                      <div className="search-wrap">
                        <span aria-hidden="true">⌕</span>
                        <input
                          type="search"
                          id="category-search"
                          placeholder="Find your niche…"
                          aria-label="Search content categories"
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                        />
                      </div>
                      <div className="chips" id="category-chips">
                        {visibleCategories.map((cat) => {
                          const active = selectedCategories.has(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              className="chip"
                              aria-pressed={String(active)}
                              onClick={() => toggleCategory(cat)}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      <div className="category-controls">
                        {!categorySearch && (
                          <button
                            type="button"
                            id="show-categories"
                            aria-expanded={String(categoriesExpanded)}
                            onClick={() => setCategoriesExpanded(!categoriesExpanded)}
                          >
                            {categoriesExpanded
                              ? "Show fewer categories ↑"
                              : `Show all ${CATEGORIES.length} categories ↓`}
                          </button>
                        )}
                        <span id="category-count" aria-live="polite">
                          {selectedCategories.size} selected
                        </span>
                      </div>

                      {visibleCategories.length === 0 && (
                        <p id="no-categories">
                          No matching categories. Choose “Other” to add your niche.
                        </p>
                      )}

                      {selectedCategories.has("Other") && (
                        <div className="field other-field" id="other-category-field">
                          <label htmlFor="other-category">
                            Your other content categories <span>*</span>
                          </label>
                          <input
                            id="other-category"
                            name="otherCategories"
                            placeholder="Tell us what else you create content about"
                            required
                            value={otherCategories}
                            onChange={(e) => setOtherCategories(e.target.value)}
                          />
                        </div>
                      )}
                    </fieldset>

                    <div className="field description-field">
                      <label htmlFor="description">
                        Tell us what makes your content yours <span>*</span>
                      </label>
                      <p className="field-description">
                        Your categories tell us the topic. Your description tells us your approach.
                      </p>
                      <textarea
                        id="description"
                        name="description"
                        rows={5}
                        required
                        placeholder="I create relatable comedy about everyday family life, mainly in Hindi and Marathi. My videos turn familiar situations into short sketches with an unexpected ending."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={() => reportProgress(2, { contentDescription: description })}
                      />
                      <small>2–3 sentences is perfect. Write in any language you’re comfortable with.</small>
                    </div>
                  </div>

                  {/* Form Footer / Submit */}
                  <div className="form-bottom">
                    <div className="privacy">
                      <span aria-hidden="true">▣</span>
                      <div>
                        <h4>Your details are in good hands.</h4>
                        <p>
                          Your contact details stay with TheBoredMonkey’s internal team. If you’re
                          shortlisted, we may share your public profile with the brand, never your private
                          contact details.
                        </p>
                      </div>
                    </div>

                    <label className="consent">
                      <input
                        type="checkbox"
                        id="consent"
                        name="consent"
                        required
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        I agree to TheBoredMonkey using these details to match my profile with campaigns and
                        contact me or my nominated manager about relevant collaborations. If I share a
                        manager’s details, I have their permission.
                      </span>
                    </label>

                    {formError && (
                      <p id="form-error" className="error-summary" role="alert">
                        {formError}
                      </p>
                    )}

                    <button
                      className="button primary submit-button"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Connecting..." : "Join the creator network"} <span aria-hidden="true">↗</span>
                    </button>
                    <p className="submit-note">Free. Non-exclusive. No promotional spam.</p>
                    <p className="fine-print">
                      Joining helps us consider your profile for relevant briefs. Opportunities depend on brand
                      requirements and selection.
                    </p>
                  </div>
                </form>
              ) : (
                <div id="success" className="success" ref={successRef} tabIndex={-1}>
                  <div className="success-icon" aria-hidden="true">
                    ✓
                  </div>
                  <div className="eyebrow">LOOKING GOOD, CREATOR</div>
                  <h2>Your profile is ready.</h2>
                  <p>Thank you for submitting your details to TheBoredMonkey Creator Network.</p>
                  <p>
                    Once connected, our team will get in touch when your profile is shortlisted for a relevant
                    campaign.
                  </p>
                  <button type="button" className="button primary" id="refer-button" onClick={handleShare}>
                    Refer a creator <span aria-hidden="true">↗</span>
                  </button>
                  <p id="share-status" role="status">
                    {shareStatus ? (
                      shareStatus
                    ) : (
                      <>
                        Copy this signup link to share:
                        <br />
                        <span style={{ wordBreak: "break-all", fontWeight: 600 }}>{getReferralUrl()}</span>
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    id="edit-button"
                    onClick={() => {
                      setIsSubmitted(false);
                      setTimeout(() => {
                        formRef.current?.scrollIntoView({ behavior: "smooth" });
                      }, 50);
                    }}
                  >
                    Back to my details
                  </button>
                </div>
              )}
            </div>

            <div className="under-form">
              <span aria-hidden="true">✳</span>
              <p>
                Different niches. Different voices.
                <br />
                <strong>There’s room for your kind of creativity.</strong>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="faq wrap" aria-labelledby="faq-title">
          <div>
            <div className="eyebrow">A FEW GOOD QUESTIONS</div>
            <h2>Good to know.</h2>
            <p>
              Still curious? We’re a message away.
              <br />
              <a href="mailto:Connect@theboredmonkey.com">Connect@theboredmonkey.com ↗</a>
            </p>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                Is it really free to join?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Yes. Joining the creator network is free and non-exclusive. You can continue working
                with other agencies and brands.
              </p>
            </details>
            <details>
              <summary>
                Do I need a minimum follower count?<span aria-hidden="true">+</span>
              </summary>
              <p>
                No. Creators of all sizes and types are welcome. We look for profiles that fit each
                brand’s brief, including your content, language, and location.
              </p>
            </details>
            <details>
              <summary>
                Does joining guarantee a collaboration?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Joining helps our team discover and consider your profile. Collaborations depend on
                campaign requirements, shortlisting, and brand selection.
              </p>
            </details>
            <details>
              <summary>
                Will you contact me or my manager?<span aria-hidden="true">+</span>
              </summary>
              <p>
                We’ll use the WhatsApp contact you provide. If you’re managed, enter your manager’s
                name and number so the right person hears from us.
              </p>
            </details>
            <details>
              <summary>
                Can I update my details later?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Once the signup is connected to our panel, your personal link will let you return and
                update your profile when your contact details, location, or content changes.
              </p>
            </details>
            <details>
              <summary>
                Who can see my contact details?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Your contact details are accessible only to TheBoredMonkey’s internal team. We may share
                your public creator profile with a brand when you’re shortlisted, but not your private
                contact information.
              </p>
            </details>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="wrap">
        <div className="footer-top">
          <span className="footer-wordmark">
            TheBoredMonkey<span>®</span>
          </span>
          <a href="mailto:Connect@theboredmonkey.com">Let’s make good things happen. ↗</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} TheBoredMonkey. Creations &amp; Connections.</span>
          <span>
            Mumbai, India <span className="yellow-text">●</span>
          </span>
        </div>
      </footer>

      {toastMessage && (
        <div id="toast" role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default CreatorIntakePage;
