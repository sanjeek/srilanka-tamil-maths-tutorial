const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const sampleNumber = '077 123 4567';
const lifetime = 5 * 60_000;
const cooldown = 60_000;
const limit = 5;
let challenge;
let timer;

function showNumber() {
  clearInterval(timer);
  challenge = undefined;
  notice.textContent = '';
  panel.innerHTML = `<label for="phone">Sample guardian mobile</label>
    <input id="phone" type="tel" value="${sampleNumber}" readonly>
    <div class="actions"><button class="primary" data-action="send">Send Test Code</button></div>`;
}

function issueCode() {
  if (challenge && Date.now() < challenge.resendAt) return;
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const previous = challenge?.code;
  const generated = String(digits).padStart(6, '0');
  const code = generated === previous ? String((digits + 1) % 1_000_000).padStart(6, '0') : generated;
  challenge = { code, tries: 0, expires: Date.now() + lifetime, resendAt: Date.now() + cooldown };
  clearInterval(timer);
  notice.textContent = '';
  panel.innerHTML = `<h2>Verify the sample number</h2>
    <div class="inbox"><strong>Simulated SMS to ${sampleNumber}</strong><br>
    Your verification code is <strong class="code">${code}</strong>.</div>
    <form><label for="code">Six-digit code</label>
      <input id="code" name="code" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required>
      <div class="actions">
        <button class="primary" type="submit">Verify and Sign In</button>
        <button type="button" data-action="fill">Use Test Code</button>
        <button type="button" data-action="resend" disabled>Resend Test Code</button>
        <button type="button" data-action="reset">Start Over</button>
      </div>
      <p id="resend-time"></p>
    </form>`;
  updateTimer();
  timer = setInterval(updateTimer, 1000);
  panel.querySelector('#code').focus();
}

function updateTimer() {
  const remaining = Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000));
  panel.querySelector('[data-action=resend]').disabled = remaining > 0;
  panel.querySelector('#resend-time').textContent = remaining ? 'Resend available in ' + remaining + ' seconds.' : 'You can request a new test code.';
}

panel.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'send' || action === 'resend') issueCode();
  if (action === 'reset') showNumber();
  if (action === 'fill' && challenge) {
    const field = panel.querySelector('#code');
    field.value = challenge.code;
    field.focus();
  }
});

panel.addEventListener('submit', event => {
  event.preventDefault();
  if (!challenge || Date.now() >= challenge.expires) {
    notice.textContent = 'The test code expired. Request a new one.';
    return;
  }
  if (challenge.tries >= limit) {
    notice.textContent = 'Too many attempts. Request a new test code.';
    return;
  }
  const value = new FormData(event.target).get('code');
  if (value !== challenge.code) {
    const remaining = limit - ++challenge.tries;
    notice.textContent = remaining ? 'Incorrect code. Attempts left: ' + remaining + '.' : 'Too many attempts. Request a new test code.';
    return;
  }
  clearInterval(timer);
  challenge = undefined;
  notice.textContent = '';
  panel.innerHTML = `<h2 tabindex="-1">Demo sign-in successful</h2>
    <p>Guardian mobile verified for this simulation. The sample Grade 5 student is ready to select.</p>
    <div class="inbox"><strong>Sample Student</strong><br>Grade 5</div>
    <div class="actions"><button class="primary" data-action="reset">Try Again</button></div>`;
  panel.querySelector('h2').focus();
});
showNumber();
