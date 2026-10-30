import {test,expect} from '@playwright/test';
for(const role of ['host','player'])test(`completed Cosmo payment labels are visible; ${role} permissions are enforced in the UI`,async({page})=>{
 const now=Date.parse('2026-10-30T12:00:00Z');await page.clock.install({time:now});
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222',uid=role==='host'?host:guest;
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true},token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 const base={owner_id:host,venue:'Cosmo',match_date:'2026-10-29',match_time:'18:00:00',starts_at:'2026-10-29T17:00:00Z',cancelled:false};
 const games=[{...base,id:'done',title:'Completed Cosmo'},{...base,id:'free',title:'Completed Merkur',venue:'Merkur Spiel-Arena'},{...base,id:'cancelled',title:'Cancelled Cosmo',cancelled:true},{...base,id:'progress',title:'Still playing',match_date:'2026-10-30',match_time:'11:15:00',starts_at:'2026-10-30T10:15:00Z'}];
 const team=games.flatMap(g=>Array.from({length:g.id==='progress'?15:2},(_,i)=>({id:g.id+'-'+i,match_id:g.id,user_id:i?guest:host,added_by:host,name:i?'Alex':'Host',paid:!!i,created_at:`2026-10-29T12:00:${String(i).padStart(2,'0')}Z`})));let writes=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let data=null;if(path.endsWith('/matches'))data=games;if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;
 if(path.endsWith('/set_player_paid')){expect(role).toBe('host');const args=req.postDataJSON();expect(args.p_match).toBe('done');const p=team.find(p=>p.id===args.p_player);p.paid=args.p_paid;writes++;}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/');await expect(page.locator('#create-payment-demo')).toHaveCount(0);await page.getByRole('button',{name:'Past matches',exact:true}).click();
 const card=page.locator('.match-card').filter({has:page.getByRole('heading',{name:'Completed Cosmo',exact:true})});
 await expect(card.locator('.payment-status')).toHaveText(['Unpaid','Paid']);await expect(card.locator('.badge.muted')).toHaveText('Finished');
 for(const title of ['Completed Merkur','Cancelled Cosmo','Still playing'])await expect(page.locator('.match-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).locator('.payment-status')).toHaveCount(0);
 await expect(page.locator('.match-card').filter({hasText:'Still playing'}).locator('.badge.muted')).toHaveText('In progress');
 if(role==='host'){const price=await card.locator('.price').innerText();await card.getByRole('button',{name:'Mark Host as paid',exact:true}).click();await expect(card.locator('.payment-status')).toHaveText(['Paid','Paid']);await card.getByRole('button',{name:'Mark Host as unpaid',exact:true}).click();await expect(card.locator('.payment-status')).toHaveText(['Unpaid','Paid']);expect(writes).toBe(2);await expect(card.locator('.price')).toHaveText(price,{useInnerText:true});}
 else{await expect(card.locator('.payment-toggle')).toHaveCount(0);expect(writes).toBe(0);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('special demo entry creates one completed fixture for the current browser host',async({page})=>{
 const uid='11111111-1111-4111-8111-111111111111',user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 let games=[],team=[],calls=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{const path=new URL(route.request().url()).pathname;let data=null;
 if(path.endsWith('/create_payment_demo')){calls++;if(!games.length){games=[{id:'demo',owner_id:uid,title:'TEST · Cosmo payment status',venue:'Cosmo',match_date:'2020-01-09',match_time:'18:00:00',starts_at:'2020-01-09T17:00:00Z',cancelled:false}];team=['Demo Host','Demo Player 1','Demo Player 2'].map((name,i)=>({id:'demo-'+i,match_id:'demo',user_id:i?null:uid,added_by:uid,name,paid:i===1,created_at:`2020-01-09T12:00:0${i}Z`}));}data='demo';}
 if(path.endsWith('/matches'))data=games;if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/?payment-demo=1');await expect(page.getByRole('button',{name:'Past matches',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Create payment demo',exact:true}).click();const card=page.locator('.match-card');await expect(card.getByRole('heading',{name:'TEST · Cosmo payment status',exact:true})).toBeVisible();await expect(card.locator('.payment-status')).toHaveText(['Unpaid','Paid','Unpaid']);await expect(card.locator('.payment-toggle')).toHaveCount(3);await expect(card.locator('.host-badge')).toHaveText('Host');
 await page.getByRole('button',{name:'Create payment demo',exact:true}).click();await expect.poll(()=>calls).toBe(2);await expect(page.locator('.match-card')).toHaveCount(1);
});
