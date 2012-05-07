
var backgroundPage = chrome.extension.getBackgroundPage();
window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
    window.webkitResolveLocalFileSystemURL;

document.addEventListener('DOMContentLoaded', function() {
  update(backgroundPage.buildStatus.webkit_version);
  console.log('buildstatus: ', backgroundPage.buildStatus);
  setEntries(backgroundPage.feed);

  // hook up other event listeners
  var refreshButton = document.getElementById('refresh-button');
  refreshButton.onclick = function() {
    console.log("Refreshing background page from ", backgroundPage.refreshn);
    backgroundPage.refresh(update, setEntries);
  };

  var nameInput = $('#changelog-name');
  nameInput.val(localStorage.getItem("email"));
  nameInput.bind('change', function(e) {
    console.log("Trying to store in ", $(this));
    localStorage.setItem("email", $(this).val().trim());
  });
});

function update(val) {
  document.getElementById('webkit-version').innerText = val;
};

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
    if (webkit_version >= entry.svn_id) {
      landing_status = "landed";
      if (entry.patch_by == currentEmail ||
          entry.author == currentEmail) {
        currentLanded.push(entry);
        mine = true;
      }
      landed += 1;
      if (!first_landed)
        first_landed = entry.svn_id;
    } else {
      landing_status = "pending";
      if (entry.patch_by == currentEmail ||
          entry.author == currentEmail) {
        currentPending.push(entry);
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
  });

  if (currentLanded.length > 0) {
    var currentLandedDiv = $('#current-landed').empty();
    currentLanded.forEach(function(entry, i) {
      if (i != 0) {
        $('<span>, </span>').appendTo(currentLandedDiv);
      }
      $('<a>').attr('href', '#svn' + entry.svn_id)
      .addClass('landed')
      .text(entry.bug).appendTo(currentLandedDiv);
    });
  } else {
    $('#landed-title').hide();
  }

  $('#chrome-status').empty();
  $('<td>').attr('colspan', pending)
      .text('Chromium')
          .appendTo('#chrome-status');
  $('<td>').html('&#8628;')
      .appendTo('#chrome-status');

  if (currentPending.length > 0) {
    var currentPendingDiv = $('#current-pending').empty();
    currentPending.forEach(function(entry, i) {
      if (i != 0) {
        $('<span>, </span>').appendTo(currentPendingDiv);
      }
      $('<a>').attr('href', '#svn' + entry.svn_id)
      .addClass('pending')
      .text(entry.bug).appendTo(currentPendingDiv);
    });
  } else {
    $('#pending-title').hide();
  }

}