function requestWebkitVersion(callback) {
  // first request the latest version out of the git repository
  var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://git.chromium.org/gitweb/?p=chromium/src.git;a=blob_plain;f=DEPS;hb=refs/heads/master');
    console.log("Trying to set badge text on ", chrome, ".", chrome.browserAction);
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
                    requestChromiumVersionForWebkitRoll(val, callback);
                    break;
                }
            }
        }
    };
    xhr.send();
}


function requestChromiumVersionForWebkitRoll(webkitVersion, callback) {
    requestFeed('http://git.chromium.org/gitweb/?p=chromium/src.git;a=atom;f=DEPS;h=refs/heads/master',
                function(feed) {
                    var found = false;
                    $('entry', feed).each(function(i, entry) {
                        var comments = $('content', entry).text();

                        // at least has to mention webkit
                        if (!/webkit/i.exec(comments))
                            return true;
                        // this is cheezy - we could possibly request the rss feed for the issue, then
                        // look at the latest diff in the issue?
                        var match = /(\d+):(\d+)/m.exec(comments);
                        if (match) {
                            var from = match[1];
                            var to = match[2];
                            var svn_match = /git-svn-id:\s+svn:\/\/svn.chromium.org\/chrome\/trunk\/src@(\d+)/m.exec(comments);
                            if (to == webkitVersion) {
                                found = true;
                                if (callback)
                                    callback(webkitVersion, svn_match ? svn_match[1] : "???");
                                return false;
                            }
                        }
                        // var match = /Review URL:\s+https:\/\/chromiumcodereview.appspot.com\/(\d+)/m.exec(comments);
                        // if (match) {
                        //     var id = match[1];
                        //     console.log("DEPS log entry[" + i + "] => Chromium issue ", id);
                        //     //requestChromiumIssue(id, function(result)
                        // }
                    });
                    if (!found && callback)
                        callback(webkitVersion);
                });
}


function requestFeed(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);

  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      // look in the xml, bleah

        if (callback) {
            callback(xhr.responseXML);
        }
    }
  };
  xhr.send();

}

function requestAllChromium(nick, callback) {
    // super cheesy, not parallel right now
    requestChromiumList(nick, 'mine', function(mine) {
        requestChromiumList(nick, 'closed', function(closed) {
            console.log("DONE with all chromium: ", mine.concat(closed));
            var full_list = mine.concat(closed);
            full_list.sort(function(a, b) { return b.timestamp.localeCompare(a.timestamp); });
            callback(full_list);
        });
    });
}

function requestChromiumIssue(id, callback) {
    requestFeed('https://codereview.chromium.org/rss/issue/' + id, callback);
}

function requestChromiumList(nick, type, callback) {
    requestFeed('https://codereview.chromium.org/rss/' + type + '/' + nick, function(doc) {
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
                requestChromiumIssue(id, function(doc) {
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
                        callback(result);
                    }
                });
            }
        });
        if (!pending) {
            callback([]);
        }

    });
}

function requestChromiumFeed(callback) {
  return requestFeed('http://git.chromium.org/gitweb/?p=chromium.git;a=atom;h=refs/heads/trunk', callback);
}

function requestWebkitFeed(callback) {
  return requestFeed('http://git.chromium.org/gitweb/?p=external/WebKit_trimmed.git;a=atom;h=refs/heads/master', callback);
}

function requestBugzillaFeed(email, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://bugs.webkit.org/buglist.cgi?bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&emailassigned_to1=1&emailtype1=substring&email1=' + email + '&ctype=atom');
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
            console.log("Attachment ready ", url);
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
    xhr.open('GET', 'http://webkit-commit-queue.appspot.com/queue-status/commit-queue');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            callback($(xhr.responseText));
        }
    };
    xhr.send();
}

function requestQueueList(callback) {
    requestQueuePage(function(doc) {
        var result = [];
        var rows = $('tr', doc);
        rows.each(function(i, row) {
            // only use data cells, not headers
            var cells = $('td', row);
            if (cells.length == 3) {
                var hashPosition = $(cells[0]).text();
                var position = /\d+/.exec(hashPosition);
                result.push({position: position ? parseInt(position[0]) : hashPosition,
                             patch: $(cells[1]).text().trim(),
                             time: $(cells[2]).text().trim()});
            }
        });
        callback(result);
    });
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


function requestQueuePositions(email, callback) {
    var queueList, bugList;
    requestQueueList(function(q) {
        console.log("DONE with queue: ", q);
        queueList = q;
        maybeRun(bugList, queueList, callback);
    });

    if (email) {
        requestBugzillaList(email, function(b) {
            console.log("DONE with bugs", b);
            bugList = b;
            maybeRun(bugList, queueList, callback);
        });
    } else {
        maybeRun([], queueList, callback);
    }
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

function webkitTracLink(svn_id) {
    var url = 'https://trac.webkit.org/changeset/' + svn_id;
    return '<a href="' + url + '" title="' + url + '">r' + svn_id+ '</a>';
}

function requestWebKitGardeners(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://chromium-build.appspot.com/p/chromium/sheriff_webkit.js');
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var js = xhr.responseText;
            var match =/document.write\(['"](.*)['"]\)+/.exec(js);
            if (match) {
                var names = [];
                var nameList = match[1].split(',').forEach(
                    function(s) { names.push(s.trim()); });
                callback(names);
            } else {
                callback([]);
            }
        }

    };
}
