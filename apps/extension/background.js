// Constants
const API_CONFIG = {
    BASE_URL: "https://api.mindtab.in",
    ENDPOINTS: {
        readingListSync: "/sync/reading-lists",
        bookmarksSync: "/sync/bookmarks",
    },
    HEADERS: {
        "Content-Type": "application/json",
    },
};

// Event Listeners
chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onMessage.addListener(handleMessages);
chrome.alarms.onAlarm.addListener(handleAlarms);

// Installation Handler
async function handleInstall() {
    chrome.tabs.create({ url: "https://app.mindtab.in" });
    setupSyncAlarm();
}

// Message Handler
function handleMessages(message, sender, sendResponse) {
    switch (message.action) {
        case "sync_now":
            syncAll().then(sendResponse);
            return true;
        case "get_sync_status":
            getSyncStatus().then(sendResponse);
            return true;
    }
}

// Alarm Handler
function handleAlarms(alarm) {
    if (alarm.name === "sync") {
        syncAll();
    }
}

// Sync Setup
function setupSyncAlarm() {
    chrome.alarms.clear("sync");
    chrome.alarms.create("sync", {
        periodInMinutes: 60,
    });
}

// Main Sync Functions
async function syncAll() {
    try {
        const [readingListResult, bookmarksResult] = await Promise.all([
            syncReadingList(),
            syncBookmarks(),
        ]);

        const success = readingListResult.success && bookmarksResult.success;
        const errorMessage = !success
            ? `Reading List: ${
                  readingListResult.error || "success"
              }, Bookmarks: ${bookmarksResult.error || "success"}`
            : null;

        await updateSyncStatus(success, errorMessage);
        return {
            success,
            readingList: readingListResult,
            bookmarks: bookmarksResult,
        };
    } catch (error) {
        const errorMsg = error.message || "Unknown error during sync";
        await updateSyncStatus(false, errorMsg);
        return { success: false, error: errorMsg };
    }
}

async function syncReadingList() {
    if (typeof chrome.readingList === "undefined") {
        console.log("=== READING LIST API IS NOT AVAILABLE ===");
        return { success: false, error: "Reading List API not available" };
    }

    try {
        const entries = await chrome.readingList.query({});
        const data = {
            items: entries.map(formatReadingListEntry),
            metadata: {
                count: entries.length,
                source: "chrome-reading-list-api",
            },
        };

        await sendDataToServer(data, API_CONFIG.ENDPOINTS.readingListSync);
        return { success: true, data };
    } catch (e) {
        console.error("=== ERROR FETCHING READING LIST API ===", e);
        return { success: false, error: e.message };
    }
}

async function syncBookmarks() {
    try {
        const tree = await chrome.bookmarks.getTree();
        const allBookmarks = collectAllBookmarks(tree);

        const data = {
            metadata: {
                count: allBookmarks.length,
                source: "chrome-bookmarks-api",
            },
            items: allBookmarks,
        };

        await sendDataToServer(data, API_CONFIG.ENDPOINTS.bookmarksSync);
        return { success: true, data };
    } catch (e) {
        console.error("=== ERROR FETCHING BOOKMARKS API ===", e);
        return { success: false, error: e.message };
    }
}

// Helper Functions
function formatReadingListEntry(entry) {
    return {
        title: entry.title,
        url: entry.url,
        hasBeenRead: entry.hasBeenRead,
        lastUpdateTime: entry.lastUpdateTime,
        creationTime: entry.creationTime,
    };
}

function collectAllBookmarks(nodes) {
    const bookmarks = [];
    for (const node of nodes) {
        if (node.url) {
            bookmarks.push({
                id: node.id,
                title: node.title,
                url: node.url,
                dateAdded: node.dateAdded,
            });
        }
        if (node.children) {
            bookmarks.push(...collectAllBookmarks(node.children));
        }
    }
    return bookmarks;
}

async function getSessionToken() {
    const cookies = await chrome.cookies.getAll({
        domain: "app.mindtab.in",
    });
    return cookies.find(
        (cookie) => cookie.name === "mindtab_refresh"
    )?.value;
}

async function sendDataToServer(data, endpoint) {
    const sessionToken = await getSessionToken();
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
            ...API_CONFIG.HEADERS,
            Authorization: `Bearer ${sessionToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(
            `Server responded with ${response.status}: ${response.statusText}`
        );
    }
}

async function getSyncStatus() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["lastSynced", "lastSyncResult"], resolve);
    });
}

async function updateSyncStatus(success, errorMessage = null) {
    await chrome.storage.sync.set({
        lastSynced: new Date().toISOString(),
        lastSyncResult: {
            success,
            errorMessage,
            timestamp: new Date().toISOString(),
        },
    });
}
