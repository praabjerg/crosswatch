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

const ignoreNext = {
  [Actions.PLAY]: 0,
  [Actions.PAUSE]: 0,
  [Actions.READY]: 0,
  [Actions.ENDED]: 0,
  [Actions.TIMEUPDATE]: 0
};

function ignoreAction(action) {
  if (ignoreNext[action] > 0) {
    return true;
  } else {
    return false;
  }
}

function setIgnore(action, num = 1) {
  ignoreNext[action] += num;
}

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

/* Handles local actions and sends messages to let background.js propagate
 * actions to other users */
const handleLocalAction = action => () => {
  //console.log("Incoming action", action);
  if (ignoreAction(action) === true) {
    ignoreNext[action]--;
    //console.log("Action ignored!");
    return;
  }
  //console.log("Going on!");

  const { state, currentProgress, timeJump } = getStates();
  if (state === "paused" && action !== Actions.PAUSE) {
    //console.log("Pause state ignored!");
    return;
  }
  const type = WebpageMessageTypes.LOCAL_UPDATE;

  log('Local Action', action, { type, state, currentProgress });
  switch (action) {
    case Actions.PLAY:
    case Actions.PAUSE:
      chrome.runtime.sendMessage({ type, state, currentProgress });
      break;
    case Actions.TIMEUPDATE:
      //console.log("Timeupdate timeJump", timeJump);
      timeJump && chrome.runtime.sendMessage({ type, state, currentProgress });
      break;
  }
}

/* Used by handleRemoteUpdate to trigger video player actions from other users. */
function triggerAction(action, progress) {
  setIgnore(action);
  //ignoreNext[action] = true;

  switch (action) {
    case Actions.PAUSE:
      player.pause();
      player.currentTime = progress;
      break;
    case Actions.PLAY:
      player.play();
      break;
    case Actions.TIMEUPDATE:
      console.log("Set new timeupdate", progress, typeof progress);
      player.currentTime = progress;
      break;
    default:
      ignoreNext[action]--;
      //ignoreNext[action] = false;
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

function setupFuniDubChangeFix(player) {
  //const vjsControlBar = document.querySelector("#brightcove-player > .vjs-control-bar");
  const brightCove = document.querySelector("#brightcove-player");
  const optionsWrapper = document.querySelector("#brightcove-player > .options-wrapper");
  let clickMoment = null;
  let clickProgress = null;
  const videoObserverOptions = {
    attributeFilter: [ "src" ]
  }
  const videoObserver = new MutationObserver(function (mutationsList) {
    if (clickMoment !== null) {
      setTimeout(function() {
        setIgnore(Actions.TIMEUPDATE);
        setIgnore(Actions.PLAY);
        let now = new Date();
        let elapsed = Math.abs((now.getTime() - clickMoment.getTime())/1000) + 1;
        console.log("switchMoment", now);
        console.log("Elapsed", elapsed);
        console.log("New currentTime", clickProgress + elapsed);
        triggerAction(Actions.TIMEUPDATE, clickProgress + elapsed);
      }, 2000);
    }
  });
  const controlObserverOptions = {
    childList: true
  }
  const getInactiveAudioButtonsFuni = function () {
    return document.querySelectorAll("#funimation-audio-sub-menu > .funimation-li-option:not(.active-option)");
  }
  let inactiveAudioButtons = null;
  const setAudioClickEvent = function() {
    inactiveAudioButtons.forEach(button => {
      button.addEventListener("click", audioButtonListener);
    });
  }
  const audioButtonListener = function() {
    //console.log("Clicky");
    clickMoment = new Date();
    clickProgress = getState("currentTime");
    console.log("clickMoment", clickMoment.getTime());
    console.log("clickProgress", clickProgress);
    setIgnore(Actions.PAUSE);
    inactiveAudioButtons.forEach(button => {
      button.removeEventListener("click", audioButtonListener);
    });
    inactiveAudioButtons = getInactiveAudioButtonsFuni();
    setAudioClickEvent();
  }
  const controlObserver = new MutationObserver(function (mutationsList) {
    //console.log("Brightcove mutated!", mutationsList);
    mutationsList.forEach(mutation => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && node.id === "options-wrapper") {
            inactiveAudioButtons = getInactiveAudioButtonsFuni();
            setAudioClickEvent();
          }
        });
      }
    });
  })
  videoObserver.observe(player, videoObserverOptions);
  controlObserver.observe(brightCove, controlObserverOptions);
  //console.log("Control bar!", vjsControlBar);
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
  if (player === undefined) {
    return;
  }

  if (service === Site.FUNIMATION) {
    setupFuniDubChangeFix(player);
  }

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
