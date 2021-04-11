/* content_script.js manipulates the HTML5 video-player and captures actions related to it. */

function checkService() {
  if (window.location.href.includes("crunchyroll.com")) {
    return Site.CRUNCHYROLL;
  }
  else if (window.location.href.includes("funimation.com")) {
    return Site.FUNIMATION;
  }
  else if (window.location.href.includes("wakanim.tv")) {
    return Site.WAKANIM;
  }
}

const service = checkService();

function isNotIframe(elt) {
  if (elt && elt.tagName === "IFRAME") {
    return false;
  } else {
    return true;
  }
}
/* Some sites encapsulate the player in an iframe (Crunchyroll, Funimation).
 * This causes the script to run twice (in- and outside the iframe) when we
 * allow it to activate for the entire domain. This function is used to
 * prevent the script from doing anything outside the iframe. */
function shouldRun() {
  if (service === Site.CRUNCHYROLL) {
    const vidIframe = document.getElementById("vilos-player");
    return isNotIframe(vidIframe);
  } else  if (service === Site.FUNIMATION) {
    const vidIframe = document.getElementById("player");
    return isNotIframe(vidIframe);
  } else if (service === Site.WAKANIM) {
    /* Wakanim does not use an iframe for the player */
    return true;
  }
}

const ignoreNext = {};
let activeLocalEventListeners = new Map();
let ignoreTimed = false;
const myNick = "Red Violet";

let player = null;
let lastFrameProgress = null;

/* Create and associate elements for crosswatch sidebar */
const chatIcon = document.createElement("div");
chatIcon.setAttribute("id", "chatBoxIcon");
const chatImg = document.createElement("img");
chatImg.setAttribute("src", chrome.extension.getURL("imgs/chatIcon.png"));
chatImg.setAttribute("alt", "Chat Icon. Click to toggle chat box.");
chatIcon.appendChild(chatImg);

const chatFeed = document.createElement("div");
chatFeed.setAttribute("id", "chatFeed");
const chatInput = document.createElement("textarea");
chatInput.setAttribute("id", "chatInput");
chatInput.setAttribute("maxlength", 120);
const chatBox = document.createElement("div");
chatBox.setAttribute("id", "chatBox");
chatBox.classList.add("sidebarSection");
chatBox.appendChild(chatFeed);
chatBox.appendChild(chatInput);
const toggleSilenceMenu = document.createElement("div");
toggleSilenceMenu.setAttribute("id", "toggleSilenceMenu");
const toggleSilenceText = document.createElement("div");
const participantsNode = document.createTextNode("> Participants <");
const chatFeedNode = document.createTextNode("> Chat Feed <");
toggleSilenceText.appendChild(participantsNode);
toggleSilenceMenu.appendChild(toggleSilenceText);
const silenceMenu = document.createElement("div");
silenceMenu.classList.add("elementBGone");
silenceMenu.classList.add("sidebarSection");
silenceMenu.setAttribute("id", "silenceMenu");
const injectedSidebar = document.createElement("div");
injectedSidebar.setAttribute("id", "crossWatchSidebar");

injectedSidebar.appendChild(toggleSilenceMenu);
injectedSidebar.appendChild(chatBox);
injectedSidebar.appendChild(silenceMenu);

const syncMessage = document.createElement("div");
syncMessage.setAttribute("id", "syncMessage");
const syncText = document.createTextNode("Syncing to other watchers - please don't touch controls");

function toggleSidebar() {
  if (silenceMenu.classList.contains("elementBGone")) {
    chatBox.classList.add("elementBGone");
    silenceMenu.classList.remove("elementBGone");
    participantsNode.remove();
    toggleSilenceText.appendChild(chatFeedNode);
  } else {
    silenceMenu.classList.add("elementBGone");
    chatBox.classList.remove("elementBGone");
    chatFeedNode.remove();
    toggleSilenceText.appendChild(participantsNode);
  }
}

toggleSilenceMenu.onclick = toggleSidebar;

let iconTimeout = null;
function iconTimeoutFunc() {
  chatIcon.classList.add("elementBHidden");
}

function getState(stateName) {
  return player[stateName];
}

function getStates() {
  const [paused, currentProgress] = [
    getState("paused"),
    getState("currentTime"),
  ];

  lastFrameProgress = lastFrameProgress || currentProgress;

  const timeJump = Math.abs(currentProgress - lastFrameProgress) > LIMIT_DELTA_TIME;
  const state = paused ? States.PAUSED : States.PLAYING;

  lastFrameProgress = currentProgress;
  return { state, currentProgress, timeJump };
}

function getVideoSelectorString() {
  if (service === Site.CRUNCHYROLL) {
    return "#player0";
  } else  if (service === Site.FUNIMATION) {
    return "#brightcove-player_html5_api";
  } else if (service === Site.WAKANIM) {
    return "#jwplayer-container > .jw-wrapper > .jw-media > .jw-video";
  }
}

function getVideoTag() {
  if (service === Site.CRUNCHYROLL) {
    return document.getElementById("player0");
  } else  if (service === Site.FUNIMATION) {
    return document.getElementById("brightcove-player_html5_api");
  } else if (service === Site.WAKANIM) {
    return document.querySelector("#jwplayer-container > .jw-wrapper > .jw-media > .jw-video");
  }
}

/* Add event listener from pagescript.js for accessing page script objects,
 * such as the brightcove player api on Funimation */
var scriptElement = document.createElement('script');
scriptElement.src = chrome.extension.getURL('pagescript.js');
(document.head || document.documentElement).appendChild(scriptElement);
scriptElement.parentNode.removeChild(scriptElement);

function startSyncPeriod(seconds) {
  ignoreTimed = true;
  syncMessage.classList.remove("elementBGone");
  window.setTimeout(function () {
    ignoreTimed = false;
    syncMessage.classList.add("elementBGone");
  }, seconds * 1000);
}

/* Handles local actions and sends messages to let background.js propagate
 * actions to other users */
const handleLocalAction = action => () => {
  if (ignoreNext[action] === true) {
    ignoreNext[action] = false;
    return;
  }

  if (ignoreTimed === true) {
    return;
  }

  const { state, currentProgress, timeJump } = getStates();
  const type = WebpageMessageTypes.LOCAL_UPDATE;

  log('Local Action', action, { type, state, currentProgress });
  switch (action) {
    case Actions.PLAY:
    case Actions.PAUSE:
      chrome.runtime.sendMessage({ type, state, currentProgress });
      break;
    case Actions.TIMEUPDATE:
      timeJump && chrome.runtime.sendMessage({ type, state, currentProgress });
      break;
  }
}

/* Used by handleRemoteUpdate to trigger video player actions from other users. */
function triggerAction(action, progress) {
  ignoreNext[action] = true;

  switch (action) {
  case Actions.PAUSE:
    if (service === Site.FUNIMATION) {
      window.postMessage({
        crosswatch_action: action,
        currentTime: progress
      }, "*");
    } else {
      player.pause();
      player.currentTime = progress;
    }
    break;
  case Actions.PLAY:
    if (service === Site.FUNIMATION) {
      window.postMessage({
        crosswatch_action: action
      }, "*");
    } else {
      player.play();
    }
    break;
  case Actions.TIMEUPDATE:
    if (service === Site.FUNIMATION) {
      window.postMessage({
        crosswatch_action: action,
        currentTime: progress
      }, "*");
    } else {
      player.currentTime = progress;
    }
    break;
  default:
    ignoreNext[action] = false;
  }
}

function chatMoveListener(){
  chatIcon.classList.remove("elementBHidden");
  window.clearTimeout(iconTimeout);
  iconTimeout = window.setTimeout(iconTimeoutFunc, 3000);
}

function chatOutListener() {
  chatIcon.classList.add("elementBHidden");
}

function chatKeyListener(event) {
  event.stopPropagation();
  const chatInput = document.getElementById("chatInput");
  if (event.key === "Enter") {
    event.preventDefault();
    if (chatInput.value !== "") {
      chrome.runtime.sendMessage(
        { nick: myNick,
          message: chatInput.value,
          type: WebpageMessageTypes.LOCAL_CHAT }
      );
      chatInput.value = "";
    }
  }
}

function chatKeyPressBlocker() {
  event.stopPropagation();
}

/* Scroll chatFeed to bottom when changing to/from fullscreen. */
function fullscreenListener(event) {
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function getPlayerRoot() {
  if (service === Site.CRUNCHYROLL) {
    return document.getElementById("vilosRoot");
  } else if (service === Site.FUNIMATION) {
    return document.getElementById("brightcove-player");
  } else if (service === Site.WAKANIM) {
    return document.getElementById("jwplayer-container");
    // return document.querySelector("#jwplayer-container > .jw-wrapper");
  }
}

function getVideoClass() {
  if (service === Site.CRUNCHYROLL) {
    return "videoCR";
  } else if (service === Site.FUNIMATION) {
    return "videoFuni";
  } else if (service === Site.WAKANIM) {
    return "videoWaka";
  }
}

function setupChatBox() {
  let subCanvas;
  let canvasClass;

  const playerRoot = getPlayerRoot();
  const videoClass = getVideoClass();
  /* On CrunchyRoll, we need to resize the subtitle canvas separately */
  if (service === Site.CRUNCHYROLL) {
    subCanvas = document.getElementById("velocity-canvas");
    canvasClass = "canvasCR";
    const vilos = document.getElementById("vilos");
    vilos.classList.add("crunchyBetaWidth");
  }
  let showChatBox = false;

  chatIcon.onclick = function() {
    if (showChatBox) {
      player.classList.remove(videoClass);
      if (service === Site.CRUNCHYROLL) {
        subCanvas.classList.remove(canvasClass);
      } else if (service === Site.FUNIMATION) {
        /* On Funimation, we remove gradients and dock text to make the UI less obtrusive. */
        document.querySelector("#brightcove-player > .vjs-dock-text").classList.remove("elementBHidden");
        document.querySelector("#funimation-gradient").classList.remove('elementBHidden');
      }
      showChatBox = false;
      injectedSidebar.remove();
      // chatBox.remove();
    } else {
      player.classList.add(videoClass);
      playerRoot.appendChild(injectedSidebar);
      // playerRoot.appendChild(chatBox);
      if (service === Site.CRUNCHYROLL) {
        subCanvas.classList.add(canvasClass);
      }
      if (service === Site.FUNIMATION) {
        document.querySelector("#brightcove-player > .vjs-dock-text").classList.add("elementBHidden");
        document.querySelector("#funimation-gradient").classList.add('elementBHidden');
      }
      showChatBox = true;
    }
  }

  iconTimeout = window.setTimeout(iconTimeoutFunc, 3000);
  playerRoot.appendChild(chatIcon);
  playerRoot.addEventListener("mousemove", chatMoveListener);
  playerRoot.addEventListener("mouseout", chatOutListener);
  chatInput.addEventListener("keydown", chatKeyListener);
  chatInput.addEventListener("keyup", chatKeyPressBlocker);
  playerRoot.addEventListener("fullscreenchange", fullscreenListener);
}

function tearDownChatBox() {
  const playerRoot = getPlayerRoot();
  const videoClass = getVideoClass();
  let subCanvas;
  const chatIcon = document.getElementById("chatBoxIcon");
  if (service === Site.CRUNCHYROLL) {
    subCanvas = document.getElementById("velocity-canvas");
    subCanvas.classList.remove("canvasCR");
    playerRoot.classList.remove("crunchyBetaWidth");
    const vilos = document.getElementById("vilos");
    vilos.classList.remove("crunchyBetaWidth");
  }
  chatIcon.remove();
  injectedSidebar.remove();
  playerRoot.removeEventListener("mousemove", chatMoveListener);
  playerRoot.removeEventListener("mouseout", chatOutListener);
  chatInput.removeEventListener("keydown", chatKeyListener);
  chatInput.removeEventListener("keyup", chatKeyPressBlocker);
  playerRoot.removeEventListener("fullscreenchange", fullscreenListener);
  player.classList.remove(videoClass);
}

function sendRoomConnectionMessage(roomId) {
  const { state, currentProgress } = getStates();
  const type = WebpageMessageTypes.ROOM_CONNECTION;
  chrome.runtime.sendMessage(
    { state, currentProgress, type, roomId }
  );
}

/* Used by handleBackgroundMessage to handle REMOTE_UPDATE */
function handleRemoteUpdate({ roomState, roomProgress }) {
  log('Handling Remote Update', { roomState, roomProgress });
  const { state, currentProgress } = getStates();
  if (state !== roomState) {
    if (roomState === States.PAUSED) triggerAction(Actions.PAUSE, roomProgress);
    if (roomState === States.PLAYING) triggerAction(Actions.PLAY, roomProgress);
  }

  if (Math.abs(roomProgress - currentProgress) > LIMIT_DELTA_TIME) {
    triggerAction(Actions.TIMEUPDATE, roomProgress);
  }
}

/* Used by handleBackgroundMessage to handle REMOTE_CHAT */
function handleRemoteChatMessage({ nick, message }) {
  let atBottom = chatFeed.scrollTop === (chatFeed.scrollHeight - chatFeed.offsetHeight);
  const msgElement = document.createElement("div");
  const nickElement = document.createElement("div");
  nickElement.classList.add("chat-nick", "chat-text");
  const textElement = document.createElement("div");
  textElement.classList.add("chat-message", "chat-text");
  const nickText = document.createTextNode(nick);
  const msgText = document.createTextNode(message);
  nickElement.appendChild(nickText);
  textElement.appendChild(msgText);
  msgElement.appendChild(nickElement);
  msgElement.appendChild(textElement);
  chatFeed.appendChild(msgElement);
  if (atBottom || (myNick === nick)) {
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
}

function setupContent(syncPeriod) {
  setupChatBox();
  /* Start 10 second sync period (during which no events are sent to other
   * participants), and setup message and event handlers */
  startSyncPeriod(syncPeriod);
  for (action in Actions) {
    console.log("Setup handler for action", action);
    const actionListener = handleLocalAction(Actions[action]);
    activeLocalEventListeners.set(Actions[action], actionListener);
    player.addEventListener(Actions[action], actionListener);
  }
}

function tearDownContent() {
  tearDownChatBox();
  activeLocalEventListeners.forEach(function(actionListener, action) {
    console.log("Remove handler for action", action);
    player.removeEventListener(action, actionListener);
  });
  activeLocalEventListeners = new Map();
}

function handleBackgroundMessage(args) {
  log("Received message from Background", args);

  const type = args.type;
  const roomId = args.roomId;
  switch (type) {
    case BackgroundMessageTypes.ROOM_CONNECTION:
      /* If we connect while on the video page, we set up
       * chatbox and content connections here. */
      setupContent(5);
      break;
    case BackgroundMessageTypes.REMOTE_UPDATE:
      handleRemoteUpdate(args);
      break;
    case BackgroundMessageTypes.REMOTE_CHAT:
      handleRemoteChatMessage(args);
      break;
    case BackgroundMessageTypes.ROOM_DISCONNECT:
      tearDownContent();
      break;
    default:
      throw "Invalid BackgroundMessageType: " + type;
  }
}

/* Main function of content script. Finds the (hopefully) correct <video>
 * element on the page, and connects to the background script.
 * A local action listener (handleLocalAction) is set up to listen for
 * actions performed on the video by the local user, and will use the
 * chrome.runtime.onMessage listener in background.js to propagate
 * LOCAL_UPDATE actions to other users.
 * The runtime.onMessage listener handleBackgroundMessage is used to handle
 * messages from backround.js */
function runContentScript() {
  player = getVideoTag();

  /* Send message to runtime.onMessage listener in background.js to connect it to tab. */
  chrome.runtime.sendMessage({ type: WebpageMessageTypes.CONNECTION });

  /* If we find a player, we check for connection, and if connected, we setup event
   * and message handlers for sync communication. */
  if (player) {
    chrome.runtime.sendMessage({ type: WebpageMessageTypes.ROOM_ID }, {}, function(response) {
      chrome.runtime.onMessage.addListener(handleBackgroundMessage);
      const connected = response.roomId != null;
      if (connected) {
        setupContent(10);
      }
    });
  }
  /* If we find no player, repeat every half second until we do, or until shouldRun()
   * says not to run. */
  else if (shouldRun()) {
    setTimeout(runContentScript, 500);
  }
}

runContentScript();
