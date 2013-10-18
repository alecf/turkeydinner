function requestBlinkVersion() {
    var deferred = Q.defer();
    // first request the latest version out of the git repository
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://git.chromium.org/gitweb/?p=chromium/src.git;a=blob_plain;f=DEPS;hb=refs/heads/master');
    if (chrome.browserAction)
        chrome.browserAction.setBadgeText({"text": "..."});
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var new_lines = [];
            var lines = xhr.responseText.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var revision = line.indexOf('"webkit_revision":');
                if (revision != -1) {
                    var val = line.split(":")[1].split('"')[1];
                    requestChromiumVersionForBlinkRoll(val).then(function(chromium_version) {
                        deferred.resolve([val, chromium_version]);
                    });
                    break;
                }
            }
        }
    };
    xhr.send();
    return deferred.promise;
}


function requestChromiumVersionForBlinkRoll(blinkVersion) {
    var deferred = Q.defer();
    requestFeed('https://git.chromium.org/gitweb/?p=chromium/src.git;a=atom;f=DEPS;h=refs/heads/master').then(
                function(feed) {
                    var found = false;
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
                                found = true;
                                deferred.resolve(svn_match ? svn_match[1] : "???");
                                return false;
                            }
                        } else
                        console.log("No revision in ", comments);
                        // var match = /Review URL:\s+https:\/\/chromiumcodereview.appspot.com\/(\d+)/m.exec(comments);
                        // if (match) {
                        //     var id = match[1];
                        //     console.log("DEPS log entry[" + i + "] => Chromium issue ", id);
                        //     //requestChromiumIssue(id, function(result)
                        // }
                    });
                    if (!found)
                        deferred.resolve(null);
                });
    return deferred.promise;
}


function requestFeed(url) {
    var deferred = Q.defer();
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);

  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      // look in the xml, bleah
        deferred.resolve(xhr.responseXML);
    }
  };
  xhr.send();
    return deferred.promise;
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
    // super cheesy, not parallel right now
    var deferred = Q.defer();
    requestChromiumQueue(nick, 'mine').then(function(mine) {
        mine.forEach(function(entry) { entry.status = 'mine'; });
        requestChromiumQueue(nick, 'closed').then(function(closed) {
            closed.forEach(function(entry) { entry.status = 'closed'; });
            var full_list = mine.concat(closed);
            full_list.sort(sortChromiumQueue);
            console.log("DONE with " + nick + "'s chromium queue: ", full_list);
            deferred.resolve(full_list);
        });
    });
    return deferred.promise;
}

function requestChromiumIssue(id) {
    return requestFeed('https://codereview.chromium.org/rss/issue/' + id);
}

function requestChromiumQueue(nick, type) {
    var deferred = Q.defer();
    requestFeed('https://codereview.chromium.org/rss/' + type + '/' + nick).then(function(doc) {
        var result = [];
        var pending = 0;
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
                result.push(info);
                pending++;
                requestChromiumIssue(id).then(function(doc) {
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
                    // not sure if this will work...
                    if (--pending == 0) {
                        deferred.resolve(result);
                    }
                });
            }
        });
        if (!pending) {
            deferred.resolve([]);
        }

    });
    return deferred.promise;
}

function convertChromiumFeed(doc, callback) {

}

function requestChromiumCommits() {
    return requestFeed('https://git.chromium.org/gitweb/?p=chromium.git;a=atom;h=refs/heads/trunk').then(function(doc) {
        return convertChromiumFeed(doc, callback);
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
    return requestFeed('https://git.chromium.org/gitweb/?p=external/WebKit_trimmed.git;a=atom;h=refs/heads/master')
        .then(convertBlinkFeed);
}

function requestBugzillaFeed(email, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://bugs.blink.org/buglist.cgi?bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&emailassigned_to1=1&emailtype1=substring&email1=' + email + '&ctype=atom');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            console.log("Have bugzilla feed.");
            callback(xhr.responseXML);
        }
    };
    xhr.send();
}

function requestBugzillaAttachment(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '&ctype=xml');
    console.log("Fetching attachment ", url);
    xhr.onreadystatechange = function() {
        var result = [];
        if (xhr.readyState == 4) {
            var doc = $(xhr.responseXML);
            $('attachment[isobsolete=0]', doc).each(function(i, attachment) {
                var flags = {};
                $('flag', attachment).each(function (i, flag) {
                    flags[$(flag).attr('name')] = $(flag).attr('status');
                });
                result.push({ id: $('attachid', attachment).text().trim(),
                              flags: flags});
            });
            callback(result);
        }
    };
    xhr.send();

}


function requestBugzillaList(email, callback) {
    requestBugzillaFeed(email, function(doc) {
        var result = [];
        var pending = 0;
        $('entry', doc).each(function (i, entry) {
            var url = $('id', entry).text().trim();
            var match = /id=(\d+)/.exec(url);
            var title = $('title', entry).text().trim();
            if (match) {
                var buginfo = {id: match[1], title: title, data: entry};
                result.push(buginfo);
                pending++;
                requestBugzillaAttachment(url, function(attachments) {
                    buginfo.attachments = attachments;
                    if (--pending == 0) {
                        callback(result);
                    }
                });
            }
        });
        // if there aren't any entries, pending will never have
        // incremented
        if (!pending) {
            callback([]);
        }
    });
}

function requestQueuePage(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://blink-commit-queue.appspot.com/queue-status/commit-queue');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            callback($(xhr.responseText));
        }
    };
    xhr.send();
}

function maybeRun(bugList, queueList, callback) {
    if (!bugList || !queueList)
        return;
    var result = [];
    bugList.forEach(function(bug) {
        bug.attachments.forEach(function (patch) {
            queueList.forEach(function (entry) {
                if (patch.id == entry.patch) {
                    var minutes;
                    var time;
                    if (entry.time && (minutes = /(\d+) minutes ago/.exec(entry.time))) {
                        console.log("Making date out of ", minutes);
                        time = new Date(Date.now() - parseInt(minutes[1]) * 60 * 1000).toLocaleTimeString();
                    }
                    result.push({ position: entry.position,
                                  locked: time,
                                  bug: bug.id,
                                  summary: bug.title,
                                  patch: patch.id });
                }
            });
        });
    });
    result.sort(function(a,b) { return a.position - b.position; });
    callback(result);
}

function requestChromiumLKGR(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://chromium-status.appspot.com/lkgr');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            callback(xhr.responseText);
        }
    };
    xhr.send();
}

function blinkTracLink(svn_id) {
    var url = 'https://trac.blink.org/changeset/' + svn_id;
    return '<a href="' + url + '" title="' + url + '" target="_new">r' + svn_id+ '</a>';
}

function requestBlinkGardeners(callback) {
    console.log("Getting gardeners...");
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://chromium-build.appspot.com/p/chromium/sheriff_webkit.js');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var js = xhr.responseText;
            var match =/document.write\(['"](.*)['"]\)+/.exec(js);
            var pending = 0;
            if (match) {
                var result = [];
                match[1].split(',').forEach(
                    function(s) {
                        var gardener = {nick: s.trim() };
                        result.push(gardener);
                        pending++;
                        requestChromiumQueue(gardener.nick, 'mine').then(function(queue) {
                            gardener.queue = [];
                            console.log("Checking gardener: ", gardener.nick, queue);
                            for (var i = 0; i < queue.length; i++) {
                                var roll_match =
                                        /Roll (blink|blink) (\d+):(\d+)/i.exec(queue[i].summary) ||
                                        /(blink|blink) roll (\d+):(\d+)/i.exec(queue[i].summary) ||
                                        /(blink|blink) roll (\d+)-&gt;(\d+)/i.exec(queue[i].summary);
;
                                if (roll_match) {
                                    queue[i].start = roll_match[2];
                                    queue[i].end = roll_match[3];
                                    gardener.queue.push(queue[i]);
                                }
                            }
                            console.log(gardener.nick + "'s queue: ", gardener.queue);

                            if (--pending == 0)
                                callback(result);
                        });
                    });
            }
            if (!pending)
                callback([]);
        }
    };
    xhr.send();
}
