import {test,expect} from '@playwright/test';
import {berlinInstant} from '../src/rules.js';
test('past host can add a player while other and cancelled games stay closed',async({page})=>{
 const uid='11111111-1111-4111-8111-111111111111',mid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 let game={id:mid,owner_id:uid,title:'Host management',venue:'Cosmo',match_date:'2020-01-09',match_time:'18:00:00',starts_at:berlinInstant('2020-01-09','18:00'),cancelled:false};
 let team=Array.from({length:14},(_,i)=>({id:`player-${i}`,match_id:mid,user_id:i===0?uid:i===1?'33333333-3333-4333-8333-333333333333':null,name:i===0?'Host':`Player ${i}`,created_at:`2026-10-30T12:00:${String(i).padStart(2,'0')}Z`}));
 const other={...game,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:'22222222-2222-4222-8222-222222222222',title:'Other organiser'};
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=null,status=200;
  if(path.endsWith('/matches'))data=[game,other,{...game,id:'cancelled',title:'Cancelled game',cancelled:true}];
  if(path.endsWith('/players'))data=team;
  if(path.endsWith('/user'))data=user;
  if(path.includes('/rpc/')){
   const args=req.postDataJSON();expect(args.p_match).toBe(mid);
   if(path.endsWith('/leave_match'))team=team.filter(p=>p.user_id!==uid);
   if(path.endsWith('/add_player')){expect(args.p_name).toBe('New guest');team.push({id:'added-guest',match_id:mid,user_id:null,name:args.p_name,created_at:'2026-10-30T12:01:00Z'});}
   if(path.endsWith('/edit_player')){const p=team.find(p=>p.id===args.p_player);expect(p).toBeTruthy();p.name=args.p_name;}
   if(path.endsWith('/remove_player'))team=team.filter(p=>p.id!==args.p_player);
   if(path.endsWith('/host_edit_match')){
    if(args.p_title==='Rejected'){status=400;data={message:'Update rejected for testing'};}
    else{game={...game,title:args.p_title,venue:args.p_venue,match_date:args.p_date,match_time:args.p_time,starts_at:berlinInstant(args.p_date,args.p_time)};}
   }
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Past matches',exact:true}).click();
 const card=page.locator('.match-card').filter({hasText:'Host management'});
 await expect(page.locator('[data-add-player]')).toHaveCount(1);
 await card.getByRole('button',{name:'Add someone else',exact:true}).click();
 const form=page.locator('#player-form');await form.getByLabel('Player name').fill('New guest');await form.getByRole('button',{name:'Save player'}).click();
 await expect(card.locator('.facts')).toContainText('15 players');
 await card.locator('summary').click();await expect(card.locator('.squad')).toContainText('New guest');
 await expect(card.locator('[data-join]')).toHaveCount(0);
});
