
buildStatus = {};
feed = {
  entries: [],
  rawdoc: null,
};


function refresh(version_callback, feed_callback) {
  console.log("kicking off refresh...");
  requestWebkitVersion(function(val) {
    chrome.browserAction.setBadgeText({text: val});
    chrome.browserAction.setTitle({title: "WebKit revision: " + val});
    buildStatus['webkit_version'] = parseInt(val);
    if (version_callback) {
      version_callback(val);
    }
  });
  requestWebkitFeed(function(doc) {
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
        entry.title = text.slice(0, title_end);
      }
      entries.push(entry);
    });
    feed.entries = entries;
    if (feed_callback) {
      feed_callback(feed);
    }
  });
};

refresh();
