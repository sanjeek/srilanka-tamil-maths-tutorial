const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const signup = location.pathname.replace(/\/$/, '') === '/signup';
const nameKey = 'cmc-demo-student';
let studentName;
if (signup) {
  document.title = 'Sign Up and Subscription | Chithambara Maths Challenge';
  document.querySelector('#signup-and-plans').hidden = false;
  document.querySelector('#heading').textContent = 'Create a student account';
  document.querySelector('#heading + p').textContent = 'Use a fictional student name to try signup, SMS verification, and subscriptions. No real SMS is sent.';
}
const sampleNumber = '077 123 4567';
const maskedNumber = '+94 77 ••• 4567';
const lifetime = 5 * 60_000;
const cooldown = 60_000;
const limit = 5;
let challenge;
let timer;

function showNumber() {
  clearInterval(timer);
  challenge = undefined;
  notice.textContent = '';
  if (signup) {
    panel.innerHTML = `<form id="signup-form">
      <label for="student-name">Student name</label><input id="student-name" name="studentName" required maxlength="80" autocomplete="off" placeholder="Sample Student">
      <label for="grade">Grade</label><select id="grade" name="grade" required><option value="5">Grade 5</option></select>
      <label for="phone">Sample guardian mobile number</label><input id="phone" type="tel" value="${sampleNumber}" readonly>
      <p>The test code demonstrates control of the sample number. The fictional name is stored only in this browser tab.</p>
      <label class="consent"><input name="confirm" type="checkbox" required> I confirm guardian consent for this demo.</label>
      <div class="actions"><button lang="en" class="primary">Send Test Code</button></div></form>`;
    panel.querySelector('#student-name').value = studentName || '';
    return;
  }
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
    <div class="inbox"><strong>Simulated SMS to ${maskedNumber}</strong><br>
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
  if (event.target.id === 'signup-form') {
    const values = new FormData(event.target);
    studentName = values.get('studentName').trim();
    if (!studentName) {
      notice.textContent = 'Enter a fictional student name.';
      return;
    }
    issueCode();
    return;
  }
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
  if (signup) {
    try {
      if (sessionStorage.getItem(nameKey) !== studentName) sessionStorage.removeItem('cmc-demo-subscription');
      sessionStorage.setItem(nameKey, studentName);
    } catch {}
  }
  panel.innerHTML = `<h2 tabindex="-1">Demo sign-in successful</h2>
    <p>Guardian mobile verified for this simulation. Continue as the sample Grade 5 student.</p>
    <div class="inbox"><strong id="confirmed-name">Sample Student</strong><br>Grade 5</div>
    <div class="actions"><a lang="en" class="primary" href="/sample-quiz">Start Grade 5 Sample</a><a href="${signup ? '#plans-heading' : '/signup#plans-heading'}">Choose Subscription</a><button data-action="reset">Try Again</button></div>`;
  if (signup) {
    panel.querySelector('#confirmed-name').textContent = studentName;
    document.dispatchEvent(new CustomEvent('demo-student-verified', { detail:studentName }));
  }
  panel.querySelector('h2').focus();
});
showNumber();
