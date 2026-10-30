import {test} from 'node:test';
import assert from 'node:assert/strict';
import {duration,holiday,quote,shares,voucherPercent,berlinInstant,timeRange} from '../src/rules.js';
test('duration changes at the fifteenth player',()=>{assert.equal(duration(14),90);assert.equal(duration(15),120);assert.equal(duration(16),120);assert.equal(quote('Cosmo','2026-10-30','18:00',14),12000);assert.equal(quote('Cosmo','2026-10-30','18:00',15),16000);});
test('Cosmo bands and partial hours',()=>{assert.equal(quote('Cosmo','2026-10-30','10:00',1),6000);assert.equal(quote('Cosmo','2026-10-30','13:30',1),8400);assert.equal(quote('Cosmo','2026-10-30','16:30',1),11200);assert.equal(quote('Cosmo','2026-10-30','18:00',16),16000);});
test('weekends and NRW fixed and movable public holidays',()=>{for(const date of ['2026-04-03','2026-04-06','2026-05-14','2026-05-25','2026-06-04','2026-11-01','2026-12-25']){assert.equal(holiday(date),true,date);assert.equal(quote('Cosmo',date,'10:00',1),11400);}assert.equal(holiday('2026-10-31'),false);assert.equal(quote('Cosmo','2026-10-31','10:00',16),15200);});
test('unknown Merkur rate and Cosmo opening bounds',()=>{assert.equal(quote('Merkur Spiel-Arena','2026-10-30','18:00',1),null);assert.throws(()=>quote('Cosmo','2026-10-30','21:00',1));assert.throws(()=>quote('Cosmo','2026-10-30','09:00',1));assert.equal(quote('Cosmo','2026-10-30','20:00',16),16000);});
test('shares sum exactly to the invoice',()=>{for(const count of [1,3,7,15,16,23]){const values=shares(11400,count);assert.equal(values.reduce((a,b)=>a+b,0),11400);assert.ok(Math.max(...values)-Math.min(...values)<=1);}assert.deepEqual(shares(12000,0),[]);});
test('voucher boundaries',()=>{const now=Date.parse('2026-10-30T12:00:00Z');for(const [hours,result] of [[49,100],[48,50],[24,50],[23.99,0],[-1,0]])assert.equal(voucherPercent(new Date(now+hours*3600000),now),result);});
test('venue timezone is independent of browser and observes DST',()=>{assert.equal(berlinInstant('2026-07-01','18:00'),'2026-07-01T16:00:00.000Z');assert.equal(berlinInstant('2026-12-01','18:00'),'2026-12-01T17:00:00.000Z');});

test('display start and end times using live player count and venue timezone',()=>{
 assert.equal(timeRange('2026-10-30T17:00:00Z',14),'18:00–19:30');
 assert.equal(timeRange('2026-10-30T17:00:00Z',15),'18:00–20:00');
 assert.equal(timeRange('2026-07-01T16:00:00Z',1),'18:00–19:30');
 assert.equal(timeRange('2026-10-30T22:00:00Z',15),'23:00–01:00 (+1 day)');
});
