/**
 * Background page stuff
 */
var buildStatus = {};

function refresh(chromium_commit_callback, blink_gardener_callback) {
    var email = localStorage.getItem("email");
    var review_nick = localStorage.getItem("review-nick");
    console.log("Updating build status to ", new Date());
    buildStatus.last_refresh = new Date();

    console.log("kicking off refresh...");
    buildStatus.versions = requestBlinkVersion().then(function(versions) {
        if (chrome.browserAction) {
            chrome.browserAction.setBadgeText({text: versions.blink_version});
            chrome.browserAction.setTitle({title: "Blink revision: " + versions.blink_version});
        }
        return versions;
    });

    buildStatus.blink_feed = requestBlinkCommits().then(function(feeddata) {
        console.log("Got blink commits:", feeddata);
        return feeddata;
    });

    requestChromiumCommits().then(function(feeddata) {
        console.log("Got chromium commits:", feeddata);
        buildStatus.chrome_feed = feeddata;
        if (chrome_commit_callback)
            chrome_commit_callback(feeddata);
    });

    buildStatus.chromium_queue =
        requestAllChromiumQueues(review_nick);

    buildStatus.chromium_lkgr =
        requestChromiumLKGR();

    buildStatus.blink_gardeners =
        requestBlinkGardeners();
};

refresh();
