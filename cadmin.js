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
                formattedDate = new Date(app.timestamp).toLocaleDateString();
            }

            // Portfolio link helper
            let portfolioLink = app.portfolio ? 
                `<a href="${app.portfolio}" target="_blank" class="text-emerald-400 hover:underline inline-flex items-center gap-1">Link <i data-lucide="external-link" class="w-3 h-3"></i></a>` : 
                '<span class="text-slate-500">None</span>';

            row.innerHTML = `
                <td class="p-4 text-xs text-slate-400 whitespace-nowrap">${formattedDate}</td>
                <td class="p-4 text-sm font-semibold text-white capitalize">${app.position || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-300">${app.discord || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-300">${app.vrchat || 'N/A'}</td>
                <td class="p-4 text-sm text-slate-400">${app.availability || 'N/A'}</td>
                <td class="p-4 text-sm">${portfolioLink}</td>
                <td class="p-4 text-sm">
                    <span class="px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-full text-xs font-medium">
                        ${app.status || 'Pending'}
                    </span>
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

// Load automatically when page opens
loadApplications();