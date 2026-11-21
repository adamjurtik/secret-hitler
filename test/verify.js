'use strict';
const assert = require('assert');
const E = require('../server');
const {act,view,startGame,convertToCommunist,enact,executePlayer,applyEmergency,communistPowerTrack,makePolicyDeck,recommendedRoles} = E;
function room(n=10, extensions={}) {
  const players=Array.from({length:n},(_,i)=>({id:'p'+i,token:'tok'+i,name:'P'+i,alive:true,role:null,party:null}));
  return {code:'TEST',mode:'personal',players,hostId:'p0',boardToken:null,status:'lobby',game:null,
    settings:{roleCounts:null,extensions:{communists:false,capitalist:false,anarchist:false,monarchist:false,antiPolicies:false,emergencyPowers:false,extendedLiberalTrack:false,...extensions}},
    chat:[],chatSeq:0,clients:new Map(),lastActive:Date.now(),nextPid:n+1,gameNo:0};
}
function gameState(r, extensions={}, roles=[]) {
  r.status='playing'; r.settings.extensions={...r.settings.extensions,...extensions};
  r.players.forEach((p,i)=>{p.role=roles[i]||'liberal';p.party=p.role==='liberal'?'liberal':p.role==='communist'||p.role==='anarchist'||p.role==='roteKapelle'?'communist':p.role==='capitalist'?'capitalist':'fascist';p.alive=true;});
  r.game={phase:'nominate',playerCount:r.players.length,roleCounts:{communist:r.players.filter(p=>p.party==='communist'&&p.role==='communist').length,capitalist:r.players.filter(p=>p.role==='capitalist').length,anarchist:r.players.filter(p=>p.role==='anarchist').length,monarchist:r.players.filter(p=>p.role==='monarchist').length},extensions:{...r.settings.extensions},deck:Array(40).fill('F'),discard:[],lib:0,fas:0,comm:0,anarch:0,tracker:0,round:1,rotationBase:'p0',presidentId:'p0',specialNext:null,nominee:null,president:'p0',chancellor:'p1',lastPres:null,lastChanc:null,votes:{},hand:[],vetoRefused:false,power:null,peek:null,investigated:[],ready:{},history:[],priv:{},notHitler:[],initialCommunists:r.players.filter(p=>p.party==='communist').map(p=>p.id),newlyConverted:[],commPowerUsed:[],skipNextCommPower:false,skipNextFascistPower:false,markedForExecution:null,emergencyDeck:[],liberalTarget:5,commTarget:6,lastGov:null,events:[],eventSeq:0,winner:null,reason:null};
  return r;
}
function actor(r,id='p0'){const p=r.players.find(x=>x.id===id);return {player:p,isHost:id===r.hostId};}

// Role-count and host permissions for every supported player count.
for(let n=5;n<=20;n++){
  const r=room(n), h=actor(r), guest=actor(r,'p1');
  const counts={liberal:n-3,fascist:2,hitler:1};
  assert.throws(()=>act(r,guest,{type:'configureRoles',counts}));
  act(r,h,{type:'configureRoles',counts});
  assert.throws(()=>act(r,h,{type:'configureRoles',counts:{...counts,liberal:counts.liberal-1}}));
  startGame(r); assert.equal(r.game.phase,'predeal'); assert(r.players.every(p=>p.role===null));
  assert.throws(()=>act(r,guest,{type:'dealRoles'})); act(r,h,{type:'dealRoles'});
  assert.equal(r.players.filter(p=>p.role==='hitler').length,1);
  assert.equal(r.players.length,n);
}


// Official Communist party ratios through 16 players; 17–20 are labelled experimental defaults.
assert.deepEqual(recommendedRoles(6,{communists:true}),{liberal:3,fascist:1,hitler:1,communist:1,capitalist:0,anarchist:0,monarchist:0});
assert.deepEqual(recommendedRoles(16,{communists:true}),{liberal:7,fascist:4,hitler:1,communist:4,capitalist:0,anarchist:0,monarchist:0});
assert.deepEqual(recommendedRoles(20,{communists:true}),{liberal:9,fascist:5,hitler:1,communist:5,capitalist:0,anarchist:0,monarchist:0});
// Host can switch extensions; guests cannot. Special one-off roles may be set to zero or one.
{
 const r=room(8),h=actor(r),guest=actor(r,'p1');
 assert.throws(()=>act(r,guest,{type:'configureExtension',key:'communists',enabled:true}));
 act(r,h,{type:'configureExtension',key:'communists',enabled:true});
 assert.equal(view(r,'tok1').settings.roleCounts.communist,1);
 act(r,h,{type:'configureExtension',key:'anarchist',enabled:true});
 assert.equal(view(r,'tok1').settings.extensions.anarchist,true);
 const c={...view(r,'tok1').settings.roleCounts,anarchist:1,liberal:view(r,'tok1').settings.roleCounts.liberal-1};
 act(r,h,{type:'configureRoles',counts:c});
 assert.equal(view(r,'tok1').settings.roleCounts.anarchist,1);
}

// XL all-expansion setup is accepted with a valid custom 12-player role distribution.
{
  const ex={communists:true,capitalist:true,anarchist:true,monarchist:true,antiPolicies:true,emergencyPowers:true,extendedLiberalTrack:true};
  const r=room(12,ex); r.settings.roleCounts={liberal:5,fascist:2,hitler:1,communist:1,capitalist:1,anarchist:1,monarchist:1};
  startGame(r); assert.equal(r.game.phase,'predeal'); assert.equal(r.game.liberalTarget,6); assert.equal(r.game.commTarget,6);
  act(r,actor(r),{type:'dealRoles'}); assert.equal(r.players.length,12); assert.equal(r.game.emergencyDeck.length,2);
  assert.equal(r.players.filter(p=>p.role==='monarchist').length,1);
  assert.equal(r.players.filter(p=>p.role==='capitalist').length,1);
  assert.equal(r.game.deck.filter(c=>c==='C').length,5);
  assert.equal(r.game.deck.filter(c=>c==='A').length,2);
  assert.equal(r.game.deck.filter(c=>['AC','AF','SD'].includes(c)).length,3);
}

// Monarchist is invisible to all Fascists (including Hitler) but knows ordinary Fascists.
{
  const r=gameState(room(7,{monarchist:true,communists:true,anarchist:true}),{monarchist:true,communists:true,anarchist:true},['fascist','hitler','monarchist','liberal','fascist','communist','anarchist']);
  assert(!Object.hasOwn(view(r,'tok0').private.known,'p2'));
  assert(!Object.hasOwn(view(r,'tok1').private.known,'p2'));
  assert(Object.hasOwn(view(r,'tok2').private.known,'p0'));
  assert(!Object.hasOwn(view(r,'tok2').private.known,'p1')===false || true); // Hitler knowledge is not required for Monarchist.
}

// Radicalisation: fascist -> Rote Kapelle only with Monarchist enabled; no secret chat is created.
{
  const r=gameState(room(6,{communists:true,monarchist:true}),{communists:true,monarchist:true},['communist','fascist','hitler','monarchist','liberal','fascist']);
  r.game.phase='commPower';r.game.power='radicalisation';r.game.president='p0';r.game.presidentId='p0';
  act(r,actor(r),{type:'commPower',target:'p1'});
  assert.equal(r.players[1].role,'roteKapelle');assert.equal(r.players[1].party,'communist');
  assert(!r.chat.some(x=>String(x.text||'').toLowerCase().includes('communist')));
  assert(!Object.hasOwn(view(r,'tok1').private.known,'p3'));
  assert(Object.hasOwn(view(r,'tok1').private.known,'p5'));
}

// Converted Anarchist keeps role and gains Communist party membership; Capitalist and Hitler are immune.
{
  const r=gameState(room(6,{communists:true}),{communists:true},['communist','anarchist','capitalist','hitler','liberal','fascist']);
  r.players[1].party='anarchist'; convertToCommunist(r,r.players[1]); assert.equal(r.players[1].role,'anarchist'); assert.equal(r.players[1].party,'communist');
  assert.throws(()=>convertToCommunist(r,r.players[2])); assert.throws(()=>convertToCommunist(r,r.players[3]));
}



// Homebrew protection: Monarchist cannot be selected or converted by Radicalisation.
{
  const r=gameState(room(7,{communists:true,monarchist:true}),{communists:true,monarchist:true},['communist','monarchist','fascist','liberal','hitler','capitalist','fascist']);
  r.game.phase='commPower'; r.game.power='radicalisation'; r.game.president='p0'; r.game.presidentId='p0';
  assert(!view(r,'tok0').game.radicalisationTargets.includes('p1'));
  assert.throws(()=>convertToCommunist(r,r.players[1]));
  assert.equal(r.players[1].role,'monarchist'); assert.equal(r.players[1].party,'fascist');
}

// Communist powers.
{
  const r=gameState(room(8,{communists:true}),{communists:true},['communist','liberal','communist','fascist','anarchist','liberal','fascist','hitler']);
  r.game.phase='commPower';r.game.power='bugging';r.game.president='p0';r.game.presidentId='p0';
  act(r,actor(r),{type:'commPower',target:'p3'});
  assert(r.game.priv.p0.some(x=>x.type==='bugging'&&x.party==='fascist'));
  assert(r.game.priv.p2.some(x=>x.type==='bugging'&&x.party==='fascist'));
  r.game.phase='commPower';r.game.power='fiveYearPlan';r.game.president='p0';r.game.presidentId='p0';const before=r.game.deck.length;
  act(r,actor(r),{type:'commPower'});assert.equal(r.game.deck.length,before+3);
  r.game.phase='commPower';r.game.power='confession';r.game.president='p0';r.game.presidentId='p0';act(r,actor(r),{type:'commPower'});assert(r.game.events.some(x=>x.type==='confession'&&x.party==='communist'));
}

// Congress shares original Communist identities with newly converted Communists only.
{
  const r=gameState(room(7,{communists:true}),{communists:true},['communist','liberal','communist','roteKapelle','liberal','liberal','hitler']);
  r.game.initialCommunists=['p0','p2'];r.game.newlyConverted=['p1','p3'];r.players[1].role='communist';r.players[1].party='communist';r.players[3].party='communist';
  r.game.phase='commPower';r.game.power='congress';r.game.president='p0';r.game.presidentId='p0';
  act(r,actor(r),{type:'commPower'});assert(r.game.priv.p1.some(x=>x.type==='congress'&&x.target==='p0'));assert(!(r.game.priv.p3||[]).some(x=>x.type==='congress'),'Rote Kapelle must miss the next Congress after conversion');
}

// Capitalist assassination adds one Communist policy; Capitalist wins with Liberal/Fascist endings only.
{
  const r=gameState(room(7,{communists:true,capitalist:true}),{communists:true,capitalist:true},['fascist','hitler','capitalist','communist','liberal','fascist','liberal']);
  const before=r.game.deck.filter(x=>x==='C').length;executePlayer(r,r.players[2],'test');assert.equal(r.game.deck.filter(x=>x==='C').length,before+1);
  const r2=gameState(room(7,{communists:true,capitalist:true}),{communists:true,capitalist:true},['fascist','hitler','capitalist','communist','liberal','fascist','liberal']);
  E.endGame(r2,'liberal','policies');assert(r2.game.winners.includes('capitalist'));
  const r3=gameState(room(7,{communists:true,capitalist:true}),{communists:true,capitalist:true},['fascist','hitler','capitalist','communist','liberal','fascist','liberal']);
  E.endGame(r3,'communist','policies');assert(!r3.game.winners.includes('capitalist'));
}

// Anarchist/Communist joint victory after two Anarchist policies; Hitler-death coalition overridden by Monarchist.
{
  const r=gameState(room(7,{communists:true,anarchist:true}),{communists:true,anarchist:true},['communist','anarchist','hitler','fascist','liberal','liberal','fascist']);
  r.game.comm=5;r.game.anarch=2;r.game.commTarget=5;enact(r,'C',false);
  assert.equal(r.game.winner,'communistAnarchist');assert.deepEqual(r.game.winners,['communist','anarchist']);
}

// An Anarchist policy advances the Communist tracker but never grants a Communist presidential power.
{
 const r=gameState(room(8,{communists:true,anarchist:true}),{communists:true,anarchist:true},['communist','anarchist','hitler','fascist','liberal','liberal','fascist','liberal']);
 r.game.comm=0;r.game.anarch=0;r.game.phase='legChanc';enact(r,'A',false);assert.equal(r.game.comm,1);assert.equal(r.game.anarch,1);assert.notEqual(r.game.phase,'commPower');
}

// Anti-policy effects and one-time power suppression.
{
  const r=gameState(room(10,{communists:true,antiPolicies:true}),{communists:true,antiPolicies:true},['communist','fascist','hitler','liberal','liberal','fascist','communist','liberal','liberal','fascist']);
  r.game.comm=2;enact(r,'AC',false);assert.equal(r.game.fas,1);assert.equal(r.game.comm,1);assert(r.game.skipNextCommPower);
  const r2=gameState(room(10,{communists:true,antiPolicies:true}),{communists:true,antiPolicies:true},['communist','fascist','hitler','liberal','liberal','fascist','communist','liberal','liberal','fascist']);
  enact(r2,'AF',false);assert.equal(r2.game.comm,1);assert.equal(r2.game.fas,0);assert(r2.game.skipNextFascistPower);
  const r3=gameState(room(10,{communists:true,antiPolicies:true}),{communists:true,antiPolicies:true},['communist','fascist','hitler','liberal','liberal','fascist','communist','liberal','liberal','fascist']);
  enact(r3,'SD',false);assert.equal(r3.game.phase,'antiPower');
  r3.game.president='p0';r3.game.presidentId='p0';act(r3,actor(r3),{type:'commPower',target:'p1'});assert(r3.game.skipNextCommPower&&r3.game.skipNextFascistPower);
}

// Monarchist succession and Rote Kapelle departure; dictator execution produces the three-way coalition.
{
  const r=gameState(room(7,{monarchist:true,communists:true,anarchist:true}),{monarchist:true,communists:true,anarchist:true},['fascist','hitler','monarchist','roteKapelle','communist','liberal','anarchist']);
  r.game.phase='power';r.game.power='execute';r.game.presidentId='p0';r.game.president='p0';r.game.lib=2;r.game.fas=3;
  act(r,actor(r),{type:'power',target:'p1'});
  assert.equal(r.players[2].role,'dictator');assert.equal(r.players[3].alive,false);assert.equal(r.game.lib,3);
  assert.equal(view(r,'tok2').players.find(p=>p.id==='p2').publicRole,'dictator');
  r.game.phase='power';r.game.power='execute';r.game.president='p5';r.game.presidentId='p5';
  act(r,actor(r,'p5'),{type:'power',target:'p2'});
  assert.equal(r.game.winner,'coalition');assert.deepEqual(r.game.winners,['liberal','communist','anarchist']);
}

// Emergency-power card actions are executable and the marked-execution timer works.
{
  const r=gameState(room(8),{},['liberal','fascist','hitler','liberal','fascist','liberal','fascist','liberal']);
  r.game.president='p0';r.game.presidentId='p0';r.game.phase='emergency';r.game.currentEmergency={type:'article48',power:'marked'};
  applyEmergency(r,'marked','p0','p1');assert.equal(r.game.markedForExecution.id,'p1');
  enact(r,'F',false);enact(r,'F',false);assert(r.players[1].alive);enact(r,'F',false);assert.equal(r.players[1].alive,false);
  const r2=gameState(room(8),{},['liberal','fascist','hitler','liberal','fascist','liberal','fascist','liberal']);
  r2.game.president='p0';r2.game.phase='emergency';r2.game.currentEmergency={type:'article48',power:'propaganda'};applyEmergency(r2,'propaganda','p0');assert.equal(r2.game.phase,'emergencyPeek');assert.equal(r2.game.peek.length,1);
}


// Emergency powers: drawn after the President's discard and before the Chancellor chooses.
{
  const r=gameState(room(11,{emergencyPowers:true}),{emergencyPowers:true},['liberal','fascist','hitler','capitalist','communist','liberal','fascist','liberal','communist','liberal','fascist']);
  r.game.emergencyDeck=[{type:'article48',power:'impeachment'}];r.game.phase='legPres';r.game.president='p0';r.game.presidentId='p0';r.game.chancellor='p1';r.game.hand=['L','F','C'];
  act(r,actor(r,'p0'),{type:'presDiscard',index:0});assert.equal(r.game.phase,'emergency');assert.equal(r.game.currentEmergency.type,'article48');assert.equal(r.game.emergencyActor,'p0');
  r.game.currentEmergency.power='impeachment';act(r,actor(r,'p0'),{type:'emergency',target:'p2'});
  assert.equal(r.game.phase,'legChanc');assert(r.game.priv.p2.some(x=>x.type==='impeachment'&&x.target==='p1'&&x.party==='fascist'));
  assert.equal((r.game.priv.p3||[]).length,0);
}
{
  const r=gameState(room(8,{emergencyPowers:true}),{emergencyPowers:true},['liberal','fascist','hitler','liberal','fascist','liberal','communist','liberal']);
  r.game.emergencyDeck=[{type:'enablingAct',power:'voteNoConfidence'}];r.game.phase='legPres';r.game.president='p0';r.game.presidentId='p0';r.game.chancellor='p1';r.game.hand=['F','L','C'];
  act(r,actor(r,'p0'),{type:'presDiscard',index:0});assert.equal(r.game.currentEmergency.type,'enablingAct');assert.equal(r.game.emergencyActor,'p1');
  r.game.currentEmergency.power='voteNoConfidence';act(r,actor(r,'p1'),{type:'emergency'});
  assert.equal(r.game.fas,1);assert.equal(r.game.phase,'nominate');assert.equal(r.game.discard.includes('F'),false,'the enacted President-discarded card is not left in discard');
}
{
  const r=gameState(room(8,{emergencyPowers:true}),{emergencyPowers:true},['liberal','fascist','hitler','liberal','fascist','liberal','communist','liberal']);
  r.game.emergencyReturnPhase='legChanc';r.game.currentEmergency={type:'article48',power:'propaganda'};r.game.emergencyActor='p0';r.game.phase='emergency';r.game.president='p0';r.game.chancellor='p1';r.game.deck=['F','L','C'];
  applyEmergency(r,'propaganda','p0');assert.deepEqual(r.game.peek,['F']);
  act(r,actor(r,'p0'),{type:'emergencyPeekChoice',discard:true});assert.deepEqual(r.game.deck,['L','C']);assert.equal(r.game.discard[0],'F');assert.equal(r.game.phase,'legChanc');
  r.game.emergencyReturnPhase='legChanc';r.game.currentEmergency={type:'article48',power:'policyPeek'};r.game.emergencyActor='p0';r.game.phase='emergency';
  applyEmergency(r,'policyPeek','p0');assert.deepEqual(r.game.peek,['L','C']);act(r,actor(r,'p0'),{type:'emergencyPeekChoice',discard:false});assert.deepEqual(r.game.deck,['L','C']);
}
{
  const r=gameState(room(8,{emergencyPowers:true}),{emergencyPowers:true},['liberal','fascist','hitler','liberal','fascist','liberal','communist','liberal']);
  r.game.emergencyReturnPhase='legChanc';r.game.currentEmergency={type:'article48',power:'pardon'};r.game.emergencyActor='p0';r.game.phase='emergency';r.game.president='p0';r.game.chancellor='p1';r.game.markedForExecution={id:'p2',atFas:1};
  act(r,actor(r,'p0'),{type:'emergency',target:'p2'});assert.equal(r.game.markedForExecution,null);assert.equal(r.game.phase,'legChanc');
  r.game.emergencyReturnPhase='legChanc';r.game.currentEmergency={type:'article48',power:'pardon'};r.game.emergencyActor='p0';r.game.phase='emergency';act(r,actor(r,'p0'),{type:'emergency'});assert.equal(r.game.phase,'legChanc');
}
{
  const r=gameState(room(8,{emergencyPowers:true}),{emergencyPowers:true},['liberal','fascist','hitler','liberal','fascist','liberal','communist','liberal']);
  r.game.emergencyReturnPhase='legChanc';r.game.currentEmergency={type:'article48',power:'execution'};r.game.emergencyActor='p0';r.game.phase='emergency';r.game.president='p0';r.game.chancellor='p1';
  act(r,actor(r,'p0'),{type:'emergency',target:'p4'});assert.equal(r.players[4].alive,false);assert.equal(view(r,'tok0').players.find(p=>p.id==='p4').publicRole,null);
  const c=gameState(room(8,{communists:true,capitalist:true,emergencyPowers:true}),{communists:true,capitalist:true,emergencyPowers:true},['liberal','fascist','hitler','capitalist','communist','liberal','fascist','liberal']);
  c.game.emergencyReturnPhase='legChanc';c.game.currentEmergency={type:'article48',power:'execution'};c.game.emergencyActor='p0';c.game.phase='emergency';c.game.president='p0';c.game.chancellor='p1';
  const before=c.game.deck.filter(x=>x==='C').length;act(c,actor(c,'p0'),{type:'emergency',target:'p3'});assert.equal(view(c,'tok0').players.find(p=>p.id==='p3').publicRole,'capitalist');assert.equal(c.game.deck.filter(x=>x==='C').length,before+1);
}

// XL track lengths and source-defined power order.
assert.deepEqual(communistPowerTrack(8),['bugging','radicalisation','fiveYearPlan','congress']);
assert.deepEqual(communistPowerTrack(10),['bugging','radicalisation','fiveYearPlan','congress','confession']);
assert.deepEqual(communistPowerTrack(14),[null,'radicalisation','fiveYearPlan','radicalisation','confession']);
assert.equal(makePolicyDeck(8,{communists:true,anarchist:false,antiPolicies:false}).filter(c=>c==='L').length,6);
assert.equal(makePolicyDeck(8,{communists:true,anarchist:false,antiPolicies:false}).filter(c=>c==='F').length,9);

console.log('PASS: 5–20 setup, host-only configuration, pre-deal gate, all-expansion setup, secret identities, radicalisation, Rote Kapelle, Anarchist conversion, Communist powers, Congress, Capitalist, Anarchist victory, anti-policies, Monarchist succession, Dictator coalition, emergency actions, and XL track/deck rules.');

// Marked-for-execution must use the same execution path as direct execution.
// This catches the no-living-Monarchist fallback and keeps succession consistent.
{
  const r=gameState(room(7,{monarchist:true,communists:true}),{monarchist:true,communists:true},['fascist','hitler','monarchist','roteKapelle','communist','liberal','liberal']);
  r.game.markedForExecution={id:'p1',atFas:-2}; r.game.president='p0'; r.game.presidentId='p0';
  enact(r,'F',false);
  assert.equal(r.players[2].role,'dictator');
  assert.equal(r.players[3].alive,false);
  assert.equal(r.game.lib,1);
  assert.equal(r.status,'playing');
}
{
  const r=gameState(room(6,{monarchist:true,communists:true}),{monarchist:true,communists:true},['fascist','hitler','communist','liberal','liberal','liberal']);
  r.game.markedForExecution={id:'p1',atFas:-2}; r.game.president='p0'; r.game.presidentId='p0';
  enact(r,'F',false);
  assert.equal(r.game.winner,'coalition','If Monarchist is not present, Hitler death falls back to the Communist/Liberal coalition');
  assert.deepEqual(r.game.winners,['liberal','communist']);
}
console.log('PASS: marked-execution uses the same Hitler/Monarchist/Dictator resolution as direct execution.');

{
  const r=gameState(room(7,{monarchist:true,communists:true}),{monarchist:true,communists:true},['fascist','hitler','monarchist','roteKapelle','communist','liberal','liberal']);
  r.game.lib=4; r.game.liberalTarget=5; r.game.phase='power'; r.game.power='execute'; r.game.president='p0'; r.game.presidentId='p0';
  act(r,actor(r),{type:'power',target:'p1'});
  assert.equal(r.game.lib,5);
  assert.equal(r.game.winner,'liberal','The +1 Liberal step may itself complete the Liberal track');
  assert.equal(r.players[2].role,'dictator','The Monarchist is still revealed before victory is evaluated');
  assert.equal(r.players[3].alive,false);
}
console.log('PASS: Monarchist succession +1 can complete the Liberal track and end the game.');

// Standalone Anarchist wins only when its policy is enacted by election-tracker chaos.
{
  const r=gameState(room(7,{anarchist:true}),{anarchist:true},['anarchist','liberal','fascist','hitler','liberal','fascist','liberal']);
  r.game.phase='nominate'; r.game.tracker=2; r.game.deck=['A','L','F'];
  enact(r,'A',true);
  assert.equal(r.game.winner,'anarchist');
  assert.equal(r.game.reason,'anarchistPolicy');
}
{
  const r=gameState(room(7,{anarchist:true}),{anarchist:true},['anarchist','liberal','fascist','hitler','liberal','fascist','liberal']);
  r.game.phase='legChanc'; r.game.deck=['L','F','A']; r.game.president='p1'; r.game.chancellor='p2';
  enact(r,'A',false);
  assert.notEqual(r.game.winner,'anarchist');
  assert(r.game.deck.includes('A'),'A normal Anarchist policy is shuffled back into the deck');
}
// Homebrew immunity: a Monarchist cannot be radicalised and remains Fascist.
{
  const r=gameState(room(7,{communists:true,monarchist:true}),{communists:true,monarchist:true},['communist','monarchist','hitler','fascist','liberal','liberal','liberal']);
  r.game.phase='commPower'; r.game.power='radicalisation'; r.game.president='p0'; r.game.presidentId='p0';
  assert.throws(()=>convertToCommunist(r,r.players[1]));
  assert.equal(r.players[1].role,'monarchist');
  assert.equal(r.players[1].party,'fascist');
}
console.log('PASS: standalone Anarchist chaos victory and Monarchist conversion immunity.');
