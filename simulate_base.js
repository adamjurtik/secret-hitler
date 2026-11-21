'use strict';
const { startGame, act, rooms } = require('../server');
const crypto = require('crypto');
function shuffle(a){ for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
function counts(n){ if(n<=10){const t={5:[3,1],6:[4,1],7:[4,2],8:[5,2],9:[5,3],10:[6,3]}[n];return {liberal:t[0],fascist:t[1],hitler:1};} const f=Math.min(5,Math.max(3,Math.floor((n-1)/4)));return {liberal:n-f-1,fascist:f,hitler:1}; }
function game(n){
 const ps=Array.from({length:n},(_,i)=>({id:'p'+i,token:'t'+i,name:'P'+i,alive:true,role:null,party:null}));
 const room={code:'TEST',mode:'personal',players:ps,hostId:'p0',boardToken:null,status:'lobby',game:null,settings:{roleCounts:counts(n),extensions:{}},chat:[],chatSeq:0,clients:new Map(),lastActive:Date.now(),nextPid:n+1,gameNo:0};
 startGame(room); act(room,{player:ps[0],isHost:true},{type:'dealRoles'}); let steps=0;
 while(room.status==='playing' && steps++<800){
   const g=room.game, alive=ps.filter(p=>p.alive);
   if(g.phase==='roles'){for(const p of alive)act(room,{player:p,isHost:p.id==='p0'},{type:'ackRole'});}
   else if(g.phase==='nominate'){const p=ps.find(x=>x.id===g.presidentId);const opts=alive.filter(x=>x.id!==p.id && x.id!==g.lastChanc && !(alive.length>5&&x.id===g.lastPres));act(room,{player:p,isHost:p.id==='p0'},{type:'nominate',target:opts[crypto.randomInt(opts.length)].id});}
   else if(g.phase==='vote'){for(const p of alive)act(room,{player:p,isHost:p.id==='p0'},{type:'vote',ja:Math.random()<.52});}
   else if(g.phase==='legPres'){const p=ps.find(x=>x.id===g.president);act(room,{player:p,isHost:p.id==='p0'},{type:'presDiscard',index:crypto.randomInt(3)});}
   else if(g.phase==='legChanc'){const p=ps.find(x=>x.id===g.chancellor);act(room,{player:p,isHost:p.id==='p0'},{type:'chancEnact',index:crypto.randomInt(2)});}
   else if(g.phase==='veto'){const p=ps.find(x=>x.id===g.president);act(room,{player:p,isHost:p.id==='p0'},{type:'vetoAnswer',agree:Math.random()<.25});}
   else if(g.phase==='power'){
     const p=ps.find(x=>x.id===g.president);
     if(g.power==='peek')act(room,{player:p,isHost:p.id==='p0'},{type:'powerAck'});
     else {const opts=alive.filter(x=>x.id!==p.id && (g.power!=='investigate'||!g.investigated.includes(x.id)));if(opts.length)act(room,{player:p,isHost:p.id==='p0'},{type:'power',target:opts[crypto.randomInt(opts.length)].id});else act(room,{player:p,isHost:p.id==='p0'},{type:'powerAck'});}
   }
   else if(g.phase==='powerAck'){const p=ps.find(x=>x.id===g.president);act(room,{player:p,isHost:p.id==='p0'},{type:'powerAck'});}
   else throw Error('Unknown phase '+g.phase);
 }
 if(room.status!=='ended')throw Error('Game did not finish, n='+n+' phase='+room.game.phase+' steps='+steps);
 return {winner:room.game.winner,reason:room.game.reason,steps};
}
const total=1000, byN={}, winners={};let maxSteps=0;
for(let i=0;i<total;i++){const n=5+(i%16);const r=game(n);byN[n]=(byN[n]||0)+1;winners[r.winner]=(winners[r.winner]||0)+1;maxSteps=Math.max(maxSteps,r.steps);}
console.log(JSON.stringify({total,byPlayerCount:byN,winners,maxSteps,scope:'base-game engine only; random agents; expansions not implemented in this simulation'},null,2));
