'use strict';
/* background.js handles communication with the server application. */

/* Identifies the Crunchyroll tab and keeps useful information under its tabId (socket, roomId) */
const tabsInfo = {};

loadStyles();

/* Searching through, I don't actually think this regex is used for anything.
 * It may be safe to remove it. */
const regex = /http.*:\/\/www\.crunchyroll.*\/[^\/]+\/episode.*/;

/* RT Icon color management */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  getExtensionColor().then(color => setIconColor(tabId, color));
});

/* On installation, set rule for when to make the extension popup available (popup.html, popup.js)
 * In this case, we have to be on www.crunchyroll.*, and the page has to contain a vilos-player
 * in an iframe.*/
chrome.runtime.onInstalled.addListener(function () {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({
        pageUrl: { urlMatches: "http.*:\/\/www\.crunchyroll.*\/[^\/]+\/.*" },
        css: ["iframe#vilos-player"]
      })],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
});

/* RT Icon color management */
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  getExtensionColor().then(color => setIconColor(tabId, color));
});

/* Disconnect from server when closing tab */
chrome.tabs.onRemoved.addListener(function (tabId) {
  disconnectWebsocket(tabId);
  delete tabsInfo[tabId];
});

async function handleWebpageConnection(tab, url) {
  const tabId = tab.id;

  if (!tabsInfo[tabId]) {
    tabsInfo[tabId] = { tabId };
  }

  const urlRoomId = getParameterByName(url, 'rollTogetherRoom');
  if (urlRoomId) {
    sendConnectionRequestToWebpage(tab);
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

  if (socket) {
    socket.disconnect();
    delete tabsInfo[tabId].socket;
    delete tabsInfo[tabId].roomId;
  }

  tryUpdatePopup();
}

chrome.runtime.onMessage.addListener(
  function ({ state, currentProgress, type }, sender) {
    const tabId = sender.tab.id;
    const tabInfo = tabsInfo[tabId];
    const url = sender.tab.url;
    const urlRoomId = getParameterByName(url);

    log('Received webpage message', { type, state, currentProgress, url, sender });
    switch (type) {
      /* Handles connection for existing room.
       * Originates from runContentScript in content_script.js */
      case WebpageMessageTypes.CONNECTION:
        handleWebpageConnection(sender.tab, url)
        break;
      /* Handles connection for a new room.
       * Originates from createRoomButton.onclick in popup.js */
      case WebpageMessageTypes.ROOM_CONNECTION:
        log('Room connection!');
        connectWebsocket(tabId, currentProgress, state, urlRoomId);
        break;
      /* Submits local video status/progress updates.
       * Originates from handleLocalAction in content_script.js */
      case (WebpageMessageTypes.LOCAL_UPDATE):
        tabInfo.socket && tabInfo.socket.emit('update', state, currentProgress);
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

function sendConnectionRequestToWebpage(tab) {
  const tabId = tab.id;
  const tabInfo = tabsInfo[tabId];

  if (tabInfo.socket != null) {
    if (getParameterByName(tab.url, 'rollTogetherRoom') === tabsInfo.roomId) {
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
  chrome.tabs.sendMessage(tab.id, { type: BackgroundMessageTypes.ROOM_CONNECTION });
}

/* Connect websocket to server. */
function connectWebsocket(tabId, videoProgress, videoState, urlRoomId) {
  log('Connecting websocket', { tabId, videoProgress, videoState, urlRoomId });
  const tabInfo = tabsInfo[tabId];

  let query = `videoProgress=${Math.round(videoProgress)}&videoState=${videoState}${(urlRoomId ? `&room=${urlRoomId}` : '')}`;

  getBackendUrl().then(function(url) {
    tabInfo.socket = io(url, { query });
    // tabInfo.socket = io('https://roll-together.herokuapp.com/', { query });

    /* Listen for roomId and initial State and Progress from server. */
    tabInfo.socket.on('join', (receivedRoomId, roomState, roomProgress) => {
      tabInfo.roomId = receivedRoomId;
      log('Sucessfully joined a room', { roomId: tabInfo.roomId, roomState, roomProgress });
      tryUpdatePopup();

      sendUpdateToWebpage(tabId, roomState, roomProgress);
    });

    /* Listen for running updates of State and Progress from server. */
    tabInfo.socket.on('update', (id, roomState, roomProgress) => {
      log('Received update Message from ', id, { roomState, roomProgress });
      sendUpdateToWebpage(tabId, roomState, roomProgress);
    });
  });
}

/* Sets "RT" icon color */
function setIconColor(tabId, color) {
  const canvas = document.createElement('canvas');
  canvas.height = canvas.width = 128;

  const ctx = canvas.getContext("2d");
  ctx.font = "bold 75px roboto";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 20, true, false);
  ctx.fillStyle = 'white';
  ctx.fillText("XW", canvas.width / 2, canvas.height / 2 + 32);

  const imageData = ctx.getImageData(0, 0, 128, 128);
  window.imageData = imageData;

  window.data = imageData;
  chrome.pageAction.setIcon({
    imageData,
    tabId
  });
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof stroke === 'undefined') {
    stroke = true;
  }
  if (typeof radius === 'undefined') {
    radius = 5;
  }
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
    for (var side in defaultRadius) {
      radius[side] = radius[side] || defaultRadius[side];
    }
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
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
