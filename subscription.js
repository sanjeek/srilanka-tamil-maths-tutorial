const plans = {
  free: { label: 'இலவசப் பயிற்சி', price: 0, detail: '20 வினாக்கள் · அட்டை தேவையில்லை' },
  monthly: { label: 'மாதாந்தத் திட்டம்', price: 999, detail: 'மாணவர் ஒருவருக்கு மாதாந்தக் கட்டணம்' },
  annual: { label: 'வருடாந்தத் திட்டம்', price: 7999, detail: 'மாணவர் ஒருவருக்கு வருடாந்தக் கட்டணம்' }
};
const storageKey = 'cmc-demo-subscription';
const checkout = document.querySelector('#checkout');
const money = amount => 'A$' + (amount / 100).toFixed(2);
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
    <h2>${plan.label}</h2><p class="price">${money(plan.price)} <small>AUD</small></p><p>${plan.detail}</p>
    ${id === 'annual' ? '<p>ஆண்டுச் சேமிப்பு '+money(plans.monthly.price * 12 - plans.annual.price)+'</p>' : ''}
    ${id === 'free' ? '<a lang="en" class="button" href="/sample-quiz">Start Free Sample</a>' :
      '<button lang="en" data-plan="'+id+'" '+(blocked ? 'disabled' : '')+'>Choose Plan</button>'}
  </article>`).join('');
  if (!name) {
    checkout.innerHTML = '<h2>மாணவர் பதிவு</h2><p>சோதனைச் சந்தாவைத் தொடர மாணவரைப் பதிவு செய்யுங்கள்.</p><a lang="en" class="button" href="/signup">Create Student Account</a>';
    return;
  }
  const person = '<h2>சோதனை மாணவர் — '+escape(name)+'</h2>';
  if (selected) {
    checkout.innerHTML = person + '<p>'+plans[selected].label+' · '+money(plans[selected].price)+' AUD</p><p>நேரடி சேவையில் தேர்ந்தெடுத்த இடைவெளியில் சந்தா புதுப்பிக்கப்படும். இந்தச் சோதனையில் பணம் வசூலிக்கப்படாது அல்லது புதுப்பிக்கப்படாது.</p><div class="actions"><button lang="en" data-action="confirm">Confirm Test Order</button><button lang="en" class="secondary" data-action="back">Back</button></div>';
    return;
  }
  if (!order) { checkout.innerHTML = person+'<p>ஒரு திட்டத்தைத் தெரிவு செய்யுங்கள்.</p>'; return; }
  const statuses = { pending:'செயலாக்கப்படுகிறது',active:'சோதனை அணுகல் செயலில் உள்ளது',failed:'சோதனைக் கட்டணம் தோல்வியடைந்தது',cancelled:'ரத்து செய்யப்பட்டது · காலம் முடியும் வரை அணுகல் உண்டு',refunded:'பணம் திருப்பப்பட்டது · கட்டண அணுகல் முடிந்தது' };
  const actions = { pending:[['active','Simulate Success'],['failed','Simulate Failure']],active:[['cancelled','Simulate Cancellation'],['refunded','Simulate Refund']],cancelled:[['refunded','Simulate Refund']] };
  checkout.innerHTML = person+'<p>'+plans[order.plan].label+' · '+money(plans[order.plan].price)+' AUD</p><p>'+statuses[order.state]+'</p><div class="actions">'+
    (actions[order.state] || []).map(([state,label])=>'<button lang="en" data-action="'+state+'">'+label+'</button>').join('')+'</div>';
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.plan) {
    if (!name) { location.assign('/signup'); return; }
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
render();
