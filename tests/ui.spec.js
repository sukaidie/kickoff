import {test,expect} from '@playwright/test';
test('configured site reports backend errors and remains responsive; form calculates quote',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({msg:'Test backend unavailable',message:'Test backend unavailable'})}));await page.goto('/');await expect(page.getByRole('heading',{name:'Match schedule'})).toBeVisible();await expect(page.getByRole('status')).toContainText('Connection unavailable: Test backend unavailable');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#new-top').click();await page.getByLabel('Match name').fill('Friday football');await page.getByLabel('Date',{exact:true}).fill('2027-01-08');await page.getByLabel('Kick-off time').fill('13:30');await expect(page.locator('#estimate')).toContainText('€84.00');await page.getByLabel('Your name',{exact:true}).first().fill('Alex');await page.getByRole('button',{name:'Create match & join'}).click();await expect(page.locator('#create-form .form-error')).toContainText('Test backend unavailable');await page.getByRole('button',{name:'Close',exact:true}).first().click();await page.getByRole('button',{name:'Merkur Spiel-Arena',exact:true}).click();await expect(page.getByRole('heading',{name:'No matches yet'})).toBeVisible();expect(errors).toEqual([]);});

test('squad expansion survives polling and filtering; only organiser can delete',async({page})=>{
 await page.clock.install();
 const uid='11111111-1111-4111-8111-111111111111';
 const other='22222222-2222-4222-8222-222222222222';
 const user={id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:4102444800})).toString('base64url')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-pikwbxrctsfgnqipuevz-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user})),{user,token});
 let games=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_id:uid,title:'My test match',venue:'Cosmo',match_date:'2099-01-09',match_time:'18:00:00',starts_at:'2099-01-09T17:00:00Z',cancelled:true},{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:other,title:'Another organiser match',venue:'Cosmo',match_date:'2099-01-10',match_time:'18:00:00',starts_at:'2099-01-10T17:00:00Z',cancelled:false}];
 let deletes=0,matchReads=0,playerName='Alex';
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',async route=>{
  const r=route.request(),u=new URL(r.url());let data=[];
  if(u.pathname.endsWith('/matches')){if(r.method()==='DELETE'){expect(u.searchParams.get('id')).toBe('eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');deletes++;data=[{id:games[0].id}];games=games.slice(1);}else {data=games;matchReads++;}}
  if(u.pathname.endsWith('/players'))data=[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',match_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:uid,name:playerName,created_at:'2026-10-30T12:00:00Z'}];
  if(u.pathname.endsWith('/user'))data=user;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');
 const own=page.locator('.match-card').filter({hasText:'My test match'});
 const otherCard=page.locator('.match-card').filter({hasText:'Another organiser match'});
 await expect(own.getByRole('button',{name:'Delete match'})).toBeVisible();
 await expect(otherCard.getByRole('button',{name:'Delete match'})).toHaveCount(0);
 await own.locator('summary').click();
 await expect(own.locator('details')).toHaveAttribute('open','');
 const reads=matchReads;playerName='Updated player';
 await page.clock.fastForward(10000);
 await expect.poll(()=>matchReads).toBeGreaterThan(reads);
 await expect(own.locator('.squad')).toContainText('Updated player');
 await expect(own.locator('details')).toHaveAttribute('open','');
 await page.getByRole('button',{name:'Merkur Spiel-Arena',exact:true}).click();
 await expect(own).toHaveCount(0);
 await page.getByRole('button',{name:'All venues',exact:true}).click();
 await expect(own.locator('details')).toHaveAttribute('open','');
 await own.locator('summary').click();
 await expect(own.locator('details')).not.toHaveAttribute('open','');
 const afterClose=matchReads;await page.clock.fastForward(10000);
 await expect.poll(()=>matchReads).toBeGreaterThan(afterClose);
 await expect(own.locator('details')).not.toHaveAttribute('open','');

 page.once('dialog',dialog=>dialog.dismiss());await own.getByRole('button',{name:'Delete match'}).click();expect(deletes).toBe(0);
 page.once('dialog',async dialog=>{expect(dialog.message()).toContain('all player entries');await dialog.accept();});
 await own.getByRole('button',{name:'Delete match'}).click();
 await expect(own).toHaveCount(0);await expect(otherCard).toBeVisible();await expect(page.getByRole('status')).toContainText('Match deleted.');expect(deletes).toBe(1);
});
