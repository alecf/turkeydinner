var LOADING_STATUS = {
    haveWebkitCommits: true,
    haveWebkitVersion: true,
    haveWebkitQueue: true,
    haveChromiumQueue: true,
    haveChromiumLKGR: true,
};
var backgroundPage = chrome.extension.getBackgroundPage();

window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
    window.webkitResolveLocalFileSystemURL;

document.addEventListener('DOMContentLoaded', function() {
    setWebkitVersion(backgroundPage.buildStatus.webkit_version,
                        backgroundPage.buildStatus.chromium_webkit_version);

    setWebkitQueue(backgroundPage.buildStatus.queue);
    setChromiumQueue(backgroundPage.buildStatus.chromium_queue);

    setWebkitCommits(backgroundPage.feed);
    setChromiumLKGR(backgroundPage.buildStatus.chromium_lkgr);

    // hook up other event listeners
    $('#refresh-button').click(function() {
        refreshAll();
    });

    var nameInput = $('#changelog-name');
    nameInput.val(localStorage.getItem("email"));
    nameInput.bind('change', function(e) {
        localStorage.setItem("email", $(this).val().trim());
    });

    var nickInput = $('#review-nick');
    nickInput.val(localStorage.getItem("review-nick"));
    nickInput.bind('change', function(e) {
        localStorage.setItem("review-nick", $(this).val().trim());
    });

    var now = new Date();
    if (backgroundPage.buildStatus.last_refresh && (now - backgroundPage.buildStatus.last_refresh) > (1000 * 60)) {
        refreshAll();
    }

});

function refreshAll() {
    for (var k in LOADING_STATUS)
        LOADING_STATUS[k] = false;
    refreshProgress();
    backgroundPage.refresh(setWebkitVersion, setWebkitCommits, setWebkitQueue, setChromiumQueue, setChromiumLKGR);
}

function refreshProgress() {
    var fullyLoaded = true;
    var loaded = 0;
    var total = 0;
    for (var k in LOADING_STATUS) {
        total++;
        loaded += LOADING_STATUS[k] ? 1 : 0;
        fullyLoaded = fullyLoaded && LOADING_STATUS[k];
    }
    if (fullyLoaded) {
        $('#progress').text('');
        $('#refresh-button').removeAttr('disabled');
    } else {
        $('#progress').text('Loading... (' + loaded + "/" + total + ")");
        $('#refresh-button').attr('disabled', 'true');
    }
}

function fadeShow($elmt, text) {
    if (!$elmt || !$elmt.length)
        console.error("oops.. no element", $elmt && $elmt.selectorb);
    var background = $elmt.css('background-color');

    var wasEmpty = !$elmt.text();
    console.log("Existing text for ", $elmt, ": ", $elmt.text(), " = ", wasEmpty);
    if ($elmt.text() != text) {
        $elmt.text(text);
        if (!wasEmpty)
            $elmt.animate({ backgroundColor: '#f00' }, 100)
            .animate({ backgroundColor: '#fff' }, 1000);
    }
    return $elmt;
}

function setWebkitVersion(webkit_version, chromium_version, initializing) {
    console.log("setWebkitVersion got ", webkit_version, chromium_version);
    LOADING_STATUS.haveWebkitVersion = true;
    fadeShow($('#webkit-version'), webkit_version);
    chromium_version = chromium_version || "";
    fadeShow($('#chromium-webkit-version'), chromium_version);
    refreshProgress();
};

function setWebkitQueue(queue) {
    LOADING_STATUS.haveWebkitQueue = true;
    refreshProgress();
    var parentDiv = $('#webkit-queue-title');
    var currentQueueDiv = parentDiv.find('.current-queue');
    currentQueueDiv.empty();
    if (queue && queue.length)
        parentDiv.show();
    else {
        parentDiv.hide();
        return;
    }

    if (!queue)
        return;

    queue.forEach(function(entry, i) {
        if (i != 0)
            $('<span>, </span>').appendTo(currentQueueDiv);

        var span = $('<span>').appendTo(currentQueueDiv);
        var url = 'http://wkb.ug/' + entry.bug;
        var text = entry.bug;
        var title = entry.summary;
        $('<a target="_new"></a>').text(text)
            .attr('href', url).attr('title', title)
            .appendTo(span);

        // webkit queue position?
        var position = '#' + entry.position;
        if (entry.locked)
            position += " locked: " + entry.locked;
        $('<span>: </span>').appendTo(span);
        $('<a target="turkeydinner-queue"></a>').text(position)
            .attr('href', 'http://webkit-commit-queue.appspot.com/queue-status/commit-queue')
            .appendTo(span);
    });
}

function setChromiumQueue(queue) {
    LOADING_STATUS.haveChromiumQueue = true;
    refreshProgress();
    var oneWeekAgo = new Date(new Date() - 7*24*60*60*1000).toISOString();
    var parentDiv = $('#chromium-queue-title');
    var currentQueueDiv = parentDiv.find('.current-queue');
    currentQueueDiv.empty();
    if (queue && queue.length)
        parentDiv.show();
    else {
        parentDiv.hide();
        return;
    }
    queue.forEach(function(entry) {
        if (entry.timestamp < oneWeekAgo)
            return;

        var position = '#' + entry.position;
        if (entry.locked)
            position += " locked: " + entry.locked;
        var span = $('<span class="' + entry.type + ' entry">').appendTo(currentQueueDiv);
        var url = 'http://codereview.chromium.org/' + entry.id;
        var title = entry.bug ? ("Chromium Bug #" + entry.bug) : ("Chromium Patch " + entry.id);
        if (entry.commit)
            title += " (committed as r" + entry.commit + ")";
        else if (entry.aborted) {
            title += "\n" + entry.aborted;
            span.addClass('aborted');
        }
        else if (entry.cqUrl) {
            span.addClass('pending');
            title += " (in commit queue)";
        }
        if (entry.summary)
            title += "\n" + entry.summary;
        var text = entry.bug || ("[" + entry.id + "]");
        $('<a target="_new"></a>').text(text).attr('href', url)
            .attr('title', title)
            .appendTo(span);
    });

}

function setWebkitCommits(feed) {
    LOADING_STATUS.haveWebkitCommits = true;
    var entries = feed.entries;
    var feedRow = $('#feed-entries');
    feedRow.empty();

    var webkit_version = backgroundPage.buildStatus.webkit_version;
    var pending = 0;
    var landed = 0;
    var first_landed;
    var currentEmail = localStorage.getItem("email");
    var currentLanded = [];
    var currentPending = [];
    var columns = 0;
    entries.forEach(function(entry, i) {
        var author;
        if (entry.patch_by) {
            if (entry.author != 'commit-queue@webkit.org') {
                author = entry.patch_by + " (reviewed by " + entry.author + ")";
            } else {
                author = entry.patch_by + " (commit-queue)";
            }
        } else {
            author = entry.author;
        }

        var landing_status;
        var mine = false;
        entry.column = columns;
        if (webkit_version >= entry.svn_id) {
            landing_status = "landed";
            if (currentEmail &&
                (entry.patch_by == currentEmail) ||
                (entry.author == currentEmail)) {
                currentLanded.unshift(entry);
                mine = true;
            }
            landed += 1;
            if (!first_landed)
                first_landed = entry.svn_id;
        } else {
            landing_status = "pending";
            if (currentEmail &&
                (entry.patch_by == currentEmail) ||
                (entry.author == currentEmail)) {
                currentPending.unshift(entry);
                mine = true;
            }
            pending += 1;
        }
        var listItem = $('<td>').attr('title', entry.svn_id);
        if (mine)
            listItem.addClass('mine');

        var itembox = $('<a>').attr('name', 'svn' + entry.svn_id).html('&nbsp;')
            .addClass(landing_status)
        .appendTo(listItem);
        var date = new Date(entry.updated);
        var details = $('<div>').addClass('entry-details').appendTo(listItem);
        $('<div class="author">').text(author).appendTo(details);
        $('<div class="webkit-trac">').html(webkitTracLink(entry.svn_id)).appendTo(details);
        $('<div class="date">').text(date).appendTo(details);
        $('<div class="title">').html(linkify(entry.title)).appendTo(details);
        listItem.appendTo(feedRow);

        itembox.hover(
            function() {
                $('#entry-details').empty();
                var details = $(this).parent().find('.entry-details');
                details.clone().show().appendTo('#entry-details');
            },
            function() {

            });
        columns++;
    });

    $('#chrome-status').empty();
    $('tr.rev').remove();
    if (currentLanded.length > 0) {
        var currentLandedDiv = $('.current-landed').empty();
        currentLanded.forEach(function(entry, i) {
            var entryRow;
            if (entry.column < pending) {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + '"></td><td>&#8595;</td><td colspan=10>' + entry.bug + '</td></td></tr>');
            } else {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + ' style="text-align: right">' + entry.bug + '</td><td>&#8628;</td></tr>');
            }
            entryRow.insertAfter('#chrome-status');
            $('<a target="turkeydinner-webkit-svn">').attr('href', 'http://trac.webkit.org/changeset/' + entry.svn_id)
                .addClass('landed entry')
                    .text(entry.bug).appendTo(currentLandedDiv);
        });
        $('#webkit-landed-title').show();
    } else {
        $('#webkit-landed-title').hide();
    }

    $('<td>').attr('colspan', pending)
        .text('Chromium')
            .appendTo('#chrome-status');
    $('<td>').html('&#8628;')
        .appendTo('#chrome-status');

    if (currentPending.length > 0) {
        var currentPendingDiv = $('.current-pending').empty();
        currentPending.forEach(function(entry, i) {
            var entryRow;
            if (entry.column < pending) {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + '"></td><td>&#8595;</td><td colspan=10>' + entry.bug + '</td></tr>');
            } else {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + ' style="text-align: right">' + entry.bug + '</td><td>&#8628;</td></tr>');
            }
            entryRow.prependTo($('#chrome-status').parent());
            if (i != 0) {
                $('<span>, </span>').appendTo(currentPendingDiv);
            }
            $('<a target="turkeydinner-webkit-svn">').attr('href', 'http://trac.webkit.org/changeset/' + entry.svn_id)
                .addClass('pending entry')
                .attr('title', entry.title)
                .text(entry.bug).appendTo(currentPendingDiv);
        });
        $('#webkit-pending-title').show();
    } else {
        $('#webkit-pending-title').hide();
    }

    refreshProgress();
}

function setChromiumLKGR(lkgr, initializing) {
    LOADING_STATUS.haveChromiumLKGR = true;
    console.log("LKGR = ", lkgr);
    fadeShow($('#chromium-lkgr'), lkgr);
}
