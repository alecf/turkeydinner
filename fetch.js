/**
 * Background page stuff
 */
buildStatus = {};
feed = {
  entries: [],
  rawdoc: null,
};

function convert_feed(doc, callback) {
    feed.rawdoc = doc;
    var entries = [];
    $('entry', doc).each(function(i) {
      var text = $('content pre', this).text();
      var entry = {
        text: text,
        updated: $('updated:first', this).text()
      };

      var time = $('updated', this).text();

      var bug = /bugs.webkit.org\/show_bug.cgi\?id=(\d+)/g.exec(text);
      if (bug) {
        entry.bug = bug[1];
      }

      var svn_id = /git-svn-id:.*@(\d+) /g.exec(text);
      if (svn_id) {
        entry.svn_id = parseInt(svn_id[1]);
      }

      var author = $('author name', this).text();
      if (author) {
        entry.author = author;
      }

      var patch_by = /Patch by.*<(.*@.*)>/.exec(text);
      if (patch_by) {
        entry.patch_by = patch_by[1];
      }

      entry.title = $('title:first', this).text();
      var title_end = text.indexOf("\n\n");
      if (title_end) {
        entry.title = text.slice(0, title_end).trim();
      }
      entries.push(entry);
    });
    feed.entries = entries;
    if (callback) {
      callback(feed);
    }
}

function refresh(version_callback, feed_callback, queue_callback, chromium_callback, chromium_lkgr_callback, webkit_gardener_callback) {
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
    requestWebkitFeed(function(doc) {
        convert_feed(doc, feed_callback);
    });
    if (email) {
        requestQueuePositions(email, function(queue) {
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
