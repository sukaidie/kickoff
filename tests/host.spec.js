import {test,expect} from '@playwright/test';
import {berlinInstant} from '../src/rules.js';
test('host adds, renames, removes players and edits match details with live costs',async({page})=>{
 const uid='11111111-1111-4111-8111-111111111111',mid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 let game={id:mid,owner_id:uid,title:'Host management',venue:'Cosmo',match_date:'2099-01-09',match_time:'18:00:00',starts_at:berlinInstant('2099-01-09','18:00'),cancelled:false};
 let team=Array.from({length:14},(_,i)=>({id:`player-${i}`,match_id:mid,user_id:i===0?uid:null,name:i===0?'Host':`Player ${i}`,created_at:`2026-10-30T12:00:${String(i).padStart(2,'0')}Z`}));
 const other={...game,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:'22222222-2222-4222-8222-222222222222',title:'Other organiser'};
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=null,status=200;
  if(path.endsWith('/matches'))data=[game,other];
  if(path.endsWith('/players'))data=team;
  if(path.endsWith('/user'))data=user;
  if(path.includes('/rpc/')){
   const args=req.postDataJSON();expect(args.p_match).toBe(mid);
   if(path.endsWith('/leave_match'))team=team.filter(p=>p.user_id!==uid);
   if(path.endsWith('/host_add_player')){expect(args.p_name).toBe('New guest');team.push({id:'added-guest',match_id:mid,user_id:null,name:args.p_name,created_at:'2026-10-30T12:01:00Z'});}
   if(path.endsWith('/host_edit_player')){const p=team.find(p=>p.id===args.p_player);expect(p).toBeTruthy();p.name=args.p_name;}
   if(path.endsWith('/host_remove_player'))team=team.filter(p=>p.id!==args.p_player);
   if(path.endsWith('/host_edit_match')){
    if(args.p_title==='Rejected'){status=400;data={message:'Update rejected for testing'};}
    else{game={...game,title:args.p_title,venue:args.p_venue,match_date:args.p_date,match_time:args.p_time,starts_at:berlinInstant(args.p_date,args.p_time)};}
   }
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');
 const card=page.locator('.match-card').filter({hasText:'Host management'});
 const foreign=page.locator('.match-card').filter({hasText:'Other organiser'});
 await expect(foreign.getByRole('button',{name:'Edit match',exact:true})).toHaveCount(0);
 await expect(foreign.getByRole('button',{name:'Add player',exact:true})).toHaveCount(0);
 await expect(card.locator('.match-date')).toContainText('18:00–19:30');
 await expect(card.locator('.player-number')).toHaveText(Array.from({length:14},(_,i)=>String(i+1)));
 const before=await card.locator('.price').innerText();
 await card.getByRole('button',{name:'Add player',exact:true}).click();
 const pf=page.locator('#player-form');await pf.getByLabel('Player name').fill('New guest');await pf.getByRole('button',{name:'Save player'}).click();
 await expect(card.locator('.facts')).toContainText('15 players');await expect(card.locator('.player-number')).toHaveText(Array.from({length:15},(_,i)=>String(i+1)));await expect(card.locator('.match-date')).toContainText('18:00–20:00');
 await expect(card.locator('.price')).not.toHaveText(before);
 await card.getByRole('button',{name:'Edit New guest',exact:true}).click();await pf.getByLabel('Player name').fill('Renamed guest');await pf.getByRole('button',{name:'Save player'}).click();await expect(card.locator('.squad')).toContainText('Renamed guest');
 page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Remove Renamed guest',exact:true}).click();await expect(card.locator('.facts')).toContainText('14 players');await expect(card.locator('.player-number')).toHaveText(Array.from({length:14},(_,i)=>String(i+1)));await expect(card.locator('.match-date')).toContainText('18:00–19:30');
 await card.getByRole('button',{name:'Edit match',exact:true}).click();const mf=page.locator('#edit-match-form');await expect(mf.getByLabel('Match name')).toHaveValue('Host management');expect(await page.locator('#edit-match-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
 await mf.getByLabel('Match name').fill('Rejected');await mf.getByRole('button',{name:'Save changes'}).click();await expect(mf.locator('.form-error')).toContainText('Update rejected for testing');await expect(mf).toBeVisible();
 await mf.getByLabel('Match name').fill('Updated match');await mf.getByLabel('Venue').selectOption('Merkur Spiel-Arena');await mf.getByLabel('Date',{exact:true}).fill('2099-01-11');await expect(mf.getByLabel('Kick-off time')).not.toHaveAttribute('min');await expect(mf.getByLabel('Kick-off time')).not.toHaveAttribute('max');await mf.getByLabel('Kick-off time').fill('23:30');await mf.getByRole('button',{name:'Save changes'}).click();
 const updated=page.locator('.match-card').filter({hasText:'Updated match'});await expect(updated).toBeVisible();await expect(updated.locator('.match-date')).toContainText('23:30–01:00 (+1 day)');await expect(updated.locator('.price strong')).toHaveText('Free');await expect(updated.locator('.price')).not.toContainText('/ player');await expect(updated.locator('.squad .player-controls>b')).toHaveText(Array(14).fill('Free'));await expect(updated.locator('.cancellation-notice')).toHaveCount(0);await expect(updated.locator('.venue-label')).toContainText('Merkur Spiel-Arena');
 await expect(updated.locator('.host-badge')).toHaveText('Host');await expect(updated.getByRole('button',{name:'Edit match',exact:true})).toBeVisible();await expect(updated.getByRole('button',{name:'Add player',exact:true})).toBeVisible();
 await updated.getByRole('button',{name:'Leave match',exact:true}).click();await expect(updated.locator('.facts')).toContainText('13 players');await expect(updated.locator('.host-badge')).toHaveText('Host');await expect(updated.getByRole('button',{name:'Edit match',exact:true})).toBeVisible();await expect(updated.getByRole('button',{name:'Add player',exact:true})).toBeVisible();await expect(updated.getByRole('button',{name:'Cancel match',exact:true})).toBeVisible();await expect(updated.getByRole('button',{name:'Delete match',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
