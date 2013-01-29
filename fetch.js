/**
 * Background page stuff
 */
buildStatus = {};
feed = {
  entries: [],
  rawdoc: null,
};

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
        feed = feeddata;
        if (webkit_commit_callback)
            webkit_commit_callback(feed);
    });

    if (email) {
        requestWebkitCommitQueuePositions(email, function(queue) {
        buildStatus.queue = queue;
        if (queue_callback)
            queue_callback(queue);
        });
    } else if (queue_callback) {
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
