const totalTimeEl = document.getElementById("totalTime");
const siteCountEl = document.getElementById("siteCount");
const siteListEl = document.getElementById("siteList");
const todayLabelEl = document.getElementById("todayLabel");
const progressBarEl = document.getElementById("progressBar");
const refreshBtn = document.getElementById("refreshBtn");

function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes}m`;
    }

    return `${totalSeconds}s`;
}

function createSiteRow(domain, milliseconds, percentage) {
    const row = document.createElement("div");
    row.className = "site-row";

    const info = document.createElement("div");
    info.className = "site-info";

    const icon = document.createElement("div");
    icon.className = "site-icon";
    icon.textContent = domain.charAt(0).toUpperCase();

    const details = document.createElement("div");
    details.className = "site-details";

    const nameRow = document.createElement("div");
    nameRow.className = "site-name-row";

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = domain;
    name.title = domain;

    const time = document.createElement("span");
    time.className = "site-time";
    time.textContent = formatTime(milliseconds);

    const track = document.createElement("div");
    track.className = "site-progress";

    const fill = document.createElement("div");
    fill.style.width = `${percentage}%`;

    nameRow.append(name, time);
    track.appendChild(fill);
    details.append(nameRow, track);
    info.append(icon, details);
    row.appendChild(info);

    return row;
}

async function renderUsage() {
    siteListEl.replaceChildren();

    try {
        const response = await chrome.runtime.sendMessage({
            type: "GET_USAGE"
        });

        if (!response || response.error) {
            throw new Error("Unable to retrieve usage data.");
        }

        const sites = Object.entries(response.usage)
            .sort((a, b) => b[1] - a[1]);

        const total = sites.reduce((sum, site) => sum + site[1], 0);

        totalTimeEl.textContent = formatTime(total);
        siteCountEl.textContent =
            `${sites.length} website${sites.length === 1 ? "" : "s"} tracked`;

        todayLabelEl.textContent =
            new Date().toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
            });

        // The progress bar represents the share of an 8-hour target.
        progressBarEl.style.width =
            `${Math.min((total / (8 * 60 * 60 * 1000)) * 100, 100)}%`;

        if (sites.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent =
                "No activity yet. Browse a website to get started.";
            siteListEl.appendChild(empty);
            return;
        }

        for (const [domain, milliseconds] of sites) {
            const percentage = total > 0
                ? (milliseconds / total) * 100
                : 0;

            siteListEl.appendChild(
                createSiteRow(domain, milliseconds, percentage)
            );
        }
    } catch (error) {
        console.error(error);
        totalTimeEl.textContent = "--";

        const message = document.createElement("p");
        message.className = "empty";
        message.textContent =
            "Could not load activity. Reload the extension and try again.";

        siteListEl.appendChild(message);
    }
}

renderUsage();



const focusTimerEl = document.getElementById("focusTimer");
const focusStatusEl = document.getElementById("focusStatus");
const focusMessageEl = document.getElementById("focusMessage");
const focusBtn = document.getElementById("focusBtn");
const resetFocusBtn = document.getElementById("resetFocusBtn");
const focusDurationEl = document.getElementById("focusDuration");

let focusSession = {
    active: false,
    paused: false,
    endTime: null,
    remainingMs: 25 * 60 * 1000,
    durationMs: 25 * 60 * 1000
};

function renderFocus() {
    let remaining;

    if (focusSession.active && focusSession.endTime) {
        remaining = Math.max(
            0,
            Math.ceil((focusSession.endTime - Date.now()) / 1000)
        );
    } else {
        remaining = Math.ceil(
            (focusSession.remainingMs ?? focusSession.durationMs) / 1000
        );
    }

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    focusTimerEl.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (focusSession.active) {
        focusStatusEl.textContent = "In session";
        focusMessageEl.textContent = "Stay focused. One task at a time.";
        focusBtn.textContent = "Pause Focus";
        focusDurationEl.disabled = true;
    } else if (focusSession.paused && remaining > 0) {
        focusStatusEl.textContent = "Paused";
        focusMessageEl.textContent = "Resume when you're ready.";
        focusBtn.textContent = "Resume Focus";
        focusDurationEl.disabled = true;
    } else {
        focusStatusEl.textContent = "Ready";
        focusMessageEl.textContent = "Ready when you are.";
        focusBtn.textContent = "Start Focus";
        focusDurationEl.disabled = false;
    }
}

async function loadFocus() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "GET_FOCUS"
        });

        if (!response || response.error) {
            throw new Error(response?.error || "Could not load Focus Mode.");
        }

        focusSession = response;

        if (!focusSession.active && !focusSession.paused) {
            focusDurationEl.value = String(
                (focusSession.durationMs || 25 * 60 * 1000) / 60000
            );
        }

        renderFocus();
    } catch (error) {
        focusMessageEl.textContent = error.message;
    }
}

focusBtn.addEventListener("click", async () => {
    try {
        if (focusSession.active) {
            focusSession = await chrome.runtime.sendMessage({
                type: "STOP_FOCUS"
            });
        } else {
            const durationMinutes = Number(focusDurationEl.value);

            focusSession = await chrome.runtime.sendMessage({
                type: "START_FOCUS",
                durationMinutes
            });
        }

        if (focusSession.error) {
            throw new Error(focusSession.error);
        }

        renderFocus();
    } catch (error) {
        focusMessageEl.textContent = error.message;
    }
});

resetFocusBtn.addEventListener("click", async () => {
    try {
        focusSession = await chrome.runtime.sendMessage({
        type: "RESET_FOCUS",
        durationMinutes: Number(focusDurationEl.value)
        });

        if (focusSession.error) {
            throw new Error(focusSession.error);
        }

        focusDurationEl.disabled = false;
        focusDurationEl.value = String(
            (focusSession.durationMs || 25 * 60 * 1000) / 60000
        );

        renderFocus();
    } catch (error) {
        focusMessageEl.textContent = error.message;
    }
});

focusDurationEl.addEventListener("change", () => {
    const durationMs = Number(focusDurationEl.value) * 60 * 1000;

    focusSession = {
        active: false,
        paused: false,
        endTime: null,
        remainingMs: durationMs,
        durationMs
    };

    renderFocus();
});

loadFocus();

setInterval(renderFocus, 1000);


const blockForm = document.getElementById("blockForm");
const blockDomainInput = document.getElementById("blockDomain");
const blockedSitesEl = document.getElementById("blockedSites");
const blockerStatusEl = document.getElementById("blockerStatus");
const blockerMessageEl = document.getElementById("blockerMessage");

async function renderBlocklist() {
    const result = await chrome.runtime.sendMessage({
        type: "GET_BLOCKLIST"
    });

    if (!result || result.error) {
        blockerMessageEl.textContent =
            result?.error || "Could not load blocklist.";
        return;
    }

    blockerStatusEl.textContent = result.active ? "Active" : "Off";
    blockerStatusEl.classList.toggle("active", result.active);

    blockedSitesEl.replaceChildren();

    if (result.domains.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No blocked websites added yet.";
        blockedSitesEl.appendChild(empty);
        return;
    }

    result.domains.forEach(domain => {
        const row = document.createElement("div");
        row.className = "blocked-site";

        const name = document.createElement("span");
        name.textContent = domain;

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-block-btn";
        removeBtn.textContent = "Remove";

        removeBtn.addEventListener("click", async () => {
            blockerMessageEl.textContent = "";

            try {
                const response = await chrome.runtime.sendMessage({
                    type: "REMOVE_BLOCKED_SITE",
                    domain
                });

                if (response.error) {
                    throw new Error(response.error);
                }

                blockerMessageEl.textContent = "Website removed.";
                await renderBlocklist();
            } catch (error) {
                blockerMessageEl.textContent = error.message;
            }
        });

        row.append(name, removeBtn);
        blockedSitesEl.appendChild(row);
    });
}

blockForm.addEventListener("submit", async event => {
    event.preventDefault();

    const domain = blockDomainInput.value.trim();

    try {
        const response = await chrome.runtime.sendMessage({
            type: "ADD_BLOCKED_SITE",
            domain
        });

        if (response.error) {
            throw new Error(response.error);
        }

        blockDomainInput.value = "";
        blockerMessageEl.textContent = "Website added to blocklist.";

        await renderBlocklist();
    } catch (error) {
        blockerMessageEl.textContent = error.message;
    }
});

renderBlocklist();


const limitForm = document.getElementById("limitForm");
const limitDomainInput = document.getElementById("limitDomain");
const limitMinutesInput = document.getElementById("limitMinutes");
const limitMessageEl = document.getElementById("limitMessage");
const limitListEl = document.getElementById("limitList");

function createLimitRow(domain, usedMs, limitMinutes) {
    const limitMs = limitMinutes * 60 * 1000;
    const remainingMs = Math.max(0, limitMs - usedMs);
    const percentage = Math.min((usedMs / limitMs) * 100, 100);

    const row = document.createElement("div");
    row.className = "limit-row";

    const heading = document.createElement("div");
    heading.className = "limit-row-heading";

    const name = document.createElement("span");
    name.className = "limit-domain";
    name.textContent = domain;

    const status = document.createElement("span");
    status.className = "limit-status";
    status.textContent = remainingMs === 0 ? "Limit reached" : "Active";
    status.classList.toggle("limit-reached", remainingMs === 0);

    heading.append(name, status);

    const timeInfo = document.createElement("p");
    timeInfo.className = "limit-time-info";
    timeInfo.textContent =
        `${formatTime(usedMs)} used / ${limitMinutes}m allowed`;

    const remaining = document.createElement("p");
    remaining.className = "limit-remaining";
    remaining.textContent = remainingMs === 0
        ? "No time remaining today"
        : `${formatTime(remainingMs)} remaining today`;

    const track = document.createElement("div");
    track.className = "limit-progress";

    const fill = document.createElement("div");
    fill.className = "limit-progress-fill";
    fill.style.width = `${percentage}%`;
    fill.classList.toggle("limit-progress-full", remainingMs === 0);

    track.appendChild(fill);

    const actions = document.createElement("div");
    actions.className = "limit-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-limit-btn";
    editBtn.textContent = "Edit";

    editBtn.addEventListener("click", () => {
        limitDomainInput.value = domain;
        limitMinutesInput.value = limitMinutes;
        limitMessageEl.textContent = `Editing limit for ${domain}.`;
        limitMinutesInput.focus();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-limit-btn";
    removeBtn.textContent = "Remove";

    removeBtn.addEventListener("click", async () => {
        try {
            removeBtn.disabled = true;

            const response = await chrome.runtime.sendMessage({
                type: "REMOVE_SITE_LIMIT",
                domain
            });

            if (!response || response.error) {
                throw new Error(response?.error || "Could not remove limit.");
            }

            limitMessageEl.textContent = `Daily limit removed for ${domain}.`;
            await renderLimits();
            await renderUsage();
        } catch (error) {
            limitMessageEl.textContent = error.message;
            removeBtn.disabled = false;
        }
    });

    actions.append(editBtn, removeBtn);
    row.append(heading, timeInfo, remaining, track, actions);

    return row;
}

async function renderLimits() {
    limitListEl.replaceChildren();

    try {
        const response = await chrome.runtime.sendMessage({
            type: "GET_LIMITS"
        });

        if (!response || response.error) {
            throw new Error(response?.error || "Could not load daily limits.");
        }

        const limits = response.limits || {};
        const usage = response.usage || {};
        const domains = Object.keys(limits).sort();

        if (domains.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "No daily limits set yet.";
            limitListEl.appendChild(empty);
            return;
        }

        for (const domain of domains) {
            const limitMinutes = Number(limits[domain]);

            if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) {
                continue;
            }

            const usedMs = Math.max(0, Number(usage[domain]) || 0);

            limitListEl.appendChild(
                createLimitRow(domain, usedMs, limitMinutes)
            );
        }
    } catch (error) {
        console.error(error);

        const message = document.createElement("p");
        message.className = "empty";
        message.textContent = error.message;
        limitListEl.appendChild(message);
    }
}

limitForm.addEventListener("submit", async event => {
    event.preventDefault();

    const domain = limitDomainInput.value.trim();
    const minutes = Number(limitMinutesInput.value);

    if (!domain || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        limitMessageEl.textContent =
            "Enter a website and a whole-number limit from 1 to 1440 minutes.";
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            type: "SET_SITE_LIMIT",
            domain,
            minutes
        });

        if (!response || response.error) {
            throw new Error(response?.error || "Could not save daily limit.");
        }

        limitMessageEl.textContent = `Daily limit saved: ${minutes} minutes.`;
        limitForm.reset();

        await renderLimits();
        await renderUsage();
    } catch (error) {
        limitMessageEl.textContent = error.message;
    }
});

// Also refresh daily limits when the popup refresh button is clicked.
refreshBtn.addEventListener("click", async () => {
    await renderUsage();
    await renderLimits();
});

renderLimits();

// Refresh daily limit cards while the popup is open.
setInterval(() => {
    renderLimits();
}, 5000);
