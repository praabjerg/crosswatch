/* content_script.js manipulates the HTML5 video-player and captures actions related to it. */

const ignoreNext = {};

let player = null;
let lastFrameProgress = null;

/* Skip-button functionality. To be removed in favor of making the
 * the code more generic across streaming services. */
let beginIntro = null;
let endIntro = null;
let skipButton = null;
let currentSkipButtonState = null;

const skipButtonStates = {
  CONSTANT: 'constant',
  HOVER: 'hover',
  HIDDEN: 'hidden'
};

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

/* Skip-button functionality. To be removed in favor of making the
 * the code more generic across streaming services. */
function getSkipButtonState(currentProgress) {
  if (beginIntro === null) return skipButtonStates.HIDDEN;

  const endConstantStateTime = Math.min(endIntro, beginIntro + 5);

  if (currentProgress >= beginIntro && currentProgress <= endConstantStateTime) {
    return skipButtonStates.CONSTANT;
  }

  if (currentProgress > endConstantStateTime && currentProgress <= endIntro) {
    return skipButtonStates.HOVER;
  }

  return skipButtonStates.HIDDEN;
}

/* Skip-button functionality. To be removed in favor of making the
 * the code more generic across streaming services. */
function setSkipButtonState(currentProgress) {
  let state = getSkipButtonState(currentProgress);

  if (state === currentSkipButtonState) return;

  currentSkipButtonState = state;

  if (state === skipButtonStates.CONSTANT) {
    skipButton.style.opacity = 1;
  } else {
    skipButton.style.opacity = 0;
  }

  if (state === skipButtonStates.HIDDEN) {
    skipButton.style.display = 'none';
  } else {
    skipButton.style.display = 'block';
  }
}

/* Skip-button functionality. To be removed in favor of making the
 * the code more generic across streaming services. */
function createSkipButton() {
  const videoContainer = document.getElementById("vilosRoot");

  if (videoContainer) {
    log("Creating skip button...");

    if (document.getElementById("skipButton") == null) {
      skipButton = document.createElement("button");

      skipButton.id = "skipButton";
      skipButton.innerText = "Skip Intro";

      skipButton.onmouseout = () => {
        if (currentSkipButtonState === skipButtonStates.CONSTANT) {
          skipButton.style.opacity = 1;
        } else {
          skipButton.style.opacity = 0;
        }
      };

      skipButton.onmouseover = () => skipButton.style.opacity = 1;

      skipButton.onclick = () => triggerAction(Actions.TIMEUPDATE, endIntro);

      videoContainer.appendChild(skipButton);
      setSkipButtonState();
    }
  }
}

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
      setSkipButtonState(currentProgress);
      timeJump && chrome.runtime.sendMessage({ type, state, currentProgress });
      break;
  }
}

/* Used by handleRemoteUpdate to trigger video player actions from other users. */
function triggerAction(action, progress) {
  ignoreNext[action] = true;

  switch (action) {
    case Actions.PAUSE:
      player.pause();
      player.currentTime = progress;
      break;
    case Actions.PLAY:
      player.play();
      break;
    case Actions.TIMEUPDATE:
      player.currentTime = progress;
      break;
    default:
      ignoreNext[action] = false;
  }
}

function sendRoomConnectionMessage() {
  const { state, currentProgress } = getStates();
  const type = WebpageMessageTypes.ROOM_CONNECTION;
  chrome.runtime.sendMessage(
    { state, currentProgress, type }
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

function handleBackgroundMessage(args) {
  log("Received message from Background", args);

  const { type } = args;
  switch (type) {
    case BackgroundMessageTypes.ROOM_CONNECTION:
      /* Handle connection to create a new room. */
      sendRoomConnectionMessage();
      break;
    case BackgroundMessageTypes.REMOTE_UPDATE:
      handleRemoteUpdate(args);
      break;
    case BackgroundMessageTypes.SKIP_MARKS:
      /* Skip-button functionality. To be removed in favor of making the
       * the code more generic across streaming services. */
      const { marks: { begin, end } } = args;
      beginIntro = begin;
      endIntro = end;
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
  player = document.getElementById("player0");

  if (!player) {
    setTimeout(runContentScript, 500);
    return;
  }

  for (action in Actions) {
    player.addEventListener(Actions[action], handleLocalAction(Actions[action]));
  }

  createSkipButton();

  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  /* Send message to runtime.onMessage listener in backend.js to connect to room. */
  chrome.runtime.sendMessage({ type: WebpageMessageTypes.CONNECTION });
}

runContentScript();
