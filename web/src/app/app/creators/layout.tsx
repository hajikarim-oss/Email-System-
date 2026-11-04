import React from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { UsersIcon, TagIcon, LayersIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import useFeatureAccess from "@/hooks/useFeatureAccess";

const TABS = [
    { label: "All Creators", path: "", Icon: UsersIcon },
    { label: "Creator Templates", path: "/templates", Icon: FileTextIcon },
] as const;

export default function CreatorsLayout() {
    const access = useFeatureAccess();
    const { pathname } = useLocation();
    const current = pathname.replace(/\/$/, "");

    if (!access.canViewCreators) {
        return <Navigate to="/app/dashboard" replace />;
    }

    return (
        <div className="flex flex-col min-h-full">
            {/* Tab Strip identical to ContactsLayout */}
            <div className="shrink-0 px-3 flex items-center gap-1 border-b border-slate-200 bg-white dark:bg-[#18181B] dark:border-zinc-800 overflow-x-auto no-scrollbar">
                {TABS.map(({ label, path, Icon }) => {
                    const to = `/app/creators${path}`;
                    const active = path === "" ? current === to : current.startsWith(to);

                    return (
                        <Link
                            key={path || "all"}
                            to={to}
                            className={`relative h-10 px-3 inline-flex items-center gap-1.5 text-[12.5px] transition-colors ${
                                active
                                    ? "text-slate-900 dark:text-white font-medium"
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{label}</span>
                            {active && (
                                <motion.span
                                    layoutId="creators-tab-underline"
                                    className="absolute left-1.5 right-1.5 -bottom-px h-0.5 rounded-full bg-[#18181B] dark:bg-white"
                                    transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
                                />
                            )}
                        </Link>
                    );
                })}
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
                <Outlet />
            </div>
        </div>
    );
}

