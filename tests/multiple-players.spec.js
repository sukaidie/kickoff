import {test,expect} from '@playwright/test';
test('non-host can add multiple players and manage their entries without gaining host permissions',async({page})=>{
 const uid='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111',mid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 const game={id:mid,owner_id:owner,title:'Ordinary user group',venue:'Cosmo',match_date:'2099-01-09',match_time:'18:00:00',starts_at:'2099-01-09T17:00:00Z',cancelled:false};
 let team=Array.from({length:14},(_,i)=>({id:`existing-${i}`,match_id:mid,user_id:i===0?owner:null,added_by:owner,name:`Existing ${i}`,created_at:`2026-10-30T12:00:${String(i).padStart(2,'0')}Z`}));let next=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=null;
  if(path.endsWith('/matches'))data=[game];if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;
  if(path.includes('/rpc/')){const args=req.postDataJSON();expect(args.p_match).toBe(mid);
   if(path.endsWith('/add_player'))team.push({id:`new-${++next}`,match_id:mid,user_id:null,added_by:uid,name:args.p_name,created_at:`2026-10-30T12:01:0${next}Z`});
   else if(path.endsWith('/edit_player')){const p=team.find(p=>p.id===args.p_player);expect(p.added_by).toBe(uid);p.name=args.p_name;}
   else if(path.endsWith('/remove_player')){expect(team.find(p=>p.id===args.p_player).added_by).toBe(uid);team=team.filter(p=>p.id!==args.p_player);}
   else throw new Error('Unexpected RPC: '+path);
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');const card=page.locator('.match-card');const pf=page.locator('#player-form');
 await expect(card.getByRole('button',{name:'Add player',exact:true})).toBeVisible();await expect(card.locator('.match-date')).toContainText('18:00–19:30');
 for(const label of ['Edit match','Cancel match','Delete match'])await expect(card.getByRole('button',{name:label,exact:true})).toHaveCount(0);
 await expect(card.getByRole('button',{name:'Remove Existing 1',exact:true})).toHaveCount(0);
 const initialPrice=await card.locator('.price').innerText();
 for(const [name,count] of [['Friend one',15],['Friend two',16]]){await card.getByRole('button',{name:'Add player',exact:true}).click();await pf.getByLabel('Player name').fill(name);await pf.getByRole('button',{name:'Save player'}).click();await expect(card.locator('.facts')).toContainText(`${count} players`);}
 await expect(card.locator('.match-date')).toContainText('18:00–20:00');await expect(card.locator('.price')).not.toHaveText(initialPrice,{useInnerText:true});await expect(card.locator('.player-number')).toHaveText(Array.from({length:16},(_,i)=>String(i+1)));
 await card.getByRole('button',{name:'Edit Friend one',exact:true}).click();await pf.getByLabel('Player name').fill('Renamed friend');await pf.getByRole('button',{name:'Save player'}).click();await expect(card.locator('.squad')).toContainText('Renamed friend');
 for(const [name,count] of [['Renamed friend',15],['Friend two',14]]){page.once('dialog',d=>d.accept());await card.getByRole('button',{name:`Remove ${name}`,exact:true}).click();await expect(card.locator('.facts')).toContainText(`${count} players`);}
 await expect(card.locator('.match-date')).toContainText('18:00–19:30');await expect(card.locator('.price')).toHaveText(initialPrice,{useInnerText:true});await expect(card.locator('.player-number')).toHaveText(Array.from({length:14},(_,i)=>String(i+1)));
 await expect(card.getByRole('button',{name:'Click to join',exact:true})).toBeVisible();await expect(card.locator('.host-badge')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
