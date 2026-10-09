export const SYSTEM_CONTEXT = {
  name: "Email System 101",
  version: "1.0.0",
  description: "Next-gen cold email outreach & intelligence system",
  diagnostics: {
    loginError: {
      rootCauses: [
        "Incorrect email or password",
        "DATABASE_URL missing or unable to reach Supabase/PostgreSQL",
        "Session expired or revoked in database",
        "CORS origin mismatch between frontend and backend"
      ],
      solutions: [
        "Verify credentials and check if user exists in User table",
        "Ensure DATABASE_URL is valid and accessible",
        "Clear cookies/localStorage and try logging in again",
        "Check backend console logs for auth errors"
      ]
    },
    campaignVisibilityIssue: {
      rootCauses: [
        "User does not have access to this campaign (multi-tenant scope)",
        "Campaign status filter hiding inactive campaigns",
        "Database sync lag between Smartlead and local DB",
        "Frontend cache is displaying stale campaign list"
      ],
      solutions: [
        "Verify campaign ownership (userId) in database",
        "Check user team membership if campaign belongs to a team",
        "Trigger a manual campaign sync via Smartlead sync API",
        "Refresh browser cache to fetch latest campaign data"
      ]
    }
  }
};

export default SYSTEM_CONTEXT;
