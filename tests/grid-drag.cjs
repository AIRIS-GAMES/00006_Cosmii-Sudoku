const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

for (const file of ['www/index.html', 'ios/App/App/public/index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.doesNotMatch(html, /SUN-TV|SUNTV|suntv|おっ！サン|Oh! Sun|ohsun_\d+\.png|collab/i, 'collaboration references are removed');
  const abilityCode = html.slice(html.indexOf('const COSMII_ABILITY_ASSETS ='), html.indexOf('const ABILITY_EVENT_INTERVAL ='))
    + html.slice(html.indexOf('function abilityEventClearCharacter(){'), html.indexOf('function abilityEventShowCharacter(){'));
  const character = {className:'', replaceChildren(){ this.image = null; }, appendChild(image){ this.image = image; }};
  const abilityContext = vm.createContext({
    Math: Object.assign(Object.create(Math), {random:()=>0.75}),
    document: {getElementById:()=>character, createElement:()=>({addEventListener(){}})},
  });
  vm.runInContext(abilityCode, abilityContext);
  const mascots = vm.runInContext('COSMII_ABILITY_ASSETS', abilityContext);
  assert.equal(mascots.length, 5, 'all five Cosmii are available for random events');
  for (const mascot of mascots) assert.ok(fs.existsSync(`${file.slice(0, file.lastIndexOf('/'))}/${mascot}`), `${file} contains ${mascot}`);
  abilityContext.abilityEventSetCharacter();
  assert.equal(character.image.src, mascots[3], 'event randomly selects a Cosmii mascot');
  assert.equal(character.image.alt, 'Cosmii');
  function setup(fill = 0) {
    const state = {board: Array.from({length: 5}, () => Array(5).fill(fill))};
    const cells = state.board.map((row, r) => row.map((_, c) => ({dataset: {r, c}, closest(){return this;}})));
    const cleared = [], taps = [];
    const context = vm.createContext({state, coach: {active: false}, Date, Math, Set, Map,
      clearTimeout: id => cleared.push(id), renderCell(){}, beep(){}, vibrate(){},
      handleCellTap: (r,c) => taps.push([r,c]),
      els: {gridWrap: {contains: cell => cells.flat().includes(cell), setPointerCapture(){}, releasePointerCapture(){}}},
      document: {elementFromPoint(x,y) {
        if(x < 0 || y < 0 || x >= 200 || y >= 200 || x % 40 >= 38 || y % 40 >= 38) return null;
        return cells[Math.floor(y/40)][Math.floor(x/40)];
      }},
    });
    vm.runInContext(html.slice(html.indexOf('const pendingClicks ='), html.indexOf('function handleCellTap(r, c){')), context);
    const event = (x,y,extra={}) => ({clientX:x, clientY:y, pointerId:1, pointerType:'touch', target: cells[0][0], ...extra});
    return {state, cleared, taps, context, event, call(name,e){context.event=e; vm.runInContext(`${name}(event)`,context);}};
  }
  let t = setup();
  t.call('onGridPointerDown', t.event(20,20));
  vm.runInContext("pendingClicks.set('0_2', 123)", t.context);
  t.call('onGridPointerMove', t.event(180,20));
  assert.deepEqual(t.state.board[0], [2,2,2,2,2], 'fast sweep fills skipped cells across gaps');
  assert.deepEqual(t.cleared, [123], 'queued taps cannot undo swept cells');
  t.call('onGridPointerMove', t.event(20,20));
  assert.deepEqual(t.state.board[0], [2,2,2,2,2], 'backtracking preserves marks');
  t.call('onGridPointerUp', t.event(20,20));
  assert.equal(t.taps.length, 0);

  t = setup(2);
  t.state.board[0][2] = 1;
  t.state.board[0][3] = 3;
  t.call('onGridPointerDown', t.event(20,20));
  t.call('onGridPointerUp', t.event(180,20));
  assert.deepEqual(t.state.board[0], [0,0,1,3,0], 'release-only sweep erases and preserves sealed cells');

  t = setup();
  t.call('onGridPointerDown', t.event(20,20));
  t.call('onGridPointerMove', t.event(180,180, {getCoalescedEvents: () => [t.event(180,20)]}));
  assert.deepEqual(t.state.board[0], [2,2,2,2,2]);
  assert.deepEqual(t.state.board.map(row => row[4]), [2,2,2,2,2], 'batched bend follows original path');
  assert.equal(t.state.board[2][2], 0, 'does not cut across bend');

  t = setup();
  t.call('onGridPointerDown', t.event(20,20));
  t.call('onGridPointerDown', t.event(180,180, {pointerId:2}));
  t.call('onGridPointerMove', t.event(180,180, {pointerId:2}));
  t.call('onGridPointerUp', t.event(180,180, {pointerId:2}));
  assert.equal(t.state.board.flat().some(Boolean), false, 'second finger cannot hijack stroke');
  t.call('onGridPointerUp', t.event(22,20));
  assert.deepEqual(t.taps, [[0,0]], 'small movement remains a tap');

  t = setup();
  t.context.coach = {active:true, act:'cross', remaining:new Set(['0_1','0_3'])};
  t.context.coachCellDone = () => {};
  t.call('onGridPointerDown', t.event(20,20));
  t.call('onGridPointerMove', t.event(180,20));
  assert.deepEqual(t.state.board[0], [0,2,0,2,0], 'tutorial only paints allowed cells');
  console.log(file + ': drag regression checks passed');
}
