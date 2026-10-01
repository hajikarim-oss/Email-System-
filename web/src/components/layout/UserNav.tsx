// User menu — bottom of the sidebar.
//
// Moved off the shadcn DropdownMenu onto the same PopoverMenu primitive
// every other dropdown in the dashboard uses (folders, sort, accounts,
// org switcher). One animation curve, one surface, one set of styles.
//
// Opens upward (side="top") from the trigger so the popover settles up
// from the bottom of the sidebar instead of falling off-screen.

import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    LogOutIcon,
    SettingsIcon,
} from "lucide-react";
import { useAppStore } from "@/stores";
import useLogout from "@/lib/api/hooks/auth/useLogout";
import { UserContext } from "@/hooks/context/user";
import useFeatureAccess from "@/hooks/useFeatureAccess";
import {
    PopoverMenu,
    PopoverMenuContent,
    PopoverMenuItem,
    PopoverMenuSeparator,
    PopoverMenuTrigger,
} from "@/components/ui/popover-menu";

export function UserNav() {
    const navigate = useNavigate();
    const storeUser = useAppStore((s) => s.user);
    const userCtx = useContext(UserContext);
    const user = userCtx?.user || storeUser;
    const access = useFeatureAccess();
    const logoutMutation = useLogout();

    if (!user) return null;

    const handleLogout = async () => {
        await logoutMutation.mutateAsync();
        toast.success("Signed out successfully");
        navigate("/auth/login?force=true", { replace: true });
    };

    const userEmail = String(user?.email || (user as any)?.username || (user as any)?.senderEmail || "").trim();
    const firstName = typeof user?.first_name === "string" ? user.first_name.trim() : "";
    const lastName = typeof user?.last_name === "string" ? user.last_name.trim() : "";
    const initials = userEmail.length >= 2
        ? userEmail.slice(0, 2).toUpperCase()
        : firstName.length >= 2
            ? firstName.slice(0, 2).toUpperCase()
            : "US";

    const displayName =
        firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || (user as any)?.name || userEmail || "User";

    return (
        <PopoverMenu side="top" align="start">
            <PopoverMenuTrigger asChild>
                <button className="flex items-center gap-2.5 mx-3 my-2 px-1.5 py-1 rounded-md hover:bg-slate-200/40 transition-colors w-[calc(100%-1.5rem)] cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden">
                        {user.avatar_url ? (
                            <img
                                src={user.avatar_url}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-[11px] font-medium text-white leading-none">
                                {initials}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                        <div className="text-[13px] text-slate-900 truncate">
                            {displayName}
                        </div>
                        <div className="text-[10.5px] text-slate-500 truncate">
                            {userEmail}
                        </div>
                    </div>
                </button>
            </PopoverMenuTrigger>

            <PopoverMenuContent minWidth={232}>
                {/* Identity block — same name/email row but inside the
                    PopoverMenu chrome so it inherits the consistent
                    hairline border + shadow. */}
                <div className="px-3 py-2">
                    <div className="text-[12.5px] font-medium text-slate-900 truncate">
                        {displayName}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">
                        {userEmail}
                    </div>
                </div>
                {access.canManage && (
                    <>
                        <PopoverMenuSeparator />
                        <PopoverMenuItem
                            onSelect={() => navigate("/app/settings")}
                            icon={<SettingsIcon className="w-3 h-3" />}
                        >
                            Settings
                        </PopoverMenuItem>
                    </>
                )}
                <PopoverMenuSeparator />
                <PopoverMenuItem
                    onSelect={handleLogout}
                    icon={<LogOutIcon className="w-3 h-3" />}
                    disabled={logoutMutation.isPending}
                    danger
                >
                    {logoutMutation.isPending ? "Signing out…" : "Log out"}
                </PopoverMenuItem>
            </PopoverMenuContent>
        </PopoverMenu>
    );
}
