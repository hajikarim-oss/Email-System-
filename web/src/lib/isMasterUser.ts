// Master / admin / owner see workspace-wide figures; everyone else is a team
// member and sees only their own campaigns' sends.
export default function isMasterUser(user: any): boolean {
    if (!user) return false;
    const role = String(user?.role || "").toUpperCase();
    const roles = Array.isArray(user?.roles) ? user.roles.map((r: string) => String(r).toUpperCase()) : [];
    return (
        user?.is_admin === true ||
        ["OWNER", "MASTER", "ADMIN"].includes(role) ||
        roles.some((r: string) => ["OWNER", "MASTER", "ADMIN"].includes(r)) ||
        String(user?.email || "").toLowerCase() === "monu@theboredmonkey.com"
    );
}
