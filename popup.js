var haveEntries = true, haveVersion = true, haveWebkitQueue = true, haveChromiumQueue = true;
var backgroundPage = chrome.extension.getBackgroundPage();

window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
    window.webkitResolveLocalFileSystemURL;

document.addEventListener('DOMContentLoaded', function() {
    update(backgroundPage.buildStatus.webkit_version);

    setWebkitQueue(backgroundPage.buildStatus.queue);
    setChromiumQueue(backgroundPage.buildStatus.chromium_queue);

    setWebkitCommits(backgroundPage.feed);

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
    console.log("Checking backgroundPage.lastRefresh = ", backgroundPage.lastRefresh);
    if (backgroundPage.buildStatus.last_refresh && (now - backgroundPage.buildStatus.last_refresh) > (1000 * 60)) {
        refreshAll();
    }

});

function refreshAll() {
    haveEntries = haveVersion = haveWebkitQueue = haveChromiumQueue = false;
    refreshProgress();
    backgroundPage.refresh(update, setWebkitCommits, setWebkitQueue, setChromiumQueue);
}

function refreshProgress() {
    console.log(haveEntries, haveVersion, haveWebkitQueue, haveChromiumQueue);
    if (haveEntries && haveVersion && haveWebkitQueue && haveChromiumQueue) {
        $('#progress').text('');
        $('#refresh-button').removeAttr('disabled');
    } else {
        $('#progress').text('Loading...');
        $('#refresh-button').attr('disabled', 'true');
    }
}

function update(val) {
    document.getElementById('webkit-version').innerText = val;
    haveVersion = true;
    refreshProgress();
};

function setWebkitQueue(queue) {
    haveWebkitQueue = true;
    refreshProgress();
    var parentDiv = $('#webkit-queue-title');
    var currentQueueDiv = parentDiv.find('.current-queue');
    if (queue && queue.length)
        parentDiv.show();
    else {
        parentDiv.hide();
        return;
    }


    if (!queue)
        return;

    currentQueueDiv.empty();
    queue.forEach(function(entry, i) {
        if (i != 0)
            $('<span>, </span>').appendTo(currentQueueDiv);

        console.log("Loaded webkit queue entry: ", entry);
        var position = '#' + entry.position;
        if (entry.locked)
            position += " locked: " + entry.locked;
        var span = $('<span>').appendTo(currentQueueDiv);
        $('<a target="_new"></a>')
            .attr('href', 'http://wkb.ug/' + entry.bug)
            .text(entry.bug).attr('title', entry.summary)
            .appendTo(span);
        $('<span>: </span>').appendTo(span);
        $('<a target="turkeydinner-queue"></a>').attr('href', 'http://webkit-commit-queue.appspot.com/queue-status/commit-queue').text(position)
        .appendTo(span);
    });
}

function setChromiumQueue(queue) {
    haveChromiumQueue = true;
    refreshProgress();
    var parentDiv = $('#chromium-queue-title');
    var currentQueueDiv = parentDiv.find('.current-queue');
    currentQueueDiv.empty();
    if (queue && queue.length)
        parentDiv.show();
    else {
        parentDiv.hide();
        return;
    }

    queue.forEach(function(entry, i) {
        if (i != 0)
            $('<span>, </span>').appendTo(currentQueueDiv);

        console.log("Loaded chrome queue entry: ", entry);
        var position = '#' + entry.position;
        if (entry.locked)
            position += " locked: " + entry.locked;
        var span = $('<span class="' + entry.type + '">').appendTo(currentQueueDiv);
        var url = entry.bug ? 'http://crbug.com/' + entry.bug :
                'http://codereview.chromium.org/' + entry.id;
        $('<a target="_new"></a>').attr('href', url)
            .attr('title', entry.bug ? ("Chromium Bug #" + entry.bug) : ("Chromium Patch " + entry.id))
            .attr('title', entry.summary)
            .text(entry.bug || ("(" + entry.id + ")"))
            .appendTo(span);
//        $('<span>: </span>').appendTo(span);
//        $('<a target="turkeydinner-queue"></a>').attr('href', 'http://webkit-commit-queue.appspot.com/queue-status/commit-queue').text(position)
//        .appendTo(span);
    });

}

function setWebkitCommits(feed) {
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
        if (mine) {
            listItem.addClass('mine');
        }
        var itembox = $('<a>').attr('name', 'svn' + entry.svn_id).html('&nbsp;')
            .addClass(landing_status)
        .appendTo(listItem);
        var date = new Date(entry.updated);
        backgroundPage.console.log("New webkit entry: ", entry);
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
        var currentLandedDiv = $('#current-landed').empty();
        currentLanded.forEach(function(entry, i) {
            var entryRow;
            if (entry.column < pending) {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + '"></td><td>&#8595;</td><td colspan=10>' + entry.bug + '</td></td></tr>');
            } else {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + ' style="text-align: right">' + entry.bug + '</td><td>&#8628;</td></tr>');
            }
            entryRow.insertAfter('#chrome-status');
            if (i != 0) {
                $('<span>, </span>').appendTo(currentLandedDiv);
            }
            $('<a target="turkeydinner-webkit-svn">').attr('href', 'http://trac.webkit.org/changeset/' + entry.svn_id)
                .addClass('landed')
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
                .addClass('pending')
                .attr('title', entry.title)
                .text(entry.bug).appendTo(currentPendingDiv);
        });
        $('#webkit-pending-title').show();
    } else {
        $('#webkit-pending-title').hide();
    }

    haveEntries = true;
    refreshProgress();
}