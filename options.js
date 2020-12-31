const colorSelector = document.getElementById("colorSelector");
let addButton = document.getElementById("addButton");
let removeButton = document.getElementById("removeButton");
const backendInput = document.getElementById("backendUrl");
const updateButton = document.getElementById("updateButton");
const defaultRoomInput = document.getElementById("defaultRoomInput");
const updateRoomButton = document.getElementById("updateRoomButton");
const input = document.getElementById("colorInput");
const confirmationMessage = document.getElementById("confirmationMessage");
const maxMenuSize = 10;
let extensionColor = null;

getExtensionColor().then(color => updateExtensionColor(color));
getColorMenu().then(colorOptions => buildButtons(colorOptions));
getBackendUrl().then(url => backendInput.value = url);
getDefaultRoomId().then(roomId => defaultRoomInput.value = roomId);

function updateExtensionColor(color) {
  extensionColor = color;
  input.value = color;
  addButton.style.backgroundColor = color;
  removeButton.style.backgroundColor = color;
}

function updateColorMenu(colorOptions) {
  while(colorSelector.lastChild) colorSelector.removeChild(colorSelector.lastChild);
  buildButtons(colorOptions);
}

function colorCodeValidation(color) {
  confirmationMessage.innerText = "";
  const isOk = /^#([0-9A-F]{3}){1,2}$/i.test(color);

  if (!isOk) {
    confirmationMessage.innerText = "Invalid hex code!";
    log("Invalid input");
    return false;
  }

  return true;
}

backendInput.oninput = function () {
  backendInput.style.backgroundColor = "#FFFE95";
}

updateButton.onclick = function () {
  setBackendUrl(backendInput.value);
  backendInput.style.backgroundColor = "#FFFFFF";
}

defaultRoomInput.oninput = function () {
  defaultRoomInput.style.backgroundColor = "#FFFE95";
}

updateRoomButton.onclick = function () {
  setDefaultRoomId(defaultRoomInput.value);
  defaultRoomInput.style.backgroundColor = "#FFFFFF";
}

addButton.onclick = function() {
  const color = input.value.toUpperCase();

  getColorMenu().then(colorOptions => {
    if(colorOptions.length === maxMenuSize) {
      confirmationMessage.innerText = "You have reached the maximum menu size!";
      log("Max menu size reached");
      return;
    }

    if(!colorCodeValidation(color)) return;

    const isInMenu = colorOptions.includes(color);

    if(isInMenu) {
      confirmationMessage.innerText = "This color is already in the menu";
      log("Repeated color");
      return;
    }

    setExtensionColor(color);
    updateExtensionColor(color);

    colorOptions.push(color);

    setColorMenu(colorOptions);
    updateColorMenu(colorOptions);
  });
}

removeButton.onclick = function() {
  const color = input.value.toUpperCase();

  if(!colorCodeValidation(color)) return;

  if(color === wRed) {
    confirmationMessage.innerText = "You can't remove this color!";
    log("Tried to remove theme color");
    return;
  }

  getColorMenu().then( colorOptions => {
    const isInMenu = colorOptions.includes(color);

    if(!isInMenu) {
      confirmationMessage.innerText = "This color isn't in the menu";
      log("Color not in menu");
      return;
    }

    colorOptions = colorOptions.filter(function(element) { return element != color; });

    getExtensionColor().then( currentColor => {
      const isInMenu = colorOptions.includes(currentColor);
      if(!isInMenu) {
        setExtensionColor(wRed);
        updateExtensionColor(wRed);
      }
    });

    setColorMenu(colorOptions);
    updateColorMenu(colorOptions);
  });
}

function setBackendUrl(url) {
  chrome.storage.sync.set({ backendUrl: url }, function () {
    log("Backend url updated");
  });
}

function setDefaultRoomId(roomId) {
  chrome.storage.sync.set({ defaultRoomId: roomId }, function () {
    log("Default Room ID updated");
  });
}

function setColorMenu(colorMenu) {
  chrome.storage.sync.set({ colorOptions: colorMenu }, function () {
    log("Color menu updated");
  });
}

function setExtensionColor(color) {
  chrome.storage.sync.set({ extensionColor: color }, function () {
    log("Setting extension color to " + color);
  });
}

function buildButtons(colorOptions) {
  for (let color of colorOptions) {
    let newButton = document.createElement("button");
    newButton.addEventListener("click", function () {
      setExtensionColor(color);
      updateExtensionColor(color);
    });
    newButton.style.backgroundColor = color;
    newButton.className = "colorChangeButton"
    colorSelector.appendChild(newButton);
  }
}
