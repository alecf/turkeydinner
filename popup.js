var haveEntries = true, haveVersion = true, haveQueue = true;
var backgroundPage = chrome.extension.getBackgroundPage();

window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
    window.webkitResolveLocalFileSystemURL;

document.addEventListener('DOMContentLoaded', function() {
    updateWebkitVersion(backgroundPage.buildStatus.webkit_version);

    setQueued(backgroundPage.buildStatus.queue);

    setEntries(backgroundPage.feed);

    // hook up other event listeners
    var refreshButton = document.getElementById('refresh-button');
    refreshButton.onclick = function() {
        haveEntries = haveVersion = haveQueue = false;
        refreshProgress();
        console.log("I'd like to refresh with ", chrome.browserAction);
        backgroundPage.refresh(localStorage.getItem("email"),
                               localStorage.getItem("review-nick"),
                               updateWebkitVersion, setEntries, setQueued);
    };

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
});

function updateVersionBehind() {
    if (!haveVersion || !haveEntries)
        return;
    
    var behindCount = 0;
    var currentRollVersion = backgroundPage.buildStatus.webkit_version;
    console.log("Updating from feed ", backgroundPage.feed, 
                " against svn version ", currentRollVersion);
    backgroundPage.feed.entries.forEach(
        function(entry, i) {
            if (entry.svn_id > currentRollVersion)
                behindCount++;
        });
    
    $('#webkit-behind').text("(behind " + behindCount + ")");
}

function refreshProgress() {
    if (haveEntries && haveVersion && haveQueue) {
        $('#progress').text('');
    } else {
        $('#progress').text('Loading...');
    }
}

function updateWebkitVersion(val) {
    document.getElementById('webkit-version').innerText = val;
    haveVersion = true;
    refreshProgress();
    updateVersionBehind();
};

function setQueued(queue) {
    var currentQueuedDiv = $('#current-queued');
    if (queue && queue.length)
        $('#queued-title').show();
    else
        $('#queued-title').hide();

    haveQueue = true;
    refreshProgress();

    if (!queue)
        return;

    currentQueuedDiv.empty();
    queue.forEach(function(entry, i) {
        if (i != 0) {
            $('<span>, </span>').appendTo(currentQueuedDiv);
        }
        console.log("Loaded queue entry: ", entry);
        var position = '#' + entry.position;
        if (entry.locked)
            position += " locked: " + entry.locked;
        var span = $('<span>').appendTo(currentQueuedDiv);
        $('<a target="_new"></a>').attr('href', 'http://wkb.ug/' + entry.bug).text(entry.bug)
        .appendTo(span);
        $('<span>: </span>').appendTo(span);
        $('<a target="turkeydinner-queue"></a>').attr('href', 'http://webkit-commit-queue.appspot.com/queue-status/commit-queue').text(position)
        .appendTo(span);
    });
}

function setEntries(feed) {
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
        var details = $('<div>').addClass('entry-details').appendTo(listItem);
        $('<div class="author">').text(author).appendTo(details);
        $('<div class="date">').text(date).appendTo(details);
        $('<div class="title">').text(entry.title).appendTo(details);
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
        $('#landed-title').show();
    } else {
        $('#landed-title').hide();
    }

    $('<td>').attr('colspan', pending)
        .text('Chromium')
            .appendTo('#chrome-status');
    $('<td>').html('&#8628;')
        .appendTo('#chrome-status');

    if (currentPending.length > 0) {
        var currentPendingDiv = $('#current-pending').empty();
        currentPending.forEach(function(entry, i) {
            var entryRow;
            if (entry.column < pending) {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + '"></td><td>&#8595;</td><td colspan=10>' + entry.bug + '</td></tr>');
            } else {
                entryRow = $('<tr class="rev"><td colspan=' + entry.column + ' style="text-align: right">' + entry.bug + '</td><td>&#8628;</td></tr>');
            }
            entryRow.insertBefore('#chrome-status');
            if (i != 0) {
                $('<span>, </span>').appendTo(currentPendingDiv);
            }
            $('<a target="turkeydinner-webkit-svn">').attr('href', 'http://trac.webkit.org/changeset/' + entry.svn_id)
                .addClass('pending')
                    .text(entry.bug).appendTo(currentPendingDiv);
        });
        $('#pending-title').show();
    } else {
        $('#pending-title').hide();
    }

    haveEntries = true;
    refreshProgress();
    updateVersionBehind();
}