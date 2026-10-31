export const money = cents => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);
export const duration = count => count >= 15 ? 120 : 90;
function easter(y) { const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114; return new Date(Date.UTC(y,Math.floor(n/31)-1,n%31+1)); }
export function holiday(date) {const y=+date.slice(0,4); if(['01-01','05-01','10-03','11-01','12-25','12-26'].includes(date.slice(5))) return true; return [-2,1,39,50,60].some(offset=>{const d=easter(y); d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)===date;});}
export function quote(venue,date,time,count) {if(venue==='Merkur Spiel-Arena')return 0;if(venue!=='Cosmo')return null;const weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())||holiday(date);const start=Number(time.slice(0,2))*60+Number(time.slice(3,5));const end=start+duration(count);if(start<600||end>1320)throw new Error('Cosmo games must fit between 10:00 and 22:00, including a possible 120-minute game.');let cents=0;for(let m=start;m<end;m++)cents+=(weekend?7600:m<840?4000:m<1020?6400:8000)/60;return Math.round(cents);}
export function shares(total,count) {return count ? Array.from({length:count},(_,i)=>Math.floor(total/count)+(i<total%count?1:0)) : [];}
export function voucherPercent(start,now=Date.now()) {const hours=(new Date(start).getTime()-now)/3600000;return hours>48?100:hours>=24?50:0;}
// Convert a venue-local wall clock to an instant, independently of the visitor's timezone.
export function berlinInstant(date,time) {let value=new Date(`${date}T${time}:00Z`);for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);value=new Date(+value+Date.parse(`${date}T${time}:00Z`)-represented);}return value.toISOString();}

export function timeRange(startsAt,count) {
 const start=new Date(startsAt),end=new Date(+start+duration(count)*60000);
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
 return `${time.format(start)}–${time.format(end)}${day.format(start)!==day.format(end)?' (+1 day)':''}`;
}

export function scheduleView(matches,view,now=Date.now()) {
 const upcoming=m=>!m.cancelled&&Date.parse(m.starts_at)>now;
 return matches.filter(m=>view==='Upcoming matches'?upcoming(m):!upcoming(m))
  .sort((a,b)=>view==='Upcoming matches'?Date.parse(a.starts_at)-Date.parse(b.starts_at):Date.parse(b.starts_at)-Date.parse(a.starts_at));
}

export function paymentTrackingAvailable(match) {
 return match.venue==='Cosmo'&&!match.cancelled;
}

export function attendanceRanking(matches,players,now=Date.now()) {
 const byMatch=new Map();
 for(const player of players){if(!byMatch.has(player.match_id))byMatch.set(player.match_id,[]);byMatch.get(player.match_id).push(player);}
 const totals=new Map();
 for(const match of matches){
  const team=byMatch.get(match.id)||[];
  if(match.cancelled||/^TEST\s*·/i.test(match.title||'')||Date.parse(match.starts_at)+duration(team.length)*60000>now)continue;
  if(!Number.isFinite(Date.parse(match.starts_at)))continue;
  const seen=new Set();
  for(const player of team){
   if(match.venue==='Merkur Spiel-Arena'&&!player.confirmed)continue;
   const name=String(player.name||'').normalize('NFKC').trim().replace(/\s+/g,' '),key=name.toLocaleLowerCase('en');
   if(!key||seen.has(key))continue;seen.add(key);
   const entry=totals.get(key)||{name,count:0};entry.count++;totals.set(key,entry);
  }
 }
 const sorted=[...totals.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'en'));
 return sorted.map((entry,i)=>({...entry,rank:i&&sorted[i-1].count===entry.count?sorted.findIndex(p=>p.count===entry.count)+1:i+1}));
}
