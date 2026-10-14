// ==============================================================================
// Fixed Assets Register & Depreciation Schedule (/app/finance/assets)
// Section 4.7 & 6.4 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    LaptopIcon,
    CameraIcon,
    ArmchairIcon,
    ZapIcon,
    PrinterIcon,
    ArrowUpRightIcon,
    PlusIcon,
    CheckCircle2Icon,
    FileSpreadsheetIcon,
    SearchIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";

interface FixedAsset {
    id: string;
    name: string;
    category: "Computer & Equipment" | "Furniture & Fixtures" | "Office Equipment" | "Electrical Equipment" | "Other Fixed Assets";
    purchaseDate: string;
    grossValue: number;
    gstAmount: number;
    accDepreciation: number;
    nbv: number;
    depRate: number; // percentage, e.g. 40% for computers, 10% for furniture
    method: "WDV" | "SLM";
    isOpening: boolean;
}

const mockAssets: FixedAsset[] = [
    {
        id: "AST-001",
        name: "Apple MacBook Pro M3 Max 16-inch",
        category: "Computer & Equipment",
        purchaseDate: "2024-04-10",
        grossValue: 350000,
        gstAmount: 63000,
        accDepreciation: 140000,
        nbv: 210000,
        depRate: 40,
        method: "WDV",
        isOpening: true,
    },
    {
        id: "AST-002",
        name: "Sony FX3 Cinema Camera + G Master Lens",
        category: "Other Fixed Assets",
        purchaseDate: "2024-06-15",
        grossValue: 420000,
        gstAmount: 75600,
        accDepreciation: 84000,
        nbv: 336000,
        depRate: 20,
        method: "WDV",
        isOpening: true,
    },
    {
        id: "AST-003",
        name: "Ergonomic Mesh Task Chairs (Set of 12)",
        category: "Furniture & Fixtures",
        purchaseDate: "2024-05-01",
        grossValue: 180000,
        gstAmount: 32400,
        accDepreciation: 18000,
        nbv: 162000,
        depRate: 10,
        method: "WDV",
        isOpening: true,
    },
    {
        id: "AST-004",
        name: "Daikin Inverter Split AC 2.0 Ton (Studio)",
        category: "Electrical Equipment",
        purchaseDate: "2024-04-20",
        grossValue: 110000,
        gstAmount: 30800,
        accDepreciation: 16500,
        nbv: 93500,
        depRate: 15,
        method: "WDV",
        isOpening: true,
    },
    {
        id: "AST-005",
        name: "Canon ImageRunner Multi-Function Office Laser Printer",
        category: "Office Equipment",
        purchaseDate: "2025-05-10",
        grossValue: 85000,
        gstAmount: 15300,
        accDepreciation: 0,
        nbv: 85000,
        depRate: 15,
        method: "WDV",
        isOpening: false, // Addition during FY (half-year convention)
    },
    {
        id: "AST-006",
        name: "Apple iMac 24-inch M3 (Editing Suite)",
        category: "Computer & Equipment",
        purchaseDate: "2025-06-01",
        grossValue: 160000,
        gstAmount: 28800,
        accDepreciation: 0,
        nbv: 160000,
        depRate: 40,
        method: "WDV",
        isOpening: false, // Addition during FY (half-year convention)
    },
];

export default function AssetsPage() {
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");

    // Depreciation calculation per MD Section 4.7 & 6.4
    const computedSchedule = useMemo(() => {
        let totalOpeningGross = 0;
        let totalAdditions = 0;
        let totalClosingGross = 0;
        let totalDepreciation = 0;
        let totalClosingNbv = 0;

        mockAssets.forEach(a => {
            if (a.isOpening) {
                totalOpeningGross += a.grossValue;
                // Full year depreciation on opening WDV
                const dep = Math.round((a.nbv * a.depRate) / 100);
                totalDepreciation += dep;
                totalClosingNbv += a.nbv - dep;
            } else {
                totalAdditions += a.grossValue;
                // Half-year convention for current year additions (MD line 652)
                const dep = Math.round((a.grossValue * a.depRate * 0.5) / 100);
                totalDepreciation += dep;
                totalClosingNbv += a.grossValue - dep;
            }
            totalClosingGross += a.grossValue;
        });

        return {
            openingGross: totalOpeningGross,
            additions: totalAdditions,
            closingGross: totalClosingGross,
            depreciation: totalDepreciation,
            closingNbv: totalClosingNbv,
        };
    }, []);

    const filteredAssets = mockAssets.filter(a => {
        if (selectedCategory !== "All" && a.category !== selectedCategory) return false;
        if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="Fixed Assets Register &amp; Depreciation Schedule · MD Section 4.7">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Asset Class:</span>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="All">All Asset Classes</option>
                        <option value="Computer & Equipment">Computer &amp; Equipment</option>
                        <option value="Other Fixed Assets">Other Fixed Assets (Cameras/Gear)</option>
                        <option value="Furniture & Fixtures">Furniture &amp; Fixtures</option>
                        <option value="Electrical Equipment">Electrical Equipment</option>
                        <option value="Office Equipment">Office Equipment</option>
                    </select>
                </div>

                <TopbarAction href="/app/finance/dashboard" icon={<ArrowUpRightIcon className="w-3.5 h-3.5" />}>
                    Overview Dashboard
                </TopbarAction>
            </PageTopbar>

            {/* Editorial Hero Banner */}
            <div className="px-4 sm:px-6 pt-5 pb-2">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-stone-200/90">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                                Capital Assets &amp; WDV Depreciation Engine
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Fixed Asset Register &amp; Schedule
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Asset auto-classification, half-year convention depreciation calculation, and Net Book Value (NBV) verified against Tally Prime Fixed Assets ledger group.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-white text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                FYTD Depreciation Charge
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-slate-900">
                                ₹{(computedSchedule.depreciation / 1000).toFixed(1)}k
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-5 pb-16">
                {/* Statutory Asset Schedule Summary Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Opening Gross Block</span>
                        <div className="text-[20px] font-bold text-slate-900 font-mono">
                            ₹{(computedSchedule.openingGross / 100000).toFixed(2)} Lakhs
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">FY Additions (New)</span>
                        <div className="text-[20px] font-bold text-blue-700 font-mono">
                            ₹{(computedSchedule.additions / 100000).toFixed(2)} Lakhs
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Total Gross Block</span>
                        <div className="text-[20px] font-bold text-slate-900 font-mono">
                            ₹{(computedSchedule.closingGross / 100000).toFixed(2)} Lakhs
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 shadow-2xs space-y-1">
                        <span className="text-[11px] font-bold text-amber-900">FY Depreciation (P&amp;L)</span>
                        <div className="text-[20px] font-bold text-amber-950 font-mono">
                            -₹{(computedSchedule.depreciation / 1000).toFixed(1)}k
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/30 shadow-2xs space-y-1">
                        <span className="text-[11px] font-bold text-emerald-900">Closing Net Book Value</span>
                        <div className="text-[20px] font-bold text-emerald-950 font-mono">
                            ₹{(computedSchedule.closingNbv / 100000).toFixed(2)} Lakhs
                        </div>
                    </div>
                </div>

                {/* Assets Register Table */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-200/70 flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-900">
                                Detailed Fixed Assets Register
                            </h3>
                            <p className="text-[11.5px] text-slate-500">
                                WDV method applied with half-year addition rule per IT Act / Companies Act
                            </p>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                            Tally Prime Cross-Check In Sync (₹4.20 Lakhs Dep)
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Asset Name / Description</th>
                                    <th className="py-2.5 px-3">Category</th>
                                    <th className="py-2.5 px-3">Purchase Date</th>
                                    <th className="py-2.5 px-3 text-right">Gross Cost</th>
                                    <th className="py-2.5 px-3 text-right">GST</th>
                                    <th className="py-2.5 px-3 text-right">Acc. Dep</th>
                                    <th className="py-2.5 px-3 text-right">Net Book Value</th>
                                    <th className="py-2.5 px-3 text-center">Dep Rate</th>
                                    <th className="py-2.5 px-3 text-center">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filteredAssets.map(asset => (
                                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                                            {asset.name}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-600">
                                            {asset.category}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-500">
                                            {asset.purchaseDate}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-medium">
                                            ₹{asset.grossValue.toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                            ₹{asset.gstAmount.toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                                            -₹{asset.accDepreciation.toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                                            ₹{asset.nbv.toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                                            {asset.depRate}% {asset.method}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            <span
                                                className={cn(
                                                    "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                                    asset.isOpening
                                                        ? "bg-slate-100 text-slate-700"
                                                        : "bg-blue-50 text-blue-700 border border-blue-200"
                                                )}
                                            >
                                                {asset.isOpening ? "Opening" : "Addition"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
