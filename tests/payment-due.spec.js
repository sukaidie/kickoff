import {test,expect} from '@playwright/test';
for(const role of ['host','member'])test(`booking-aware payments: ${role} sees Not due yet, paid records are retained`,async({page})=>{
 const host='11111111-1111-4111-8111-111111111111',uid=role==='host'?host:'22222222-2222-4222-8222-222222222222',user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 const game={id:'future',owner_id:host,title:'Unbooked game',venue:'Cosmo',match_date:'2099-01-09',match_time:'18:00:00',starts_at:'2099-01-09T17:00:00Z',cancelled:false,booked:false};
 const team=[{id:'host',name:'Host',user_id:host,paid:false,payment_due:false},{id:'paid',name:'Already paid',user_id:null,paid:true,payment_due:true}].map((p,i)=>({...p,match_id:game.id,added_by:host,created_at:`2026-11-02T12:00:0${i}Z`}));let bookingWrites=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let data=null;
 if(path.endsWith('/matches'))data=[game];if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;
 if(path.endsWith('/add_player')){const a=req.postDataJSON();team.push({id:'guest-'+team.length,name:a.p_name,user_id:null,added_by:uid,match_id:game.id,paid:false,payment_due:game.booked,created_at:`2026-11-02T12:01:0${team.length}Z`});}
 if(path.endsWith('/set_match_booked')){expect(role).toBe('host');game.booked=req.postDataJSON().p_booked;for(const p of team)p.payment_due=p.paid||game.booked;bookingWrites++;}
 if(path.endsWith('/set_player_paid')){expect(role).toBe('host');const a=req.postDataJSON(),p=team.find(p=>p.id===a.p_player);p.paid=a.p_paid;p.payment_due=p.paid||game.booked;}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/');const card=page.locator('.match-card');await expect(card.locator('.payment-status')).toHaveText(['Not due yet','Paid']);
 if(role==='member'){await expect(card.getByRole('button',{name:'Edit payment status',exact:true})).toHaveCount(0);await expect(card.getByRole('button',{name:'Edit booking status',exact:true})).toHaveCount(0);return;}
 await card.getByRole('button',{name:'Edit payment status',exact:true}).click();const pf=page.locator('#payment-form');await expect(pf.locator('option[value="false"]')).toHaveText('Not due yet');await pf.getByRole('button',{name:'Close',exact:true}).click();
 const add=async name=>{await card.getByRole('button',{name:'Add someone else',exact:true}).click();const f=page.locator('#player-form');await f.getByLabel('Player name').fill(name);await f.getByRole('button',{name:'Save player',exact:true}).click();await expect(f).not.toBeVisible();};
 await add('Before booking');await expect(card.locator('.payment-status')).toHaveText(['Not due yet','Paid','Not due yet']);
 const book=async value=>{await card.getByRole('button',{name:'Edit booking status',exact:true}).click();const f=page.locator('#booking-form');await f.getByLabel('Booking status',{exact:true}).selectOption(value);await f.getByRole('button',{name:'Save booking status',exact:true}).click();await expect(f).not.toBeVisible();};
 await book('true');await expect(card.locator('.payment-status')).toHaveText(['Unpaid','Paid','Unpaid']);await add('After booking');await expect(card.locator('.payment-status')).toHaveText(['Unpaid','Paid','Unpaid','Unpaid']);
 await card.getByRole('button',{name:'Edit payment status',exact:true}).click();await expect(pf.locator('option[value="false"]')).toHaveText('Unpaid');await pf.getByLabel('Payment status',{exact:true}).selectOption('true');await pf.getByRole('button',{name:'Save payment status',exact:true}).click();await expect(card.locator('.payment-status')).toHaveText(['Paid','Paid','Unpaid','Unpaid']);
 await book('false');await expect(card.locator('.payment-status')).toHaveText(['Paid','Paid','Not due yet','Not due yet']);expect(bookingWrites).toBe(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
