'use strict';
/* background.js handles communication with the server application. */

/* Identifies the Crunchyroll tab and keeps useful information under its tabId (socket, roomId) */
const tabsInfo = {};

loadStyles();

/* Searching through, I don't actually think this regex is used for anything.
 * It may be safe to remove it. */
const regex = /http.*:\/\/www\.crunchyroll.*\/[^\/]+\/episode.*/;

/* On installation, set rule for when to make the extension popup available (popup.html, popup.js)
 * In this case, we have to be on www.crunchyroll.*, and the page has to contain a vilos-player
 * in an iframe.*/
chrome.runtime.onInstalled.addListener(function (details) {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { urlMatches: "http.?:\/\/[^\.]*\.crunchyroll\." },
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { urlMatches: "http.?:\/\/www\.wakanim.*\/[^\/]+\/.*" },
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { urlMatches: "http.*:\/\/www\.funimation.*\/[^\/]+\/.*" },
        })
      ],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });

  if (details.reason == "install" || details.reason == "update") {
    setHasShownReleaseNotes(false);
  }
});

/* Disconnect from server when closing tab */
chrome.tabs.onRemoved.addListener(function (tabId) {
  disconnectWebsocket(tabId);
  delete tabsInfo[tabId];
});

/* Setup connection with content_script in tab */
async function handleWebpageConnection(tab) {
  const tabId = tab.id;

  if (!tabsInfo[tabId]) {
    tabsInfo[tabId] = { tabId };
  }
}

/* Runs update() function from popup.js if Popup is active */
function tryUpdatePopup() {
  try {
    updatePopup && updatePopup();
  } catch {
    // Do nothing as the popup is probably just closed
  }
}

/* Disconnects from server
 * Used by: chrome.tabs.onRemoved listener, sendConnectionRequestToWebpage function
 */
function disconnectWebsocket(tabId) {
  if (!tabsInfo[tabId]) {
    return;
  }
  const { socket } = tabsInfo[tabId]

  chrome.tabs.sendMessage(tabId, { type: BackgroundMessageTypes.ROOM_DISCONNECT });

  if (socket) {
    socket.disconnect();
    delete tabsInfo[tabId].socket;
    delete tabsInfo[tabId].roomId;
  }

  tryUpdatePopup();
}

chrome.runtime.onMessage.addListener(
  function (msg, sender) {
    const type = msg.type;
    const tabId = sender.tab.id;
    const tabInfo = tabsInfo[tabId];
    const url = sender.tab.url;
    /* if update, { state, currentProgress, type, roomId }
     * if chat,   { nick, message, type, roomId }*/

    switch (type) {
      /* Handles new connection from content_script in tab.
       * Originates from runContentScript in content_script.js */
      case WebpageMessageTypes.CONNECTION:
        log('Received webpage message', { type, state: msg.state, currentProgress: msg.currentProgress, url, sender });
        handleWebpageConnection(sender.tab)
        break;
      /* Handles connection to join a room.
       * Originates from createRoomButton.onclick in popup.js */
      case WebpageMessageTypes.ROOM_CONNECTION:
        log('Received webpage message', { type, state: msg.state, currentProgress: msg.currentProgress, url, sender });
        connectWebsocket(tabId, msg.currentProgress, msg.state, msg.roomId);
        break;
      /* Submits local video status/progress updates.
       * Originates from handleLocalAction in content_script.js */
      case (WebpageMessageTypes.LOCAL_UPDATE):
        log('Received webpage message', { type, state: msg.state, currentProgress: msg.currentProgress, url, sender });
        tabInfo.socket && tabInfo.socket.emit('update', msg.state, msg.currentProgress);
        break;
      /* Submits local chat message
       * Originates from ?? in content_script.js */
      case (WebpageMessageTypes.LOCAL_CHAT):
        log('Received webpage message', { type, nick: msg.nick, message: msg.message, url, sender });
        tabInfo.socket && tabInfo.socket.emit('chat', msg.nick, msg.message);
        break;
      default:
        throw "Invalid WebpageMessageType " + type;
    }
  }
);

/* Handle State/Progress update from server. Called from listeners set up in
 * connectWebsocket. */
function sendUpdateToWebpage(tabId, roomState, roomProgress) {
  log('Sending update to webpage', { tabId, roomState, roomProgress });
  const tabInfo = tabsInfo[tabId];

  const type = BackgroundMessageTypes.REMOTE_UPDATE;
  chrome.tabs.sendMessage(tabId, { type, roomState, roomProgress });
}

/* Handle chat messages from server. Called from listeners set up in
 * connectWebsocket. */
function sendChatToWebpage(tabId, nick, message) {
  log('Sending chat to webpage', { tabId, nick, message });
  const tabInfo = tabsInfo[tabId];

  const type = BackgroundMessageTypes.REMOTE_CHAT;
  chrome.tabs.sendMessage(tabId, { type, nick, message });
}

function sendConnectionRequestToWebpage(tab, roomId) {
  const tabId = tab.id;
  const tabInfo = tabsInfo[tabId];

  if (tabInfo.socket != null) {
    if (roomId === tabInfo.roomId) {
      return;
    }
    disconnectWebsocket(tabId);
  }

  log('Sending connection request to webpage', { tab });

  /* If no socket is established or no roomId is registered on the tab, we initiate
   * a new socket connection. This message will be picked up by handleBackgroundMessage
   * in content_script.js, and treated by sendRoomConnectionMessage, which forwards it
   * again to the chrome.onMessage listener here in background.js.
   * From there, it goes to connectWebsocket, which establishes the connection.
   * This roundtrip happens to collect initial information about video status via
   * getStates in content_script.js, and is activated on new room connections from
   * createRoomButton.onclick in popup.js. */
  chrome.tabs.sendMessage(tab.id, { type: BackgroundMessageTypes.ROOM_CONNECTION, roomId: roomId });
}

/* Connect websocket to server. */
function connectWebsocket(tabId, videoProgress, videoState, roomId) {
  log('Connecting websocket', { tabId, videoProgress, videoState, roomId });
  const tabInfo = tabsInfo[tabId];

  let query = `videoProgress=${Math.round(videoProgress)}&videoState=${videoState}${(roomId ? `&room=${roomId}` : '')}`;

  getBackendUrl().then(function(url) {
    tabInfo.socket = io(url, { query });

    /* Listen for roomId and initial State and Progress from server. */
    tabInfo.socket.on('join', (receivedRoomId, roomState, roomProgress) => {
      tabInfo.roomId = receivedRoomId;
      log('Sucessfully joined a room', { roomId: tabInfo.roomId, roomState, roomProgress });
      tryUpdatePopup();

      sendUpdateToWebpage(tabId, roomState, roomProgress);
    });

    /* Listen for running updates of State and Progress from server. */
    tabInfo.socket.on('update', (id, roomState, roomProgress) => {
      log('Received update message from ', id, { roomState, roomProgress });
      sendUpdateToWebpage(tabId, roomState, roomProgress);
    });

    /* Listen for chat messages from server. */
    tabInfo.socket.on('chat', (id, nick, message) => {
      log('Received chat message from ', id, { nick, message });
      sendChatToWebpage(tabId, nick, message);
    });
});
}

function loadStyles() {
  const head = document.getElementsByTagName('head')[0];
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'styles.css';
  link.media = 'all';
  head.appendChild(link);
}

window.updatePopup = null;
window.createRoom = sendConnectionRequestToWebpage;
window.disconnectRoom = disconnectWebsocket;
window.getRoomId = (tabId) => tabsInfo[tabId] && tabsInfo[tabId].roomId;

log("Initialized");
