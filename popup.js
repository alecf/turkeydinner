var LOADING_STATUS = {
    haveChromiumLKGR: true,
    haveChromiumQueue: true,
    haveBlinkCommits: true,
    haveBlinkGardeners: true,
    haveBlinkQueue: true,
    haveBlinkVersion: true,
};
var backgroundPage = chrome.extension.getBackgroundPage();

window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
    window.blinkResolveLocalFileSystemURL;

document.addEventListener('DOMContentLoaded', function() {
    setBlinkVersion(backgroundPage.buildStatus.blink_version,
                     backgroundPage.buildStatus.chromium_blink_version);

    setChromiumQueue(backgroundPage.buildStatus.chromium_queue);

    setBlinkCommits(backgroundPage.buildStatus.blink_feed);
    setChromiumLKGR(backgroundPage.buildStatus.chromium_lkgr);
    setBlinkGardeners(backgroundPage.buildStatus.blink_gardeners);

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
    console.log("Loading status: ", LOADING_STATUS);
    for (var k in LOADING_STATUS)
        LOADING_STATUS[k] = false;
    refreshProgress();
    backgroundPage.refresh(setBlinkVersion, setBlinkCommits, setChromiumQueue, setChromiumLKGR, setBlinkGardeners);
}

var chart_loaded = false;
function pieChart(span, data) {
    console.log("entering pieChart(", span, ", ", data);
    var data2 = google.visualization.arrayToDataTable(data);
    var span2 = $('<span class="piechart">').appendTo(span).get(0);
    console.log("    span = ", span);
    console.log("    data = ", data);
    function draw_chart() {
        console.log("span ", span2, " -> draw ", data2);
        var chart = new google.visualization.PieChart(span2);
        chart.draw(data2);
    }
    if (!chart_loaded)
        google.setOnLoadCallback(draw_chart);
    else
        draw_chart();
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
    // this is ugly - would like to unify this without having to
    // resort to type checking :(
    if (!text || typeof text == "string" || typeof text == "number") {
        if ($elmt.text() != text) {
            $elmt.text(text);
            if (!wasEmpty)
                $elmt.animate({ backgroundColor: '#f00' }, 100)
            .animate({ backgroundColor: '#fff' }, 1000);
        }
    } else {
        if ($elmt.text() != text.text()) {
            $elmt.empty().append(text);
            if (!wasEmpty)
                $elmt.animate({ backgroundColor: '#f00' }, 100)
                .animate({ backgroundColor: '#fff' }, 1000);
        }
    }
    return $elmt;
}

function setBlinkVersion(blink_version, chromium_version, initializing) {
    console.log("setBlinkVersion got ", blink_version, chromium_version);
    LOADING_STATUS.haveBlinkVersion = true;
    fadeShow($('#blink-version'), blink_version);
    chromium_version = chromium_version || "";
    fadeShow($('#chromium-blink-version'), chromium_version);
    refreshProgress();
};


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
        var url = 'https://codereview.chromium.org/' + entry.id;
        var title = entry.bug ? ("Chromium Bug #" + entry.bug) : ("Chromium Patch " + entry.id);
        if (entry.commit)
            title += " (committed as r" + entry.commit + ")";
        else if (entry.status != 'closed' && entry.aborted) {
            title += "\n" + entry.aborted;
            span.addClass('aborted');
        }
        else if (entry.status != 'closed' && entry.cqUrl) {
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

function setBlinkCommits(blink_feed) {
    LOADING_STATUS.haveBlinkCommits = true;
    var entries = blink_feed.entries;
    var feedRow = $('#feed-entries');
    feedRow.empty();

    var blink_version = backgroundPage.buildStatus.blink_version;

    var gardeners = backgroundPage.buildStatus.blink_gardeners;
    var blink_next_roll = 0;
    if (backgroundPage.buildStatus.blink_gardeners) {
        for (var i = 0; i < gardeners.length ; i++) {
            var gardener = gardeners[i];
            for (var j = 0; j < gardener.queue.length; j++)
                blink_next_roll = Math.max(blink_next_roll, gardener.queue[j].end);
        }
    }
    var blink_roll_entry;
    var pending = 0;
    var landed = 0;
    var first_landed;
    var currentEmail = localStorage.getItem("email");
    var currentLanded = [];
    var currentPending = [];
    var columns = 0;

    // break up the list of all commits into what is pending (landed
    // but not rolled) and what has landed and shows up in the roll.
    entries.forEach(function(entry, i) {
        var author;
        if (entry.patch_by) {
            if (entry.author != 'commit-queue@blink.org') {
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
        if (blink_version >= entry.svn_id) {
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

        // the exact SVN id doesn't always appear
        if (!blink_roll_entry && blink_next_roll >= entry.svn_id) {
            blink_next_roll = 0;
            blink_roll_entry = entry;
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
        $('<div class="blink-trac">').html(blinkTracLink(entry.svn_id)).appendTo(details);
        $('<div class="date">').text(date).appendTo(details);
        var title = $("<span>").html(linkify(entry.title));
        title.find("a").attr("target", "_new");
        $('<div class="title">').html(title).appendTo(details);
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
    if (blink_roll_entry) {
        $('<tr class="rev roll"><td colspan=' + blink_roll_entry.column + '></td><td colspan=20>&#8595;next roll:' + blink_roll_entry.svn_id + '</td></tr>').insertAfter('#chrome-status');

    }
    // each commit gets its own rows for a nice stair-step effect
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
            $('<a target="turkeydinner-blink-svn">').attr('href', 'https://trac.blink.org/changeset/' + entry.svn_id)
                .addClass('landed entry')
                    .text(entry.bug).appendTo(currentLandedDiv);
        });
        $('#blink-landed-title').show();
    } else {
        $('#blink-landed-title').hide();
    }

    // Insert last roll
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
            $('<a target="turkeydinner-blink-svn">').attr('href', 'https://trac.blink.org/changeset/' + entry.svn_id)
                .addClass('pending entry')
                .attr('title', entry.title)
                .text(entry.bug).appendTo(currentPendingDiv);
        });
        $('#blink-pending-title').show();
    } else {
        $('#blink-pending-title').hide();
    }

    refreshProgress();
}

function setChromiumLKGR(lkgr, initializing) {
    LOADING_STATUS.haveChromiumLKGR = true;
    console.log("LKGR = ", lkgr);
    fadeShow($('#chromium-lkgr'), lkgr);
}

function setBlinkGardeners(gardeners) {
    LOADING_STATUS.haveBlinkGardeners = true;
    // console.log("gardeners = ", gardeners);
    if (!gardeners)
        return;
    var gardenerSpan = $('<span>');
    gardeners.forEach(function(gardener) {
        var max_rev = "";
        var max_rev_bug;
        gardener.queue.forEach(function(entry) {
            if (entry.end > max_rev) {
                max_rev = entry.end;
                max_rev_bug = entry.id;
            }
        });
        var gardener_note = '&nbsp;(' + gardener.queue.length + ')&nbsp;';
        if (max_rev) {
            if (gardener.queue.length == 1)
                gardener_note = $('<span>&nbsp;(<a target="_new" href="https://codereview.chromium.org/' +
                                  max_rev_bug + '">next roll</a> probably r' + max_rev+ ')&nbsp;</span>');
            else
                gardener_note = $('<span>&nbsp;(<a target="_new" href="https://codereview.chromium.org/' +
                                  max_rev_bug + '">next roll</a> <i>may be</i> r' + max_rev+ ')&nbsp;</span>');
        }
        $('<span><a target="_new"></a></span>')
            .children('a').text(gardener.nick).attr('href', 'https://codereview.chromium.org/user/' + gardener.nick + "@chromium.org")
            .parent().append(gardener_note)
            .appendTo(gardenerSpan);
        });
    fadeShow($('#blink-gardeners'), gardenerSpan);
    refreshProgress();
}
