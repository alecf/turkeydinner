function promiseXHR(url, type) {
    var deferred = Q.defer();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    if (type && type != "xml") {
        deferred.reject("Bad type: " + type);
        return deferred.promise;
    }
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if (!type)
                deferred.resolve(xhr.responseText);
            else if (type == "xml")
                deferred.resolve(xhr.responseXML);
            else
                deferred.reject("ASSERT: Bad type");
        }
    };
    xhr.send();
    return deferred.promise;
}


function requestBlinkVersion() {
    if (chrome.browserAction)
        chrome.browserAction.setBadgeText({"text": "..."});
    // first request the latest version out of the git repository
    return promiseXHR('https://git.chromium.org/gitweb/?p=chromium/src.git;a=blob_plain;f=DEPS;hb=refs/heads/master')
        .then(function(feed) {
            var new_lines = [];
            var lines = feed.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var revision = line.indexOf('"webkit_revision":');
                if (revision != -1) {
                    var val = line.split(":")[1].split('"')[1];
                    return requestChromiumVersionForBlinkRoll(val).then(function(chromium_version) {
                        return [val, chromium_version];
                    });
                }
            }
            return ["??", "??"];
        });
}


function requestChromiumVersionForBlinkRoll(blinkVersion) {
    return promiseXHR('https://git.chromium.org/gitweb/?p=chromium/src.git;a=atom;f=DEPS;h=refs/heads/master', 'xml')
        .then(function(feed) {
            var found = null;
            $('entry', feed).each(function(i, entry) {
                var comments = $('content', entry).text();

                // at least has to mention blink
                if (!/blink/i.exec(comments))
                    return true;

                // // find the diff URL
                // var diff_url = $('content', entry).find('a[title="diff"]').attr('href');
                // if (diff_url) {
                //     diff_url = diff_url.replace('blobdiff', 'blobdiff_raw');

                //     $.get(diff_url)
                //         .success(function(data) {
                //             var match = /\+.*blink_revision[^\d]+(\d+)/.exec(data);
                //             if (match) {...}
                //         });

                // this is cheezy - we could possibly request the rss feed for the issue, then
                // look at the latest diff in the issue?
                var match = /(\d+):(\d+)/m.exec(comments);
                if (match) {
                    var from = match[1];
                    var to = match[2];
                    var svn_match = /git-svn-id:\s+svn:\/\/svn.chromium.org\/chrome\/trunk\/src@(\d+)/m.exec(comments);
                    if (to == blinkVersion) {
                        found = svn_match ? svn_match[1] : "???";
                        return false;
                    }
                } else {
                    console.log("No revision in ", comments);
                }
                // var match = /Review URL:\s+https:\/\/chromiumcodereview.appspot.com\/(\d+)/m.exec(comments);
                // if (match) {
                //     var id = match[1];
                //     console.log("DEPS log entry[" + i + "] => Chromium issue ", id);
                //     //requestChromiumIssue(id, function(result)
                // }
            });
            return found;
        });
}


var status_order = ['mine', 'closed'];
function sortByStatus(e1, e2) {
    var p1 = status_order.indexOf(e1.status);
    var p2 = status_order.indexOf(e2.status);
    return p1 - p2;
}

function sortChromiumQueue(e1, e2) {
    var result = sortByStatus(e1, e2);
    if (result != 0)
        return result;
    return e2.timestamp.localeCompare(e1.timestamp);
}

function requestAllChromiumQueues(nick) {
    return Q.all([
        requestChromiumQueue(nick, 'mine').then(function(mine) {
            mine.forEach(function(entry) { entry.status = 'mine'; });
            return mine;
        }),
        requestChromiumQueue(nick, 'closed').then(function(closed) {
            closed.forEach(function(entry) { entry.status = 'closed'; });
            return closed;
        })
    ]).then(function(entries) {
        var full_list = entries[0].concat(entries[1]);
        console.log("DONE with " + nick + "'s chromium queue: ", full_list);
        full_list.sort(sortChromiumQueue);
        return full_list;
    });
}

function requestChromiumIssue(id) {
    return promiseXHR('https://codereview.chromium.org/rss/issue/' + id, 'xml');
}

function requestChromiumQueue(nick, type) {
    return promiseXHR('https://codereview.chromium.org/rss/' + type + '/' + nick, 'xml')
        .then(function(doc) {
            var results = [];
            $('entry', doc).each(function (i, entry) {
                var url = $('link', entry).attr('href');
                var match = /\/(\d+)\//.exec(url);
                if (match) {
                    var summary = $('summary', entry).text();
                    var id = match[1];
                    var info = { id: id, summary: summary.trim().split('\n')[0], type: type };
                    var bugmatch = /BUG=(\d+)/.exec(summary);
                    if (bugmatch)
                        info.bug = bugmatch[1];
                    var p = requestChromiumIssue(id)
                            .then(function(doc) {
                                var lastCQindex = -1;
                                var lastCommit;
                                //console.log("Found chromium review issue: ", id);
                                $('entry', doc).each(function(i, entry) {
                                    // keep latest timestamp
                                    info.timestamp = $('updated', entry).text();
                                    var summary = $('summary', entry).text();
                                    var matchcq = /https:\/\/chromium-status.appspot.com\/cq\/[@\w.]+\/\d+\/\d+/.exec(summary);
                                    if (matchcq) {
                                        // keep the last one!
                                        info.cqUrl = matchcq[0];
                                        lastCQindex = i;
                                        delete info.commit;
                                        delete info.aborted;
                                    }

                                    var committed = /Change committed as (\d+)/.exec(summary);
                                    if (committed) {
                                        info.commit = committed[1];
                                        delete info.aborted;
                                        delete info.cqUrl;
                                    }
                                    var aborted = /Presubmit ERRORS(.*)/m.exec(summary) ||
                                            /Commit queue rejected this change/m.exec(summary) ||
                                            /Presubmit check.*failed/m.exec(summary) ||
                                            /Failed to apply patch/m.exec(summary) ||
                                            /Sorry for I got bad news for ya/m.exec(summary);
                                    if (aborted) {
                                        // booh - regexps only go to the end of the current line
                                        info.aborted = summary.slice(aborted.index);
                                        delete info.commit;
                                        delete info.cqUrl;
                                    }
                                });
                                return info;
                            });
                    results.push(p);
                }
            });
            return Q.all(results);
        });
}

function requestChromiumCommits() {
    return promiseXHR('https://git.chromium.org/gitweb/?p=chromium.git;a=atom;h=refs/heads/trunk',
                      'xml')
        .then(function(doc) {
            return convertChromiumFeed(doc);
        });
}

/**
 * Convert blink commit feed into something useful (read: non-xml) anotated with links/etc
 */
function convertBlinkFeed(doc) {
    var feed = { entries: [], rawdoc: doc };
    var entries = [];
    $('entry', doc).each(function(i) {
      var text = $('content pre', this).text();
      var entry = {
        text: text,
        updated: $('updated:first', this).text()
      };

      var time = $('updated', this).text();

      var bug = /bugs.blink.org\/show_bug.cgi\?id=(\d+)/g.exec(text);
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
    return feed;
}

function requestBlinkCommits() {
    return promiseXHR('http://blink.lc/blink/atom', 'xml')
        .then(convertBlinkFeed);
}

function requestChromiumLKGR() {
    return promiseXHR('https://chromium-status.appspot.com/lkgr');
}

function requestBlinkGardeners() {
    console.log("Getting gardeners...");
    return promiseXHR('https://chromium-build.appspot.com/p/chromium/sheriff_webkit.js')
        .then(function(js) {
            var match =/document.write\(['"](.*)['"]\)+/.exec(js);
            var results = [];
            if (!match)
                return [];
            var gardeners = match[1].split(',');
            gardeners.push("eseidel"); //autoroll
            gardeners.forEach(
                function(s) {
                    var gardener = {nick: s.trim() };
                    var p = requestChromiumQueue(gardener.nick, 'mine')
                            .then(function(queue) {
                                gardener.queue = [];
                                console.log("Checking gardener: ", gardener.nick, queue);
                                for (var i = 0; i < queue.length; i++) {
                                    var roll_match =
                                            /Roll (blink|blink) (\d+):(\d+)/i.exec(queue[i].summary) ||
                                            /(blink|blink) roll (\d+):(\d+)/i.exec(queue[i].summary) ||
                                            /(blink|blink) roll (\d+)-&gt;(\d+)/i.exec(queue[i].summary);
                                    if (roll_match) {
                                        queue[i].start = roll_match[2];
                                        queue[i].end = roll_match[3];
                                        gardener.queue.push(queue[i]);
                                    }
                                }
                                console.log(gardener.nick + "'s queue: ", gardener.queue);
                                return gardener;
                            });
                    results.push(p);
                });
            return Q.all(results);
        });
}
