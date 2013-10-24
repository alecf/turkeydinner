/**
 * Background page stuff
 */
var buildStatus = {};

var refreshing = false;
var current_refresh = null;
function refresh() {
    // we should never have more than one refresh going at any given time
    if (refreshing)
        // current_refresh should never be null
        return current_refresh;

    var review_nick = localStorage.getItem("review-nick");
    console.log("Updating build status to ", new Date());
    buildStatus.last_refresh = new Date();

    console.log("kicking off refresh...");
    buildStatus.versions = requestBlinkVersion()
        .then(function(versions) {
            if (chrome.browserAction) {
                chrome.browserAction.setBadgeText({text: versions.blink_version});
                chrome.browserAction.setTitle({title: "Blink revision: " + versions.blink_version});
            }
            return versions;
        });

    buildStatus.blink_feed = requestBlinkCommits();

    buildStatus.chromium_feed = requestChromiumCommits();

    buildStatus.chromium_queue = requestAllChromiumQueues(review_nick);

    buildStatus.chromium_lkgr = requestChromiumLKGR();

    buildStatus.blink_gardeners = requestBlinkGardeners();

    refreshing = true;
    current_refresh = Q.all([
        buildStatus.versions,
        buildStatus.blink_feed,
        buildStatus.chromium_feed,
        buildStatus.chromium_queue,
        buildStatus.chromium_lkgr,
        buildStatus.blink_gardeners])
        .then(function(result) {
            refreshing = false;
        });
    return current_refresh;
};

refresh();