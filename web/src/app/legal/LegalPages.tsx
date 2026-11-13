import React from "react";

const pageStyle: React.CSSProperties = {
  maxWidth: "760px",
  margin: "40px auto",
  padding: "32px 24px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#1c1917",
  lineHeight: 1.65,
  fontSize: "15px",
  background: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e7e5e4",
};

export function PrivacyPolicyPage() {
  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>Privacy Policy</h1>
      <p style={{ color: "#78716c", fontSize: "13px", marginBottom: "24px" }}>
        Last updated: November 13, 2026 · TheBoredMonkey (Creations &amp; Connections)
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>1. Information We Collect</h2>
      <p>
        TheBoredMonkey collects information provided directly by creators and brand partners through our intake forms
        and connected integrations, including:
      </p>
      <ul>
        <li>Contact details: Name, email address, phone number, and location.</li>
        <li>Public social media information: Instagram handle, public follower count, and media metrics.</li>
        <li>
          Connected Insights: When you explicitly authorize Instagram Graph API connection, we receive read-only
          aggregated metrics (engagement rates, follower counts, and reach) to match you with brand collaboration briefs.
        </li>
      </ul>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>2. How We Use Information</h2>
      <p>
        We use this data solely to:
      </p>
      <ul>
        <li>Review creator profiles for matching with relevant brand campaigns.</li>
        <li>Contact creators or their designated managers regarding collaboration opportunities.</li>
        <li>Process collaboration deliverables and agreed commercial payments.</li>
      </ul>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>3. Data Protection &amp; Sharing</h2>
      <p>
        We do not sell, rent, or trade creator or partner personal data. Data is shared with brand clients only in
        an aggregated creator pitch context with creator consent.
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>4. Contact &amp; Data Rights</h2>
      <p>
        You have the right to request access, correction, or deletion of your data at any time. Contact us at{" "}
        <a href="mailto:hajikarimbeldaar@gmail.com" style={{ color: "#ca8a04" }}>
          hajikarimbeldaar@gmail.com
        </a>.
      </p>
    </div>
  );
}

export function TermsOfServicePage() {
  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>Terms of Service</h1>
      <p style={{ color: "#78716c", fontSize: "13px", marginBottom: "24px" }}>
        Last updated: November 13, 2026 · TheBoredMonkey (Creations &amp; Connections)
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>1. Acceptance of Terms</h2>
      <p>
        By accessing or using TheBoredMonkey creator platform and intake services, you agree to these Terms of Service.
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>2. Non-Exclusive Network</h2>
      <p>
        Joining TheBoredMonkey Creator Network is 100% free and strictly non-exclusive. You retain full ownership of
        all your content, channels, and commercial decisions.
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>3. Accuracy of Provided Information</h2>
      <p>
        Creators agree to provide accurate channel links, contact info, and pricing representations.
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>4. Contact</h2>
      <p>
        For inquiries regarding these terms, reach us at{" "}
        <a href="mailto:hajikarimbeldaar@gmail.com" style={{ color: "#ca8a04" }}>
          hajikarimbeldaar@gmail.com
        </a>.
      </p>
    </div>
  );
}

export function DataDeletionPage() {
  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>User Data Deletion Instructions</h1>
      <p style={{ color: "#78716c", fontSize: "13px", marginBottom: "24px" }}>
        TheBoredMonkey · User Data Management
      </p>

      <p>
        In accordance with Meta platform policies and global data protection regulations, users have the right to
        request the deletion of all data collected through TheBoredMonkey and connected Instagram integrations.
      </p>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>How to Request Data Deletion</h2>
      <ol style={{ paddingLeft: "20px" }}>
        <li>
          Send an email to{" "}
          <a href="mailto:hajikarimbeldaar@gmail.com" style={{ color: "#ca8a04" }}>
            hajikarimbeldaar@gmail.com
          </a>{" "}
          with the subject line: <strong>&quot;Data Deletion Request&quot;</strong>.
        </li>
        <li>Include your Instagram handle and the email address used on the creator intake form.</li>
        <li>
          Upon receiving your request, our team will permanently delete your stored profile metrics, insights cache,
          and contact records from our database within 48 hours.
        </li>
        <li>You will receive a confirmation email once your data has been completely erased.</li>
      </ol>

      <h2 style={{ fontSize: "18px", marginTop: "24px" }}>Removing App Permissions Directly in Instagram</h2>
      <p>
        You can also revoke access directly at any time from your Instagram or Facebook account:
      </p>
      <ol style={{ paddingLeft: "20px" }}>
        <li>Go to your Facebook / Instagram Settings &amp; Privacy.</li>
        <li>Navigate to <strong>Apps and Websites</strong>.</li>
        <li>Find <strong>TheBoredMonkey</strong> and click <strong>Remove</strong>.</li>
      </ol>
    </div>
  );
}
