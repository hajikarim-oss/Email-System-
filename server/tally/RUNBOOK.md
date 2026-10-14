# Tally Prime ↔ TBM CFO System Operations Runbook

## 1. Quick Overview

This runbook guides finance, operations, and IT teams on operating, monitoring, and troubleshooting the **Tally Prime ↔ TBM CFO Dashboard continuous sync bridge**.

### Key System Characteristics
* **Outbound Only:** The desktop machine opens **no inbound ports**. Tally loopback (`127.0.0.1:9000`) is strictly local.
* **Continuous 24/7 Sync:** The agent polls Tally every 15 minutes (or on-demand) using Tally's monotonic `$ALTERID` watermark.
* **Zero Duplicate Guarantee:** Dual-layer idempotency ensures that restarting the agent or re-running syncs never produces duplicate records.

---

## 2. Desktop Setup Guide (Client Windows PC)

### Step 1: Configure Tally Prime Port 9000
1. Open **Tally Prime** on the desktop.
2. In the top menu, press **F1 (Help)** > select **Settings** > select **Connectivity**.
3. Under **Client/Server configuration**:
   * Set **TallyPrime acts as**: **`Both`** (or `Server`).
   * Set **Port**: **`9000`**.
4. Press **Ctrl + A** to save. Restart Tally Prime if prompted.
5. Load the target company (e.g., *"The Brand Master Pvt Ltd"*).

### Step 2: Verify Connection via Probe
Open PowerShell/Command Prompt in the project folder and run:
```bash
npx tsx server/tally/probe.ts
```
Expected output:
```
✅ SUCCESS: Tally Prime is OPEN and RESPONDING on port 9000!
🏢 ACTIVE TALLY COMPANY DETAILS:
   • Company Name : The Brand Master Pvt Ltd
   • Company GUID : TBM-MUMBAI-2025-001
   • Books from   : 2025-04-01
```

### Step 3: Run the Continuous Agent
Run either:
```bash
server\tally\install-service.bat
```
or via terminal:
```bash
npx tsx server/tally/agent.ts
```

---

## 3. Operational Health States

The desktop agent reports 5 distinct states to the cloud dashboard:

| State | Indicator | Description & Recommended Action |
|-------|-----------|----------------------------------|
| **`ONLINE_READY`** | 🟢 Emerald | Tally is running, port 9000 is responsive, target company matches. Normal sync in progress. |
| **`TALLY_OFFLINE`** | 🔴 Rose | Windows machine is on, but Tally Prime is closed or port 9000 is disabled. Open Tally Prime on the desktop. |
| **`COMPANY_MISMATCH`** | 🟡 Amber | Tally is open, but a different company file is active. Switch to the target legal book company in Tally (Alt + F3). |
| **`COMPANY_CLOSED`** | 🟡 Amber | Tally is at the "Select Company" screen with no company loaded. Select and load the company. |
| **`OFFLINE`** | ⚫ Grey | Desktop machine is powered off, sleeping, or disconnected from the internet. |

---

## 4. Common Troubleshooting Scenarios

### Scenario A: Dashboard Shows "Tally Offline"
1. Check if Tally Prime is open on the desktop machine.
2. Run `npx tsx server/tally/probe.ts` to diagnose whether port 9000 is answering.
3. If probe returns `ECONNREFUSED`, verify F1 > Settings > Connectivity > Client/Server configuration in Tally Prime.

### Scenario B: Internet Drops on Desktop for Hours/Days
1. **No Data Loss:** The agent buffers all vouchers locally in `.tally_offline_buffer.json`.
2. **Auto-Recovery:** When internet restores, the agent automatically flushes the local buffer to the cloud and resumes incremental sync from the last `$ALTERID` watermark.

### Scenario C: Forcing a Full Re-Sync
If you ever need to re-import all historical vouchers from scratch:
1. In PostgreSQL, reset the checkpoint:
   ```sql
   UPDATE tally_sync_checkpoints SET last_alter_id = 0 WHERE entity_type = 'VOUCHERS';
   ```
2. Trigger sync from the dashboard: Click **"Sync Tally Now"** in the Right-Side Panel.
3. The agent will re-fetch all historical records. Because of `ON CONFLICT (tally_guid) DO UPDATE`, existing records are updated with zero duplicates.

### Scenario D: Amount Variance Beyond ±₹100
1. Open the dashboard at `/app/finance/reconcile`.
2. Review the flagged discrepancy row (shows Dashboard value vs Tally actual).
3. If Tally is correct (legal book of accounts), click **"Accept Tally"** to align the dashboard number with Tally.
