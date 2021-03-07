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

const ignoreNext = {};
const nick = "Red Violet";

let player = null;
let lastFrameProgress = null;

const chatIcon = document.createElement("div");
chatIcon.setAttribute("id", "chatBoxIcon");
const chatImg = document.createElement("img");
chatImg.setAttribute("src", chrome.extension.getURL("imgs/chatIcon.png"));
chatImg.setAttribute("alt", "Chat Icon. Click to toggle chat box.");
chatIcon.appendChild(chatImg);

const chatBoxHTML = '<div id="chatBox">' +
      '<div id="chatFeed"></div>' +
      '<textarea id="chatInput" maxlength=120></textarea>' +
      '</div>';
const wrapper = document.createElement('div');
wrapper.innerHTML = chatBoxHTML;
const chatBox = wrapper.firstChild;
//const chatBox = new DOMParser().parseFromString(chatBoxHTML, "text/xml");
//const chatBox = document.createElement("div");
//chatBox.setAttribute("id", "chatBox");

let iconTimeout = null;
function iconTimeoutFunc() {
  chatIcon.classList.add("elementBGone");
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

/* Add event listener from pagescript.js for accessing page script objects,
 * such as the brightcove player api on Funimation */
var scriptElement = document.createElement('script');
scriptElement.src = chrome.extension.getURL('pagescript.js');
(document.head || document.documentElement).appendChild(scriptElement);
scriptElement.parentNode.removeChild(scriptElement);

/* Handles local actions and sends messages to let background.js propagate
 * actions to other users */
const handleLocalAction = action => () => {
  if (ignoreNext[action] === true) {
    ignoreNext[action] = false;
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

function moveListener() {
  chatIcon.classList.remove("elementBGone");
  window.clearTimeout(iconTimeout);
  iconTimeout = window.setTimeout(iconTimeoutFunc, 3000);
}

function outListener() {
  chatIcon.classList.add("elementBGone");
}

function keyListener(event) {
  event.stopPropagation();
  const chatInput = document.getElementById("chatInput");
  if (event.key === "Enter") {
    event.preventDefault();
    chrome.runtime.sendMessage(
      { nick: nick,
        message: chatInput.value,
        type: WebpageMessageTypes.LOCAL_CHAT }
    );
    chatInput.value = "";
  }
}

function setUpChatBox() {
  const playerRoot = document.getElementById("vilosRoot");
  const playerContainer = document.getElementById("velocity-player-package");
  const player = document.getElementById("player0");
  const subCanvas = document.getElementById("velocity-canvas");
  const controlsPackage = document.getElementById("velocity-controls-package");
  let showChatBox = false;

  chatIcon.onclick = function() {
    if (showChatBox) {
      player.classList.remove("videoCR");
      subCanvas.classList.remove("canvasCR");
      showChatBox = false;
      chatBox.remove();
    } else {
      player.classList.add("videoCR");
      subCanvas.classList.add("canvasCR");
      playerRoot.appendChild(chatBox);
      showChatBox = true;
    }
  }

  iconTimeout = window.setTimeout(iconTimeoutFunc, 3000);
  playerRoot.appendChild(chatIcon);
  playerRoot.addEventListener("mousemove", moveListener);
  playerRoot.addEventListener("mouseout", outListener);
  playerRoot.addEventListener("keydown", keyListener);
}

function tearDownChatBox() {
  const playerRoot = document.getElementById("vilosRoot");
  const chatIcon = document.getElementById("chatBoxIcon");
  chatIcon.remove();
  chatBox.remove();
  playerRoot.removeEventListener("mousemove", moveListener);
  playerRoot.removeEventListener("mouseout", outListener);
  playerRoot.removeEventListener("keydown", keyListener);
  player.classList.remove("videoCR");
  subCanvas.classList.remove("canvasCR");
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
  console.log(message);
}

function handleBackgroundMessage(args) {
  log("Received message from Background", args);

  const type = args.type;
  const roomId = args.roomId;
  switch (type) {
    case BackgroundMessageTypes.ROOM_CONNECTION:
      setUpChatBox();
      /* Handle connection to create a new room. */
      sendRoomConnectionMessage(roomId);
      break;
    case BackgroundMessageTypes.REMOTE_UPDATE:
      handleRemoteUpdate(args);
      break;
    case BackgroundMessageTypes.REMOTE_CHAT:
      handleRemoteChatMessage(args);
      break;
    case BackgroundMessageTypes.ROOM_DISCONNECT:
      tearDownChatBox();
      break;
    default:
      throw "Invalid BackgroundMessageType: " + type;
  }
}

/* Main function of content script. Finds the (hopefully) correct <video>
 * element on the page.
 * An local action listener (handleLocalAction) is set up to listen for
 * actions performed on the video by the local user, and will use the
 * chrome.runtime.onMessage listener in background.js to propagate
 * LOCAL_UPDATE actions to other users.
 * The runtime.onMessage listener handleBackgroundMessage is used to handle
 * messages from backround.js */
function runContentScript() {
  const videotags = document.getElementsByTagName("video");
  player = videotags[0]

  if (!player) {
    setTimeout(runContentScript, 500);
    return;
  }

  for (action in Actions) {
    player.addEventListener(Actions[action], handleLocalAction(Actions[action]));
  }

  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  /* Send message to runtime.onMessage listener in backend.js to connect to room. */
  chrome.runtime.sendMessage({ type: WebpageMessageTypes.CONNECTION });
}

runContentScript();
