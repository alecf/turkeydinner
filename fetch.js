/**
 * Background page stuff
 */
var buildStatus = {};

function refresh() {
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

    buildStatus.blink_feed =
        requestBlinkCommits();

    buildStatus.chromium_feed =
        requestChromiumCommits();

    buildStatus.chromium_queue =
        requestAllChromiumQueues(review_nick);

    buildStatus.chromium_lkgr =
        requestChromiumLKGR();

    buildStatus.blink_gardeners =
        requestBlinkGardeners();
};

refresh();
