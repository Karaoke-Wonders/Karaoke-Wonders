// Replace with your actual Google Apps Script Web App URL
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby0X1lfDNDQUr6Dv26DcBtJ1ufCSUN4izVTYkVtx72_q-hKs5KnO1eAQJOu2Y5gRQIC/exec';

async function loadApplications() {
    const tableBody = document.getElementById('admin-table-body');
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="p-8 text-center text-sm text-slate-400">
                Refreshing applications...
            </td>
        </tr>
    `;

    try {
        const response = await fetch(WEB_APP_URL);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error || "Failed to fetch sheet data.");

        tableBody.innerHTML = '';

        if (result.applications.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-sm text-slate-400">
                        No applications found yet.
                    </td>
                </tr>
            `;
            return;
        }

        // Loop through each row returned from Google Sheets
        result.applications.forEach(app => {
            const row = document.createElement('tr');
            row.className = "hover:bg-white/[0.02] transition-colors";

            // Format date nicely if available
            let formattedDate = "N/A";
            if (app.timestamp) {
                const parsedDate = new Date(app.timestamp);
                if (!isNaN(parsedDate)) formattedDate = parsedDate.toLocaleDateString();
                else formattedDate = app.timestamp;
            }

            // Portfolio link helper
            let portfolioLink = app.portfolio && app.portfolio !== 'none' ? 
                `<a href="${app.portfolio}" target="_blank" class="text-emerald-400 hover:underline inline-flex items-center gap-1">Link <i data-lucide="external-link" class="w-3 h-3"></i></a>` : 
                '<span class="text-slate-500">None</span>';

            // Status badge color styling
            const status = app.status || 'Pending';
            let statusBadgeClass = "bg-yellow-500/10 border-yellow-500/20 text-yellow-300";
            if (status.toLowerCase() === 'approved') {
                statusBadgeClass = "bg-emerald-500/10 border-emerald-500/20 text-emerald-300";
            } else if (status.toLowerCase() === 'rejected') {
                statusBadgeClass = "bg-red-500/10 border-red-500/20 text-red-300";
            }

            row.innerHTML = `
                <td class="p-4 text-xs text-slate-400 whitespace-nowrap">${formattedDate}</td>
                <td class="p-4 text-sm font-semibold text-white capitalize">${app.position || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-300">${app.discord || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-300">${app.vrchat || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-300">${app.why_apply || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-400">${app.availability || 'N/A'}</td>
                <td class="p-4 text-sm">${portfolioLink}</td>
                <td class="p-4 text-sm">
                    <div class="flex items-center justify-between gap-2">
                        <span class="px-2.5 py-1 border rounded-full text-xs font-medium ${statusBadgeClass}">
                            ${status}
                        </span>
                        <div class="flex items-center gap-1">
                            <button onclick="updateStatus('${app.discord}', '${app.vrchat}', 'Approved')" title="Approve" class="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-colors cursor-pointer">
                                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="updateStatus('${app.discord}', '${app.vrchat}', 'Rejected')" title="Reject" class="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors cursor-pointer">
                                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="deleteApplication('${app.discord}', '${app.vrchat}')" title="Delete" class="p-1.5 rounded-lg bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 transition-colors cursor-pointer">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Re-run lucide icons to render any newly injected icons
        lucide.createIcons();

    } catch (err) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-sm text-red-400">
                    Error loading data: ${err.message}
                </td>
            </tr>
        `;
    }
}

async function updateStatus(discord, vrchat, newStatus) {
    if (!confirm(`Are you sure you want to mark ${discord} as ${newStatus}?`)) return;

    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "updateStatus",
                discord: discord,
                vrchat: vrchat,
                newStatus: newStatus
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed to update status");

        loadApplications();
    } catch (err) {
        alert("Error updating status: " + err.message);
    }
}

async function deleteApplication(discord, vrchat) {
    if (!confirm(`Are you sure you want to permanently delete the application for ${discord}?`)) return;

    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "deleteApplication",
                discord: discord,
                vrchat: vrchat
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed to delete application");

        loadApplications();
    } catch (err) {
        alert("Error deleting application: " + err.message);
    }
}

// Load automatically when page opens
loadApplications();