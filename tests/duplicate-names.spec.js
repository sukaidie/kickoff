import {test,expect} from '@playwright/test';
for(const venue of ['Cosmo','Merkur Spiel-Arena'])test(`${venue}: duplicate names show feedback and never register twice`,async({page})=>{
 const uid='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111',user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 const game={id:'game',owner_id:owner,title:'Duplicate names',venue,match_date:'2099-01-09',match_time:'18:00:00',starts_at:'2099-01-09T17:00:00Z',cancelled:false};
 const team=[{id:'existing',match_id:'game',user_id:owner,added_by:owner,name:'Alex Lee',created_at:'2026-11-10T12:00:00Z'}];let joins=0,adds=0;
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let data=null;
 if(path.endsWith('/matches'))data=[game];if(path.endsWith('/players'))data=team;if(path.endsWith('/user'))data=user;
 if(path.endsWith('/add_player'))adds++;
 if(path.endsWith('/join_match')){joins++;const a=req.postDataJSON();if(a.p_name==='Racer'){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'This name is already registered.',code:'23505'})});return;}expect(a.p_name).toBe('Different name');team.push({id:'new',match_id:'game',user_id:uid,added_by:uid,name:a.p_name,created_at:'2026-11-10T12:01:00Z'});}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/');const card=page.locator('.match-card');await card.getByRole('button',{name:'Click to join',exact:true}).click();const form=page.locator('#join-form');
 for(const name of ['alex lee','  ALEX   LEE  ','ＡＬＥＸ　ＬＥＥ']){await form.getByLabel('Your name',{exact:true}).fill(name);await form.getByRole('button',{name:'Click to join',exact:true}).click();await expect(form.locator('.form-error')).toHaveText('This name is already registered.');await expect(card.locator('.squad li')).toHaveCount(1);expect(joins).toBe(0);}
 await form.getByLabel('Your name',{exact:true}).fill('racer');await form.getByRole('button',{name:'Click to join',exact:true}).click();await expect(form.locator('.form-error')).toHaveText('This name is already registered.');expect(joins).toBe(1);await expect(form).toBeVisible();await form.getByRole('button',{name:'Close',exact:true}).click();
 await card.getByRole('button',{name:'Add someone else',exact:true}).click();const extra=page.locator('#player-form');await extra.getByLabel('Player name').fill('Alex Lee');await extra.getByRole('button',{name:'Save player'}).click();await expect(extra.locator('.form-error')).toHaveText('This name is already registered.');expect(adds).toBe(0);await extra.getByRole('button',{name:'Close',exact:true}).click();
 await card.getByRole('button',{name:'Click to join',exact:true}).click();await form.getByLabel('Your name',{exact:true}).fill('different name');await form.getByRole('button',{name:'Click to join',exact:true}).click();await expect(form).not.toBeVisible();await expect(card.locator('.player-display-name')).toHaveText(['Alex Lee','Different name']);expect(joins).toBe(2);
});
