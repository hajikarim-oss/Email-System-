import React from "react";
import { Loading } from "../loader";

export default function AuthButton({ children, loading }: { children: React.ReactNode, loading: boolean }) {
    return (
        <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg bg-[#FFE600] hover:bg-[#f5dc00] active:bg-[#e6ce00] text-zinc-900 font-semibold text-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_rgba(255,230,0,0.35)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_rgba(255,230,0,0.45)] active:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_6px_rgba(255,230,0,0.25)] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
        >
            {!loading ? children : (
                <Loading className="!w-5 h-5 text-zinc-900" />
            )}
        </button>
    )
}
