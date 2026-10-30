import {test,expect} from '@playwright/test';
test('date and time inputs fit the create dialog at narrow mobile and tablet widths',async({page})=>{
 await page.route('https://pikwbxrctsfgnqipuevz.supabase.co/**',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({msg:'Offline layout check'})}));
 await page.goto('/');await page.locator('#new-top').click();
 for(const width of [320,375,390,640,768]){
  await page.setViewportSize({width,height:900});
  const geometry=await page.locator('#create-dialog').evaluate(dialog=>{const d=dialog.getBoundingClientRect();const fields=[...dialog.querySelectorAll('.form-row input')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};});return {left:d.left,right:d.right,overflow:dialog.scrollWidth>dialog.clientWidth,fields};});
  expect(geometry.overflow,`dialog overflow at ${width}px`).toBe(false);
  for(const field of geometry.fields){expect(field.left).toBeGreaterThanOrEqual(geometry.left);expect(field.right).toBeLessThanOrEqual(geometry.right);expect(field.width).toBeGreaterThan(100);}
  if(width<=640)expect(geometry.fields[1].top).toBeGreaterThanOrEqual(geometry.fields[0].bottom);
  await page.locator('#create-form').getByLabel('Venue').selectOption('Merkur Spiel-Arena');await page.locator('#create-form').getByLabel('Kick-off time').fill('23:30');await expect(page.locator('#create-form').getByLabel('Kick-off time')).toHaveValue('23:30');
 }
});
