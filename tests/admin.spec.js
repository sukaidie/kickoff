import {test,expect} from '@playwright/test';
test('Admin password gate enables all record controls and exit restores normal permissions',async({page})=>{
 const uid='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111';const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,jwt})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,jwt});
 let games=[{id:'foreign',owner_id:owner,title:'Other host past match',venue:'Cosmo',match_date:'2020-01-09',match_time:'18:00:00',starts_at:'2020-01-09T17:00:00Z',cancelled:true},{id:'readonly',owner_id:owner,title:'Untouched record',venue:'Merkur Spiel-Arena',match_date:'2020-01-10',match_time:'09:00:00',starts_at:'2020-01-10T08:00:00Z',cancelled:false}];
 let team=[{id:'original',match_id:'foreign',user_id:owner,added_by:owner,name:'Other host',paid:false,confirmed:true,created_at:'2020-01-01T12:00:00Z'}];const mutations=[];let logout=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let data=null;
 if(path.endsWith('/matches'))data=games;if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;
 if(path.endsWith('/admin_login'))data=req.postDataJSON().p_password==='test-admin-password'?{ok:true,token:'opaque-admin-token',expires_at:new Date(Date.now()+3600000).toISOString()}:{ok:false,message:'Incorrect password'};
 if(path.endsWith('/admin_logout')){expect(req.postDataJSON().p_token).toBe('opaque-admin-token');logout++;}
 if(path.endsWith('/admin_mutate')){const args=req.postDataJSON();expect(args.p_token).toBe('opaque-admin-token');mutations.push(args.p_action);const d=args.p_data,m=games.find(m=>m.id===d.match);data=d.match||'created';
  switch(args.p_action){
   case 'edit_match':Object.assign(m,{title:d.title,venue:d.venue,match_date:d.date,match_time:d.time,cancelled:d.cancelled,starts_at:d.date+'T'+d.time+':00Z'});break;
   case 'add_player':team.push({id:'extra',match_id:d.match,user_id:null,added_by:uid,name:d.name,paid:false,confirmed:true,created_at:'2020-01-02T12:00:00Z'});break;
   case 'edit_player':team.find(p=>p.id===d.player).name=d.name;break;
   case 'set_paid':team.find(p=>p.id===d.player).paid=d.paid;break;
   case 'remove_player':team=team.filter(p=>p.id!==d.player);break;
   case 'cancel_match':m.cancelled=true;break;
   case 'delete_match':games=games.filter(m=>m.id!==d.match);team=team.filter(p=>p.match_id!==d.match);break;
   case 'create_match':games.push({id:'created',owner_id:uid,title:d.title,venue:d.venue,match_date:d.date,match_time:d.time,starts_at:d.date+'T'+d.time+':00Z',cancelled:false});break;
   default:throw new Error('Unexpected admin action');
  }
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/');await page.getByRole('button',{name:'Past matches',exact:true}).click();
 const target=page.locator('.match-card').filter({hasText:'Other host past match'});await expect(target.getByRole('button',{name:'Edit match',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Admin',exact:true}).click();const af=page.locator('#admin-form');await af.getByLabel('Password').fill('wrong');await af.getByRole('button',{name:'Unlock Admin'}).click();await expect(af.locator('.form-error')).toContainText('Incorrect password');await expect(af.getByLabel('Password')).toHaveValue('');
 await af.getByLabel('Password').fill('test-admin-password');await af.getByRole('button',{name:'Unlock Admin'}).click();await expect(page.locator('#admin-banner')).toBeVisible();await expect(target.getByRole('button',{name:'Edit match',exact:true})).toBeVisible();
 await target.getByRole('button',{name:'Edit match',exact:true}).click();const ef=page.locator('#edit-match-form');await expect(ef.getByLabel('Cancelled',{exact:true})).toBeChecked();await ef.getByLabel('Cancelled',{exact:true}).uncheck();await ef.getByRole('button',{name:'Save changes'}).click();
 await target.getByRole('button',{name:'Add someone else',exact:true}).click();const pf=page.locator('#player-form');await pf.getByLabel('Player name').fill('Admin addition');await pf.getByRole('button',{name:'Save player'}).click();await expect(target.locator('.squad')).toContainText('Admin addition');
 await target.getByRole('button',{name:'Edit Admin addition',exact:true}).click();await pf.getByLabel('Player name').fill('Updated name');await pf.getByRole('button',{name:'Save player'}).click();
 await target.getByRole('button',{name:'Edit payment status',exact:true}).click();const pay=page.locator('#payment-form');await pay.getByLabel('Player',{exact:true}).selectOption('extra');await pay.getByLabel('Payment status',{exact:true}).selectOption('true');await pay.getByRole('button',{name:'Save payment status'}).click();await expect(target.locator('.payment-status')).toHaveText(['Unpaid','Paid']);
 page.once('dialog',d=>d.accept());await target.getByRole('button',{name:'Remove Updated name',exact:true}).click();await expect(target.locator('.squad li')).toHaveCount(1);
 page.once('dialog',d=>d.accept());await target.getByRole('button',{name:'Cancel match',exact:true}).click();await expect(target.locator('.badge.muted')).toHaveText('Cancelled');
 await page.locator('#new-top').click();const cf=page.locator('#create-form');await expect(cf.getByLabel('Date',{exact:true})).not.toHaveAttribute('min');await cf.getByLabel('Match name').fill('Admin-created past match');await cf.getByLabel('Date',{exact:true}).fill('2020-01-12');await cf.getByLabel('Your name').fill('Admin');await cf.getByRole('button',{name:'Create match & join',exact:true}).click();await expect(page.getByRole('heading',{name:'Admin-created past match',exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await target.getByRole('button',{name:'Delete match',exact:true}).click();await expect(target).toHaveCount(0);
 await page.getByRole('button',{name:'Exit Admin',exact:true}).click();await expect(page.locator('#admin-banner')).toBeHidden();expect(logout).toBe(1);const readonly=page.locator('.match-card').filter({hasText:'Untouched record'});await expect(readonly.getByRole('button',{name:'Edit match',exact:true})).toHaveCount(0);await expect(readonly.getByRole('button',{name:'Delete match',exact:true})).toHaveCount(0);
 expect(mutations).toEqual(expect.arrayContaining(['edit_match','add_player','edit_player','set_paid','remove_player','cancel_match','create_match','delete_match']));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
