// Shared visual tokens for the auth surfaces.

// One equal-width alternative-sign-in cell (Passkey / Google / Apple). Kept
// here so every cell is pixel-identical and Fast Refresh stays happy (no
// non-component exports from the component files).
export const AUTH_CELL =
    "flex items-center justify-center gap-2 h-11 rounded-lg border border-amber-200/70 bg-white text-[13px] font-medium text-slate-600 hover:bg-[#FFF9DB] hover:border-amber-200 hover:text-slate-800 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none";
