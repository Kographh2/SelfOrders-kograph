export function mountGame(byId) {
 const foods = [['☕','Kopi'],['🍔','Burger'],['🍕','Pizza'],['🍩','Donat'],['🍓','Stroberi'],['🍦','Es krim']];
 let cards = [], opened = [], matches = 0, moves = 0, lock = false, timer;
 function reset() {
  clearTimeout(timer); opened = []; matches = 0; moves = 0; lock = false;
  cards = [...foods, ...foods].map(([icon, name]) => ({ icon, name, matched: false }));
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  byId('board').replaceChildren();
  cards.forEach((card, index) => {
   const button = document.createElement('button'); button.type = 'button'; button.className = 'tile'; button.textContent = '?';
   button.setAttribute('aria-label', 'Kartu ' + (index + 1) + ', tertutup'); button.setAttribute('aria-pressed', 'false');
   button.addEventListener('click', () => flip(index)); byId('board').append(button);
  });
  byId('pairs').textContent = '0 / 6 pasang'; byId('moves').textContent = '0 langkah'; byId('result').textContent = 'Pilih kartu pertama Anda.';
 }
 function paint(index, show) {
  const button = byId('board').children[index], card = cards[index];
  button.textContent = show ? card.icon : '?'; button.classList.toggle('open', show); button.classList.toggle('matched', card.matched);
  button.setAttribute('aria-pressed', String(show)); button.setAttribute('aria-disabled', String(card.matched));
  button.setAttribute('aria-label', 'Kartu ' + (index + 1) + ', ' + (show ? card.name + (card.matched ? ', cocok' : '') : 'tertutup'));
 }
 function flip(index) {
  if (lock || cards[index].matched || opened.includes(index)) return;
  opened.push(index); paint(index, true);
  if (opened.length === 1) { byId('result').textContent = cards[index].name + '. Cari pasangannya.'; return; }
  moves++; byId('moves').textContent = moves + ' langkah';
  const [a, b] = opened;
  if (cards[a].name === cards[b].name) {
   cards[a].matched = cards[b].matched = true; matches++; paint(a, true); paint(b, true); opened = [];
   byId('pairs').textContent = matches + ' / 6 pasang';
   byId('result').textContent = matches === 6 ? 'Lengkap! Semua menu cocok dalam ' + moves + ' langkah. Main lagi?' : 'Cocok! Lanjutkan ke pasangan berikutnya.';
  } else {
   lock = true; byId('result').textContent = 'Belum sama. Ingat posisinya, lalu coba lagi.';
   timer = setTimeout(() => { paint(a, false); paint(b, false); opened = []; lock = false; }, 1000);
  }
 }
 byId('restart').addEventListener('click', reset); reset();

 return () => { clearTimeout(timer); byId('restart').removeEventListener('click',reset); byId('board').replaceChildren(); };
}
