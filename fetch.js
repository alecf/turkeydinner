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
    if (buildStatus.blink_version || buildStatus.chromium_blink_version) {
        listener.onVersionsReady(buildStatus.blink_version,
                                 buildStatus.chromium_blink_version);
    }

    if (buildStatus.chromium_queue) {
        listener.onChromiumQueue(buildStatus.chromium_queue);
    }

    if (buildStatus.blink_commits) {
        listener.onBlinkCommits(buildStatus.blink_commits);
    }

    if (buildStatus.chromium_lkgr) {
        listener.onChromiumLgkr(buildStatus.chromium_lkgr);
    }

    if (buildStatus.blink_gardeners) {
        listener.onBlinkGardeners(buildStatus.blink_gardeners);
    }

    // all data is ready
    listener.onDataReady();
}

function refresh(version_callback, blink_commit_callback, chromium_commit_callback, chromium_cl_callback, chromium_lkgr_callback, blink_gardener_callback) {
    var email = localStorage.getItem("email");
    var review_nick = localStorage.getItem("review-nick");
    console.log("Updating build status to ", new Date());
    buildStatus.last_refresh = new Date();

    console.log("kicking off refresh...");
    requestBlinkVersion().then(function(versions) {
        var blink_version = versions[0];
        var chromium_version = versions[1];
        if (chrome.browserAction) {
            chrome.browserAction.setBadgeText({text: blink_version});
            chrome.browserAction.setTitle({title: "Blink revision: " + blink_version});
        }
        buildStatus.blink_version = parseInt(blink_version);
        buildStatus.chromium_blink_version = parseInt(chromium_version);
        if (version_callback) {
            version_callback(blink_version, chromium_version);
        }
    });
    requestBlinkCommits().then(function(feeddata) {
        console.log("Got blink commits:", feeddata);
        buildStatus.blink_feed = feeddata;
        if (blink_commit_callback)
            blink_commit_callback(feeddata);
    });
    requestChromiumCommits().then(function(feeddata) {
        console.log("Got chromium commits:", feeddata);
        buildStatus.chrome_feed = feeddata;
        if (chrome_commit_callback)
            chrome_commit_callback(feeddata);
    });

    if (review_nick) {
        requestAllChromiumQueues(review_nick).then(function(reviews) {
            buildStatus.chromium_queue = reviews;
            if (chromium_cl_callback)
                chromium_cl_callback(reviews);
        });
    } else if (chromium_callback) {
        chromium_cl_callback([]);
    }

    requestChromiumLKGR().then(function(lkgr) {
        buildStatus.chromium_lkgr = lkgr;
        if (chromium_lkgr_callback)
            chromium_lkgr_callback(lkgr);
    });

    requestBlinkGardeners().then(function(gardeners) {
        buildStatus.blink_gardeners = gardeners;
        if (blink_gardener_callback)
            blink_gardener_callback(gardeners);
    });
};

refresh();
