'use strict';
const crypto=require('crypto');
const E=require('../server');
const {startGame,act,eligibleChancellors}=E;
let seed=0x6d2b79f5; const emergencyStats={};
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function pick(a){if(!a.length)throw new Error('empty choice');return a[Math.floor(rnd()*a.length)];}
function counts(n){const f=Math.max(1,Math.min(5,Math.floor((n-7)/3)+1));return {liberal:n-f-5,fascist:f,hitler:1,communist:1,capitalist:1,anarchist:1,monarchist:1};}
function makeRoom(n){
 const players=Array.from({length:n},(_,i)=>({id:'p'+i,token:'t'+i,name:'P'+i,alive:true,role:null,party:null}));
 const extensions={communists:true,capitalist:true,anarchist:true,monarchist:true,antiPolicies:true,emergencyPowers:true,extendedLiberalTrack:true};
 return {code:'SIM'+n,mode:'personal',players,hostId:'p0',boardToken:null,status:'lobby',game:null,settings:{roleCounts:counts(n),extensions},chat:[],chatSeq:0,clients:new Map(),lastActive:Date.now(),nextPid:n+1,gameNo:0};
}
function who(room,id){const p=room.players.find(x=>x.id===id);if(!p)throw Error('missing player '+id);return {player:p,isHost:id==='p0'};}
function oneGame(n,maxSteps=1500){
 const r=makeRoom(n);startGame(r);act(r,who(r,'p0'),{type:'dealRoles'});let steps=0;
 while(r.status==='playing'&&steps++<maxSteps){
  const g=r.game, alive=r.players.filter(p=>p.alive);
  if(g.phase==='roles'){for(const p of alive)if(!g.ready[p.id])act(r,who(r,p.id),{type:'ackRole'});continue;}
  if(g.phase==='nominate'){
   const p=who(r,g.presidentId);let opts=eligibleChancellors(r);if(!opts.length){g.lastChanc=null;g.lastPres=null;opts=eligibleChancellors(r);}act(r,p,{type:'nominate',target:pick(opts)});continue;
  }
  if(g.phase==='vote'){for(const p of alive)if(!(p.id in g.votes))act(r,who(r,p.id),{type:'vote',ja:rnd()<.57});continue;}
  if(g.phase==='legPres'){act(r,who(r,g.president),{type:'presDiscard',index:Math.floor(rnd()*3)});continue;}
  if(g.phase==='legChanc'){act(r,who(r,g.chancellor),{type:'chancEnact',index:Math.floor(rnd()*2)});continue;}
  if(g.phase==='veto'){act(r,who(r,g.president),{type:'vetoAnswer',agree:rnd()<.2});continue;}
  if(g.phase==='power'){
   const p=who(r,g.president);
   if(g.power==='peek'){act(r,p,{type:'powerAck'});continue;}
   let opts=alive.filter(x=>x.id!==g.presidentId);
   if(g.power==='investigate')opts=opts.filter(x=>!g.investigated.includes(x.id));
   if(!opts.length){act(r,p,{type:'powerAck'});continue;}
   act(r,p,{type:'power',target:pick(opts).id});continue;
  }
  if(g.phase==='powerAck'){act(r,who(r,g.president),{type:'powerAck'});continue;}
  if(g.phase==='commPower'||g.phase==='antiPower'){
   const p=who(r,g.president);
   if(g.power==='bugging'){act(r,p,{type:'commPower',target:pick(alive.filter(x=>x.id!==p.player.id)).id});continue;}
   if(g.power==='radicalisation'){
    const opts=g.radicalisationTargets||r.players.filter(x=>x.alive&&x.id!==p.player.id&&x.party!=='communist'&&!['hitler','capitalist'].includes(x.role)).map(x=>x.id);
    if(opts.length)act(r,p,{type:'commPower',target:pick(opts)});else act(r,p,{type:'skipPower'});continue;
   }
   if(g.power==='socialDemocratic'){
    const opts=[];if(g.fas>0)opts.push('fascist');if(g.comm>0)opts.push('communist');act(r,p,{type:'socialDemocraticChoice',track:opts.length?pick(opts):'none'});continue;
   }
   act(r,p,{type:'commPower'});continue;
  }
  if(g.phase==='emergency'){
   const actorId=g.currentEmergency.type==='article48'?g.president:g.chancellor;const p=who(r,actorId);const pow=g.currentEmergency.power; const ek=g.currentEmergency.type+':'+pow; emergencyStats[ek]=(emergencyStats[ek]||0)+1;
   if(['impeachment','marked','execution'].includes(pow)){act(r,p,{type:'emergency',target:pick(alive.filter(x=>x.id!==actorId)).id});continue;}
   if(pow==='pardon'){const id=g.markedForExecution&&g.markedForExecution.id;act(r,p,id?{type:'emergency',target:id}:{type:'emergency'});continue;}
   act(r,p,{type:'emergency'});continue;
  }
  if(g.phase==='emergencyPeek'){act(r,who(r,g.emergencyActor),{type:'emergencyPeekChoice',discard:g.currentEmergency.power==='propaganda'&&rnd()<.5});continue;}
  if(g.phase==='emergencyAck'){act(r,who(r,g.emergencyActor),{type:'emergencyAck'});continue;}
  throw new Error('unknown phase '+g.phase+' n='+n+' step='+steps);
 }
 if(r.status!=='ended')throw new Error('game stuck: n='+n+' phase='+r.game.phase+' steps='+steps+' emergency='+JSON.stringify(r.game.currentEmergency));
 return {n,steps,winner:r.game.winner,winners:r.game.winners,reason:r.game.reason,emergencyUsed:r.game.emergencyDeck?0:0};
}
const total=10000, byN={}, winners={}, reasons={}, stepsByN={}, errors=[];let maxSteps=0,totalSteps=0;
for(let i=0;i<total;i++){
 const n=7+(i%14);
 try{const g=oneGame(n);byN[n]=(byN[n]||0)+1;winners[g.winner]=(winners[g.winner]||0)+1;reasons[g.reason]=(reasons[g.reason]||0)+1;stepsByN[n]=(stepsByN[n]||0)+g.steps;maxSteps=Math.max(maxSteps,g.steps);totalSteps+=g.steps;}
 catch(e){errors.push({i,n,error:e.message});if(errors.length>=10)break;}
}
console.log(JSON.stringify({totalRequested:total,completed:Object.values(byN).reduce((a,b)=>a+b,0),byPlayerCount:byN,winners,reasons,emergencyStats,averageSteps:totalSteps/Math.max(1,Object.values(byN).reduce((a,b)=>a+b,0)),maxSteps,errors},null,2));
if(errors.length)process.exitCode=1;
