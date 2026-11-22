const plans = {
  free: { label: 'Free Sample', price: 0, detail: '20 questions. No payment card required.' },
  monthly: { label: 'Monthly', price: 99000, detail: '30 days of test access for one student.' },
  annual: { label: 'Annual', price: 799000, detail: '12 months of test access for one student.' }
};
const storageKey = 'cmc-demo-subscription';
const checkout = document.querySelector('#checkout');
const money = amount => 'Rs. ' + (amount / 100).toLocaleString('en-LK');
const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let name, order, selected;
try {
  name = sessionStorage.getItem('cmc-demo-student');
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (name && saved?.name === name && ['monthly', 'annual'].includes(saved.plan) &&
      ['pending','active','failed','cancelled','refunded'].includes(saved.state)) order = saved;
} catch {}

function save(state) {
  order = { name, plan: selected || order.plan, state };
  try { sessionStorage.setItem(storageKey, JSON.stringify(order)); } catch {}
}

function render() {
  const blocked = ['pending','active','cancelled'].includes(order?.state);
  document.querySelector('#plans').innerHTML = Object.entries(plans).map(([id, plan]) => `<article>
    <h2>${plan.label}</h2><p class="price">${money(plan.price)} <small>LKR</small></p><p>${plan.detail}</p>
    ${id === 'annual' ? '<p>Annual savings '+money(plans.monthly.price * 12 - plans.annual.price)+'</p>' : ''}
    ${id === 'free' ? '<a lang="en" class="button" href="/sample-quiz">Start Free Sample</a>' :
      '<button lang="en" data-plan="'+id+'" '+(blocked ? 'disabled' : '')+'>Choose Plan</button>'}
  </article>`).join('');
  if (!name) {
    checkout.innerHTML = '<h2>Verify the student first</h2><p>Complete signup and enter the test code above to choose a paid plan.</p><a lang="en" class="button" href="#heading">Go to Sign Up</a>';
    return;
  }
  const person = '<h2>Demo student — '+escape(name)+'</h2>';
  if (selected) {
    checkout.innerHTML = person + '<p>'+plans[selected].label+' · '+money(plans[selected].price)+' LKR</p><p>One-time test access. No automatic renewal.</p><div class="actions"><button lang="en" data-action="confirm">Confirm Test Order</button><button lang="en" class="secondary" data-action="back">Back</button></div>';
    return;
  }
  if (!order) { checkout.innerHTML = person+'<p>Choose a plan to see the test order.</p>'; return; }
  const statuses = { pending:'Processing test payment',active:'Test access is active',failed:'Test payment failed',cancelled:'Cancelled. Test access remains until the end of the period.',refunded:'Refunded. Paid test access has ended.' };
  const actions = { pending:[['active','Simulate Success'],['failed','Simulate Failure']],active:[['cancelled','Simulate Cancellation'],['refunded','Simulate Refund']],cancelled:[['refunded','Simulate Refund']] };
  checkout.innerHTML = person+'<p>'+plans[order.plan].label+' · '+money(plans[order.plan].price)+' LKR</p><p>'+statuses[order.state]+'</p><div class="actions">'+
    (actions[order.state] || []).map(([state,label])=>'<button lang="en" data-action="'+state+'">'+label+'</button>').join('')+'</div>';
}

const planSection = document.querySelector('#signup-and-plans');
document.addEventListener('demo-student-verified', event => {
  if (name !== event.detail) { order = undefined; selected = undefined; }
  name = event.detail;
  render();
});
planSection.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.plan) {
    if (!name) { document.querySelector('#heading').focus(); return; }
    selected = button.dataset.plan;
  } else {
    const action = button.dataset.action;
    if (action === 'back') selected = undefined;
    if (action === 'confirm' && selected) { save('pending'); selected = undefined; }
    if (order?.state === 'pending' && ['active','failed'].includes(action)) save(action);
    else if (order?.state === 'active' && ['cancelled','refunded'].includes(action)) save(action);
    else if (order?.state === 'cancelled' && action === 'refunded') save(action);
  }
  render();
  checkout.scrollIntoView({ block:'nearest' });
});
if (!planSection.hidden) render();
