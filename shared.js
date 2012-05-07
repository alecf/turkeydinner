function requestWebkitVersion(callback) {
  // first request the latest version out of the git repository
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://git.chromium.org/gitweb/?p=chromium/src.git;a=blob_plain;f=DEPS;hb=refs/heads/master');
  chrome.browserAction.setBadgeText({"text": "..."});
  xhr.onreadystatechange = function() {
    console.log("onreadystatechange: ", xhr);
    if (xhr.readyState == 4) {
      console.log("Ready state: ", xhr);
      var new_lines = [];
      var lines = xhr.responseText.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var revision = line.indexOf('"webkit_revision":');
        if (revision != -1) {
          console.log("Found webkit_version line: ", line);
          var val = line.split(":")[1].split('"')[1];
          if (callback) {
            callback(val);
          }
          break;
        }
      }
    }
  };
  xhr.send();
}

function requestWebkitFeed(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://git.chromium.org/gitweb/?p=external/WebKit_trimmed.git;a=atom;h=refs/heads/master');

  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      // look in the xml, bleah

      console.log("Found atom feed: ", xhr);
      if (callback) {
        callback(xhr.responseXML);
      }
    }
  };
  xhr.send();
}
