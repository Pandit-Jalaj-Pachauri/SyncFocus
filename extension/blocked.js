const params = new URLSearchParams(location.search);
        let originalUrl = params.get("url");

        const statusEl = document.getElementById("status");
        const headingEl = document.getElementById("heading");
        const descriptionEl = document.getElementById("description");
        const noteEl = document.getElementById("note");
        const checkBtn = document.getElementById("checkBtn");

        let checking = false;
        let returning = false;

        function getDomain(url) {
            try {
                const parsed = new URL(url);

                if (
                    parsed.protocol !== "http:" &&
                    parsed.protocol !== "https:"
                ) {
                    return null;
                }

                return parsed.hostname.replace(/^www\./, "").toLowerCase();
            } catch (error) {
                return null;
            }
        }

        function matchesDomain(domain, blockedDomain) {
            return domain === blockedDomain ||
                domain.endsWith("." + blockedDomain);
        }

        async function checkStatus() {
            if (checking || returning) {
                return;
            }

            checking = true;
            checkBtn.disabled = true;

            try {
                if (!originalUrl) {
                    const tabs = await chrome.tabs.query({
                        active: true,
                        lastFocusedWindow: true
                    });

                    if (tabs.length > 0) {
                        const key = `syncFocusBlockedUrl_${tabs[0].id}`;
                        const data = await chrome.storage.session.get(key);
                        const record = data[key];

                        if (record && Date.now() - record.timestamp < 30000) {
                            originalUrl = record.url;
                        }
                    }
                }

                if (!originalUrl) {
                    statusEl.textContent = "Status unavailable";
                    headingEl.textContent = "Website blocked";
                    descriptionEl.textContent =
                        "The original website address could not be recovered.";
                    noteEl.textContent =
                        "Navigate to the website again after checking your SyncFocus settings.";
                    return;
                }

                const domain = getDomain(originalUrl);

                if (!domain) {
                    throw new Error("Invalid original website address.");
                }

                const [blocklistResult, limitsResult] = await Promise.all([
                    chrome.runtime.sendMessage({
                        type: "GET_BLOCKLIST"
                    }),
                    chrome.runtime.sendMessage({
                        type: "GET_LIMITS"
                    })
                ]);

                if (
                    !blocklistResult ||
                    blocklistResult.error ||
                    !limitsResult ||
                    limitsResult.error
                ) {
                    throw new Error("Could not read SyncFocus status.");
                }

                const focusBlocksSite =
                    blocklistResult.active &&
                    blocklistResult.domains.some(blockedDomain =>
                        matchesDomain(domain, blockedDomain)
                    );

                const limitMinutes = Number(
                    (limitsResult.limits || {})[domain] || 0
                );

                const usedMs = Number(
                    (limitsResult.usage || {})[domain] || 0
                );

                const dailyLimitReached =
                    limitMinutes > 0 &&
                    usedMs >= limitMinutes * 60 * 1000;

                if (dailyLimitReached) {
                    statusEl.textContent = "Daily limit reached";
                    headingEl.textContent = "Time's up for today.";
                    descriptionEl.textContent =
                        `${domain} has reached its daily time limit.`;
                    noteEl.textContent =
                        "Pausing or resetting Focus Mode will not remove a daily website limit. You can return when the limit resets or change it in SyncFocus.";
                    checkBtn.textContent = "Check again";
                    return;
                }

                if (focusBlocksSite) {
                    statusEl.textContent = "Focus Mode active";
                    headingEl.textContent = "Stay focused.";
                    descriptionEl.textContent =
                    `${domain} is on your SyncFocus blocklist.`;
                    noteEl.textContent =
                        "Pause or reset Focus Mode in the extension. This page will update automatically.";
                    checkBtn.textContent = "Check again";
                    return;
                }

                statusEl.textContent = "Website available";
                headingEl.textContent = "You're all set.";
                descriptionEl.textContent =
                    "This website is no longer blocked by SyncFocus.";
                noteEl.textContent = "Returning to your website...";

                returning = true;
                location.replace(originalUrl);

            } catch (error) {
                statusEl.textContent = "Unable to check";
                headingEl.textContent = "Something went wrong.";
                descriptionEl.textContent = error.message;
                noteEl.textContent =
                    "Try checking again in a moment.";
            } finally {
                checking = false;
                checkBtn.disabled = false;
            }
        }

        checkBtn.addEventListener("click", async () => {
            checkBtn.disabled = true;
            checkBtn.textContent = "Checking...";

            await checkStatus();

            checkBtn.disabled = false;

            if (!returning) {
                checkBtn.textContent = "Check again";
            }
        });
        checkBtn.addEventListener("click", () => {
            checkStatus();
        });

        checkStatus();
        setInterval(checkStatus, 1500);