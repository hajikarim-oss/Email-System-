"use client";

import React from "react";
import { ScrollText } from "lucide-react";

export default function AdminAuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">System Audit Log</h2>
        <p className="text-sm text-gray-400">Immutable trail of campaign launches, lead imports, and administrative actions</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111128] p-6 text-center">
        <ScrollText className="mx-auto h-12 w-12 text-gray-500 mb-3" />
        <h3 className="text-lg font-semibold text-white">Audit Trail</h3>
        <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">
          All team member actions, campaign state changes, AI draft sends, and mailbox pauses are recorded for audit compliance.
        </p>
      </div>
    </div>
  );
}
