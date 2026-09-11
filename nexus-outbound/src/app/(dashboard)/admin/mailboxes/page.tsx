"use client";

import React from "react";
import { Server } from "lucide-react";

export default function AdminMailboxesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">System Mailbox Health & Circuit Breakers</h2>
        <p className="text-sm text-gray-400">Monitor send limits, warmup schedules, and automated pause states</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111128] p-6 text-center">
        <Server className="mx-auto h-12 w-12 text-gray-500 mb-3" />
        <h3 className="text-lg font-semibold text-white">Mailbox Health Monitor</h3>
        <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">
          Automated circuit breakers pause sending accounts when 24h bounce rates cross 5% or spam complaints exceed 3.
        </p>
      </div>
    </div>
  );
}
