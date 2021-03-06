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

let player = null;
let lastFrameProgress = null;

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
  const offsetProgress = currentProgress - testOffset;
  const type = WebpageMessageTypes.LOCAL_UPDATE;

  log('Local Action', action, { type, state, currentProgress });
  log('Adjusting for offset', offsetProgress);
  /* Only send state and progress if offset brings it above 0 */
  if (offsetProgress >= 0) {
    switch (action) {
    case Actions.PLAY:
    case Actions.PAUSE:
      chrome.runtime.sendMessage({ type, state, currentProgress: offsetProgress });
      break;
    case Actions.TIMEUPDATE:
      timeJump && chrome.runtime.sendMessage({ type, state, currentProgress: offsetProgress });
      break;
    }
  }
  /* Otherwise, set playback to offset */
  else {
    /* Use triggerAction to */
    /*triggerAction(action, testOffset);
    chrome.runtime.sendMessage({ type, state, testOffset });*/
  }
}

function play() {
  if (service === Site.FUNIMATION) {
    window.postMessage({
      crosswatch_action: Actions.PLAY
    }, "*");
  } else {
    player.play();
  }
}

function pause(progress) {
  if (service === Site.FUNIMATION) {
    window.postMessage({
      crosswatch_action: Actions.PAUSE
    }, "*");
  } else {
    player.pause();
    player.currentTime = progress;
  }
}

function timeupdate(progress) {
  if (service === Site.FUNIMATION) {
    window.postMessage({
      crosswatch_action: Actions.TIMEUPDATE,
      currentTime: progress
    }, "*");
  } else {
    player.currentTime = progress;
  }
}

/* Used by handleRemoteUpdate to trigger video player actions from other users. */
function triggerAction(action, progress) {
  ignoreNext[action] = true;

  switch (action) {
  case Actions.PAUSE:
    pause(progress);
    break;
  case Actions.PLAY:
    play();
    break;
  case Actions.TIMEUPDATE:
    timeupdate(progress);
    break;
  default:
    ignoreNext[action] = false;
  }
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
  const offsetProgress = roomProgress + testOffset;
  log('Handling Remote Update', { roomState, roomProgress });
  log('Adjusting roomProgress with offset', offsetProgress);
  const { state, currentProgress } = getStates();
  if (state !== roomState) {
    if (roomState === States.PAUSED) triggerAction(Actions.PAUSE, offsetProgress);
    if (roomState === States.PLAYING) triggerAction(Actions.PLAY, offsetProgress);
  }

  if (Math.abs(offsetProgress - currentProgress) > LIMIT_DELTA_TIME) {
    triggerAction(Actions.TIMEUPDATE, offsetProgress);
  }
}

function handleBackgroundMessage(args) {
  log("Received message from Background", args);

  const type = args.type;
  const roomId = args.roomId;
  switch (type) {
    case BackgroundMessageTypes.ROOM_CONNECTION:
      /* Handle connection to create a new room. */
      sendRoomConnectionMessage(roomId);
      break;
    case BackgroundMessageTypes.REMOTE_UPDATE:
      handleRemoteUpdate(args);
      break;
    default:
      throw "Invalid BackgroundMessageType: " + type;
  }
}

/* Main function of content script. Checks for the appropriate <video>
 * element on the page. "player0" is the id given to the <video> tag within
 * the iframe of CrunchyRoll's vilos-player.
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
