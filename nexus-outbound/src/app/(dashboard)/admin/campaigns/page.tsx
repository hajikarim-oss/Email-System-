"use client";

import React from "react";
import { FolderOpen } from "lucide-react";

export default function AdminCampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">All Team Campaigns</h2>
        <p className="text-sm text-gray-400">Master view across all campaigns created by team members</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111128] p-6 text-center">
        <FolderOpen className="mx-auto h-12 w-12 text-gray-500 mb-3" />
        <h3 className="text-lg font-semibold text-white">Master Campaign View</h3>
        <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">
          As master admin, all campaign sequences and lead progress across all 10 team seats will be listed here.
        </p>
      </div>
    </div>
  );
}
