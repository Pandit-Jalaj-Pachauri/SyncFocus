const homeView = document.getElementById("homeView");
const settingsView = document.getElementById("settingsView");
const featureView = document.getElementById("featureView");

const featureCards = document.querySelectorAll("[data-feature-card]");
const featureSections = document.querySelectorAll("[data-feature-section]");
const settingsButton = document.getElementById("settingsButton");
const backButtons = document.querySelectorAll("[data-back-home]");
const settingCheckboxes = document.querySelectorAll("[data-setting-feature]");

const DEFAULT_FEATURES = ["focus", "blocker"];
const STORAGE_KEY = "syncFocusVisibleSections";

function showView(view) {
    homeView.hidden = true;
    settingsView.hidden = true;
    featureView.hidden = true;

    view.hidden = false;
}

function openHome() {
    showView(homeView);
}

function openSettings() {
    showView(settingsView);
}

function openFeature(featureName) {
    featureSections.forEach((section) => {
        section.hidden = section.dataset.featureSection !== featureName;
    });

    showView(featureView);
}

function applyVisibleFeatures(visibleFeatures) {
    featureCards.forEach((card) => {
        const featureName = card.dataset.featureCard;
        card.hidden = !visibleFeatures.includes(featureName);
    });

    settingCheckboxes.forEach((checkbox) => {
        checkbox.checked = visibleFeatures.includes(
            checkbox.dataset.settingFeature
        );
    });
}

function loadVisibleFeatures() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const visibleFeatures = Array.isArray(result[STORAGE_KEY])
            ? result[STORAGE_KEY]
            : DEFAULT_FEATURES;

        applyVisibleFeatures(visibleFeatures);
    });
}

function saveVisibleFeatures() {
    const visibleFeatures = [];

    settingCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
            visibleFeatures.push(checkbox.dataset.settingFeature);
        }
    });

    chrome.storage.local.set({
        [STORAGE_KEY]: visibleFeatures
    });

    applyVisibleFeatures(visibleFeatures);
}

settingsButton?.addEventListener("click", openSettings);

backButtons.forEach((button) => {
    button.addEventListener("click", openHome);
});

featureCards.forEach((card) => {
    card.addEventListener("click", () => {
        openFeature(card.dataset.featureCard);
    });
});

settingCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", saveVisibleFeatures);
});

loadVisibleFeatures();
