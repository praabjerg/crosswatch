const background = chrome.extension.getBackgroundPage();
let connected = false;

const createRoomButton = document.getElementById('createRoom');
const copyIdButton = document.getElementById('copyId');
const disconnectButton = document.getElementById('disconnect');
const idInput = document.getElementById('idInput');
const nickInput = document.getElementById('nickInput');
const releaseNotesLink = document.getElementById('releaseNotesLink');
const releaseNotes = document.getElementById('releaseNotes');
const popupMain = document.getElementById('popupMain');
const releaseOkButton = document.getElementById('releaseOkButton');
const connectionAlert = document.getElementById('connectionErrorAlert');
const nickAlert = document.getElementById('nickInUseAlert');
const optionsLink = document.getElementById('xwOptionsLink');
const backendGithubLink = document.getElementById('xwBackendLink');
let optionButtons = document.getElementsByClassName('actionButton');

function update() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    const roomId = background.window.getRoomId(tab.id);
    const connected = roomId != null;

    log('Updating Popup...', { roomId, connected });

    //popupAlertText.nodeValue = background.window.getFailConnectMsg();
    if (background.window.getFailType() === 'connection') {
      connectionAlert.classList.remove('noDisplay');
      nickAlert.classList.add('noDisplay');
    } else if (background.window.getFailType() === 'nick') {
      connectionAlert.classList.add('noDisplay');
      nickAlert.classList.remove('noDisplay');
    } else {
      connectionAlert.classList.add('noDisplay');
      nickAlert.classList.add('noDisplay');
    }

    if (connected) {
      idInput.value = roomId;
      idInput.focus();
      idInput.select();

      [...document.getElementsByClassName('firstPage')].forEach(el => el.classList.add('noDisplay'));
      [...document.getElementsByClassName('secondPage')].forEach(el => el.classList.remove('noDisplay'));
    } else {
      getDefaultRoomId().then(roomId => {
        log('Setting roomId field');
        idInput.value = roomId;
      });
      getDefaultNick().then(nick => {
        log('Setting nick field');
        nickInput.value = nick;
      });
      getHasShownReleaseNotes().then(hasShown => {
        if (hasShown) {
          releaseNotes.classList.add('noDisplay');
          popupMain.classList.remove('noDisplay');
        } else {
          popupMain.classList.add('noDisplay');
          releaseNotes.classList.remove('noDisplay');
        }
      });
      [...document.getElementsByClassName('firstPage')].forEach(el => el.classList.remove('noDisplay'));
      [...document.getElementsByClassName('secondPage')].forEach(el => el.classList.add('noDisplay'));
    }
  });
}

window.addEventListener('beforeunload', () => {
  background.window.updatePopup = null;
});

/* Options and github links */
optionsLink.onclick = function () {
  chrome.runtime.openOptionsPage();
}
backendGithubLink.onclick = function () {
  chrome.tabs.create({active: true, url: 'https://github.com/praabjerg/crosswatch_backend'});
}

/* Room creation is initiated here. createRoom is assigned the sendConnectionRequestToWebpage
 * function from background.js */
createRoomButton.onclick = async function () {
  log('Clicking CreateRoomButton');
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    background.window.createRoom(tabs[0], idInput.value);
  });
};

copyIdButton.onclick = function () {
  log('Clicking CopyIdButton');
  idInput.focus();
  idInput.select();
  document.execCommand('copy');
}

disconnectButton.onclick = function () {
  log('Clicking DisconnectButton');
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    background.window.disconnectRoom(tabs[0].id);
  })
}

releaseNotesLink.onclick = function () {
  setHasShownReleaseNotes(false);
  update();
}

releaseOkButton.onclick = function () {
  setHasShownReleaseNotes(true);
  update();
}

background.window.updatePopup = update;

update();
