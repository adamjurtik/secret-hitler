'use strict';
const assert=require('assert');
const E=require('../server');
const keys=['communists','capitalist','anarchist','monarchist','antiPolicies','emergencyPowers','extendedLiberalTrack'];
let cases=0;
for(let mask=0;mask<(1<<keys.length);mask++){
 const ex=Object.fromEntries(keys.map((k,i)=>[k,!!(mask&(1<<i))]));
 if((ex.capitalist||ex.antiPolicies)&&!ex.communists) continue; // dependency enforced by the app
 for(let n=5;n<=20;n++){
  const players=Array.from({length:n},(_,i)=>({id:'p'+i,token:'t'+i,name:'P'+i,alive:true,role:null,party:null}));
  const r={code:'MATRIX',mode:'personal',players,hostId:'p0',boardToken:null,status:'lobby',game:null,settings:{roleCounts:null,extensions:ex},chat:[],chatSeq:0,clients:new Map(),lastActive:Date.now(),nextPid:n+1,gameNo:0};
  const counts={liberal:1,fascist:1,hitler:1,communist:ex.communists?1:0,capitalist:0,anarchist:0,monarchist:0};
  let spare=n-(counts.liberal+counts.fascist+counts.hitler+counts.communist);
  for(const k of ['capitalist','anarchist','monarchist']) if(ex[k]&&spare>0){counts[k]=1;spare--;}
  counts.liberal+=spare;
  r.settings.roleCounts=counts;
  E.startGame(r); assert.equal(r.game.phase,'predeal');
  E.act(r,{player:players[0],isHost:true},{type:'dealRoles'});
  assert.equal(players.length,n); assert.equal(players.filter(p=>p.role==='hitler').length,1);
  assert.equal(r.game.extensions.communists,ex.communists);
  cases++;
 }
}
console.log(`PASS: ${cases} extension-combination/player-count setup cases.`);
