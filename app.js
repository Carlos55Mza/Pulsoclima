const toast = document.querySelector('.toast');
let toastTimer;

function showMessage(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

document.querySelectorAll('[data-message]').forEach((button) => {
  button.addEventListener('click', () => showMessage(button.dataset.message));
});

const joinButton = document.querySelector('#join-button');
joinButton.addEventListener('click', () => {
  const joined = joinButton.classList.toggle('joined');
  joinButton.textContent = joined ? '✓ Ya sos parte' : 'Quiero ser parte';
});
