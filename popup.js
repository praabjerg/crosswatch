const background = chrome.extension.getBackgroundPage();
let connected = false;

const createRoomButton = document.getElementById('createRoom');
const copyIdButton = document.getElementById('copyId');
const disconnectButton = document.getElementById('disconnect');
const idInput = document.getElementById('idInput');
const nickInput = document.getElementById('nickInput');
let optionButtons = document.getElementsByClassName('actionButton');

function update() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    const roomId = background.window.getRoomId(tab.id);
    const connected = roomId != null;

    log('Updating Popup...', { roomId, connected });

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
      [...document.getElementsByClassName('firstPage')].forEach(el => el.classList.remove('noDisplay'));
      [...document.getElementsByClassName('secondPage')].forEach(el => el.classList.add('noDisplay'));
    }
  });
}

window.addEventListener('beforeunload', () => {
  background.window.updatePopup = null;
});

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

idInput.onclick = function () {
}

background.window.updatePopup = update;

update();
