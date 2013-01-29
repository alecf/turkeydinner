/**
 * Background page stuff
 */
buildStatus = {};

var listeners = [];
function addRefreshListener(listener) {
    notifyListener(listener);
    listeners.push(listener);
}

function notifyListener(listener) {
    if (buildStatus.webkit_version || buildStatus.chromium_webkit_version) {
        listener.onVersionsReady(buildStatus.webkit_version, buildStatus.chromium_webkit_version);
    }

    if (buildStatus.webkit_queue) {
        listener.onWebkitQueue(buildStatus.webkit_queue);
    }

    if (buildStatus.chromium_queue) {
        listener.onChromiumQueue(buildStatus.chromium_queue);
    }

    if (buildStatus.webkit_commits) {
        listener.onWebkitCommits(buildStatus.webkit_commits);
    }

    if (buildStatus.chromium_lkgr) {
        listener.onChromiumLgkr(buildStatus.chromium_lkgr);
    }

    if (buildStatus.webkit_gardeners) {
        listener.onWebkitGardeners(buildStatus.webkit_gardeners);
    }

    // all data is ready
    listener.onDataReady();
}

function refresh(version_callback, webkit_commit_callback, queue_callback, chromium_callback, chromium_lkgr_callback, webkit_gardener_callback) {
    var email = localStorage.getItem("email");
    var review_nick = localStorage.getItem("review-nick");
    console.log("Updating build status to ", new Date());
    buildStatus.last_refresh = new Date();

    console.log("kicking off refresh...");
    requestWebkitVersion(function(webkit_version, chromium_version) {
        if (chrome.browserAction) {
            chrome.browserAction.setBadgeText({text: webkit_version});
            chrome.browserAction.setTitle({title: "WebKit revision: " + webkit_version});
        }
        buildStatus.webkit_version = parseInt(webkit_version);
        buildStatus.chromium_webkit_version = parseInt(chromium_version);
        if (version_callback) {
            version_callback(webkit_version, chromium_version);
        }
    });
    requestWebkitCommits(function(feeddata) {
        console.log("requestWebkitCommits");
        buildStatus.webkit_feed = feeddata;
        if (webkit_commit_callback)
            webkit_commit_callback(feeddata);
    });

    if (email) {
        console.log("requestWebkitQueuePositions");
        requestWebkitCommitQueuePositions(email, function(queue) {
            console.log("Have webkit queue: ", queue);
            buildStatus.webkit_queue = queue;
            if (queue_callback)
                queue_callback(queue);
        });
    } else if (queue_callback) {
        console.log("no email, no webkit queue");
        queue_callback([]);
    }

    if (review_nick) {
        requestAllChromiumQueues(review_nick, function(reviews) {
            buildStatus.chromium_queue = reviews;
            if (chromium_callback)
                chromium_callback(reviews);
        });
    } else if (chromium_callback) {
        chromium_callback([]);
    }

    requestChromiumLKGR(function(lkgr) {
        buildStatus.chromium_lkgr = lkgr;
        if (chromium_lkgr_callback)
            chromium_lkgr_callback(lkgr);
    });

    requestWebkitGardeners(function(gardeners) {
        buildStatus.webkit_gardeners = gardeners;
        if (webkit_gardener_callback)
            webkit_gardener_callback(gardeners);
    });
};

refresh();
