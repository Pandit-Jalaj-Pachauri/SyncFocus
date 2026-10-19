const STORAGE_KEY = "syncFocusUsage";
const STATE_KEY = "syncFocusState";
const ALARM_NAME = "syncFocusTick";

const FOCUS_KEY = "syncFocusSession";
const FOCUS_ALARM = "syncFocusEnd";
const FOCUS_DURATION = 25 * 60 * 1000;

const BLOCKLIST_KEY = "syncFocusBlocklist";
const LIMITS_KEY = "syncFocusLimits";
const FIRST_BLOCK_RULE_ID = 1000;
const LAST_BLOCK_RULE_ID = 4999;

const MAX_CHECKPOINT_MS = 45 * 1000;

let currentDomain = null;
let lastUpdated = Date.now();
let windowFocused = false;
let initialized = false;
let operationQueue = Promise.resolve();

function runSafely(operation) {
    operationQueue = operationQueue
        .then(operation)
        .catch(error => console.error("SyncFocus:", error));

    return operationQueue;
}

function getDateKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getDomain(url) {
    try {
        const parsedUrl = new URL(url);

        if (
            parsedUrl.protocol !== "http:" &&
            parsedUrl.protocol !== "https:"
        ) {
            return null;
        }

        return parsedUrl.hostname.replace(/^www\./, "");
    } catch (error) {
        return null;
    }
}

async function saveState() {
    await chrome.storage.local.set({
        [STATE_KEY]: {
            currentDomain,
            lastUpdated,
            windowFocused
        }
    });
}

async function checkpoint() {
    const now = Date.now();

    if (
        initialized &&
        windowFocused &&
        currentDomain &&
        now >= lastUpdated
    ) {
        const elapsed = Math.min(
            now - lastUpdated,
            MAX_CHECKPOINT_MS
        );

        if (elapsed > 0) {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            const usage = result[STORAGE_KEY] || {};

            let start = now - elapsed;

            while (start < now) {
                const dateKey = getDateKey(start);
                const nextDay = new Date(start);
                nextDay.setHours(24, 0, 0, 0);

                const end = Math.min(now, nextDay.getTime());
                const duration = end - start;

                if (!usage[dateKey]) {
                    usage[dateKey] = {};
                }

                usage[dateKey][currentDomain] =
                    (usage[dateKey][currentDomain] || 0) + duration;

                start = end;
            }

                await chrome.storage.local.set({
                    [STORAGE_KEY]: usage
                });

            await syncBlockRules();
        }
    }

    lastUpdated = now;
    await saveState();
}

async function updateActiveTab() {
    const windows = await chrome.windows.getLastFocused();

    windowFocused =
        windows.focused &&
        windows.id !== chrome.windows.WINDOW_ID_NONE;

    const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
    });

    currentDomain = tabs.length
        ? getDomain(tabs[0].url || "")
        : null;

    lastUpdated = Date.now();
    initialized = true;

    await saveState();
}

async function handleChange() {
    if (!initialized) {
        await updateActiveTab();
        return;
    }

    await checkpoint();
    await updateActiveTab();
}

async function initialize() {
    if (initialized) {
        return;
    }

    const result = await chrome.storage.local.get(STATE_KEY);
    const previous = result[STATE_KEY];

    currentDomain = previous?.currentDomain || null;
    lastUpdated = Date.now();
    windowFocused = false;
    initialized = true;

    await updateActiveTab();

    await chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: 0.5
    });

    const session = await getFocusSession();

    if (session.active && session.endTime) {
        if (session.endTime <= Date.now()) {
            await stopFocusSession();
        } else {
            await chrome.alarms.create(FOCUS_ALARM, {
                when: session.endTime
            });
        }
    }

    // Restore blocker rules when Chrome starts.
    await syncBlockRules();
}

chrome.runtime.onInstalled.addListener(() => {
    runSafely(initialize);
});

chrome.runtime.onStartup.addListener(() => {
    runSafely(initialize);
});

chrome.alarms.onAlarm.addListener(alarm => {
    runSafely(async () => {
        if (alarm.name === ALARM_NAME) {
            await handleChange();
        }

        if (alarm.name === FOCUS_ALARM) {
            const session = await getFocusSession();

            if (session.active && Date.now() >= session.endTime) {
                await stopFocusSession();
            }
        }
    });
});

chrome.tabs.onActivated.addListener(() => {
    runSafely(handleChange);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (
        tab.active &&
        (changeInfo.url || changeInfo.status === "complete")
    ) {
        runSafely(handleChange);
    }
});

chrome.windows.onFocusChanged.addListener(() => {
    runSafely(handleChange);
});

// -------------------- Focus Mode --------------------

async function getFocusSession() {
    const data = await chrome.storage.local.get(FOCUS_KEY);

    return data[FOCUS_KEY] || {
        active: false,
        endTime: null
    };
}

async function stopFocusSession() {
    await chrome.alarms.clear(FOCUS_ALARM);

    const session = {
        active: false,
        endTime: null
    };

    // Save the inactive state before removing blocker rules.
    await chrome.storage.local.set({
        [FOCUS_KEY]: session
    });

    await syncBlockRules();

    return session;
}

async function startFocusSession() {
    const session = {
        active: true,
        endTime: Date.now() + FOCUS_DURATION
    };

    await chrome.storage.local.set({
        [FOCUS_KEY]: session
    });

    await chrome.alarms.create(FOCUS_ALARM, {
        when: session.endTime
    });

    // Activate website blocking for this session.
    await syncBlockRules();

    return session;
}

// -------------------- Website Blocker --------------------

async function getBlocklist() {
    const data = await chrome.storage.local.get(BLOCKLIST_KEY);
    return data[BLOCKLIST_KEY] || [];
}

function normalizeDomain(input) {
    let value = String(input || "").trim().toLowerCase();

    if (!value) {
        throw new Error("Enter a website domain.");
    }

    if (!value.includes("://")) {
        value = "https://" + value;
    }

    let url;

    try {
        url = new URL(value);
    } catch (error) {
        throw new Error("Enter a valid domain, like instagram.com.");
    }

    if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
    ) {
        throw new Error("Enter a valid website domain.");
    }

    if (!url.hostname.includes(".")) {
        throw new Error(
            "Enter a complete domain, like instagram.com."
        );
    }

    if (url.username || url.password) {
        throw new Error("Enter only the website domain.");
    }

    if (url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Enter only the domain, without a path.");
    }

    return url.hostname.replace(/^www\./, "");
}


async function getDailyLimits() {
    const data = await chrome.storage.local.get(LIMITS_KEY);
    return data[LIMITS_KEY] || {};
}

async function getTodayUsage() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const today = getDateKey(Date.now());

    return data[STORAGE_KEY]?.[today] || {};
}

async function syncBlockRules() {
    const session = await getFocusSession();
    const blocklist = await getBlocklist();
    const limits = await getDailyLimits();
    const usage = await getTodayUsage();

    // Sites blocked by Focus Mode.
    const blockedDomains = new Set();

    if (
        session.active &&
        session.endTime &&
        Date.now() < session.endTime
    ) {
        blocklist.forEach(domain => {
            blockedDomains.add(domain);
        });
    }

    // Sites that have reached their daily limits.
    for (const domain in limits) {
        const limitMs = Number(limits[domain]) * 60 * 1000;
        const usedMs = usage[domain] || 0;

        if (limitMs > 0 && usedMs >= limitMs) {
            blockedDomains.add(domain);
        }
    }

    const existingRules =
        await chrome.declarativeNetRequest.getDynamicRules();

    const removeRuleIds = existingRules
        .filter(rule =>
            rule.id >= FIRST_BLOCK_RULE_ID &&
            rule.id <= LAST_BLOCK_RULE_ID
        )
        .map(rule => rule.id);

    const addRules = [];
    const domains = Array.from(blockedDomains);

    const maximumRules =
        LAST_BLOCK_RULE_ID - FIRST_BLOCK_RULE_ID + 1;

    if (domains.length > maximumRules) {
        throw new Error("Too many websites to block.");
    }

    domains.forEach((domain, index) => {
        addRules.push({
            id: FIRST_BLOCK_RULE_ID + index,
            priority: 1,
            action: {
                type: "redirect",
                redirect: {
                    extensionPath: "/blocked.html"
                }
            },
            condition: {
                urlFilter: `||${domain}^`,
                resourceTypes: ["main_frame"]
            }
        });
    });

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules
    });
}

async function addBlockedSite(input) {
    const domain = normalizeDomain(input);
    const domains = await getBlocklist();

    if (!domains.includes(domain)) {
        const maximumSites =
            LAST_BLOCK_RULE_ID - FIRST_BLOCK_RULE_ID + 1;

        if (domains.length >= maximumSites) {
            throw new Error("The blocklist is full.");
        }

        domains.push(domain);

        await chrome.storage.local.set({
            [BLOCKLIST_KEY]: domains
        });
    }

    await syncBlockRules();

    return domains;
}

async function removeBlockedSite(input) {
    const domains = await getBlocklist();
    const updated = domains.filter(domain => domain !== input);

    await chrome.storage.local.set({
        [BLOCKLIST_KEY]: updated
    });

    await syncBlockRules();

    return updated;
}

// -------------------- Messages from the popup --------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_USAGE") {
        runSafely(async () => {
            await handleChange();

            const result = await chrome.storage.local.get(STORAGE_KEY);
            const today = getDateKey(Date.now());

            sendResponse({
                today,
                usage: result[STORAGE_KEY]?.[today] || {}
            });
        }).catch(error => {
            sendResponse({ error: error.message });
        });

        return true;
    }

    if (message.type === "GET_FOCUS") {
        getFocusSession()
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (message.type === "START_FOCUS") {
        startFocusSession()
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (
        message.type === "STOP_FOCUS" ||
        message.type === "RESET_FOCUS"
    ) {
        stopFocusSession()
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (message.type === "GET_BLOCKLIST") {
        Promise.all([
            getBlocklist(),
            getFocusSession()
        ])
            .then(([domains, session]) => {
                sendResponse({
                    domains,
                    active: Boolean(
                        session.active &&
                        session.endTime &&
                        Date.now() < session.endTime
                    )
                });
            })
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (message.type === "ADD_BLOCKED_SITE") {
        addBlockedSite(message.domain)
            .then(domains => sendResponse({ domains }))
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (message.type === "REMOVE_BLOCKED_SITE") {
        removeBlockedSite(message.domain)
            .then(domains => sendResponse({ domains }))
            .catch(error => sendResponse({ error: error.message }));

        return true;
    }

    if (message.type === "GET_LIMITS") {
        Promise.all([
            getDailyLimits(),
            getTodayUsage()
        ])
            .then(([limits, usage]) => {
                sendResponse({ limits, usage });
            })
            .catch(error => {
                sendResponse({ error: error.message });
            });

        return true;
    }

    if (message.type === "SET_SITE_LIMIT") {
        (async () => {
            const domain = normalizeDomain(message.domain);
            const minutes = Number(message.minutes);

            if (
                !Number.isFinite(minutes) ||
                minutes <= 0 ||
                minutes > 1440
            ) {
                throw new Error(
                    "Enter a limit between 1 and 1440 minutes."
                );
            }

            const limits = await getDailyLimits();
            limits[domain] = minutes;

            await chrome.storage.local.set({
                [LIMITS_KEY]: limits
            });

            await syncBlockRules();

            return { limits };
        })()
            .then(sendResponse)
            .catch(error => {
                sendResponse({ error: error.message });
            });

        return true;
    }

    if (message.type === "REMOVE_SITE_LIMIT") {
        (async () => {
            const domain = normalizeDomain(message.domain);
            const limits = await getDailyLimits();

            delete limits[domain];

            await chrome.storage.local.set({
                [LIMITS_KEY]: limits
            });

            await syncBlockRules();

            return { limits };
        })()
            .then(sendResponse)
            .catch(error => {
                sendResponse({ error: error.message });
            });

        return true;
    }

});

// Initialize whenever this service worker starts.
runSafely(initialize);
