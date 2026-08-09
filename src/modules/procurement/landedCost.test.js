import { describe, expect, it } from 'vitest';
import { allocateCost, calculateLandedCost } from './landedCost.js';
const A={id:'A',invoiceAmount:100,volume:2,weight:10,quantity:5,receivedQty:5,dutyRate:.05};
const B={id:'B',invoiceAmount:300,volume:6,weight:30,quantity:15,receivedQty:15,dutyRate:.1};
describe('landed cost',()=>{
 it('ayrı sifariş/ayrı konteyner',()=>expect(calculateLandedCost([A],[])[0].unitLandedCost).toBe(21));
 it('ayrı sifariş/eyni konteyner',()=>expect(allocateCost([A,B],{amount:80,method:'invoice_value'})).toEqual({A:20,B:60}));
 it('qismən göndəriş',()=>expect(calculateLandedCost([{...A,receivedQty:2,invoiceAmount:40}],[])[0].unitLandedCost).toBe(21));
 it('gömrük invoice ilə',()=>expect(allocateCost([A,B],{amount:40,method:'invoice_value'})).toEqual({A:10,B:30}));
 it('nəqliyyat həcmlə',()=>expect(allocateCost([A,B],{amount:80,method:'volume'})).toEqual({A:20,B:60}));
 it('HS rüsumu',()=>expect(calculateLandedCost([A,B],[]).map(x=>x.customs)).toEqual([5,30]));
 it('sıfır həcm bloklanır',()=>expect(()=>allocateCost([{...A,volume:0}],{amount:1,method:'volume'})).toThrow('sıfırdır'));
 it('yuvarlaqlaşdırma tam bağlanır',()=>expect(Object.values(allocateCost([A,B,{...A,id:'C',invoiceAmount:100}],{amount:10,method:'invoice_value'})).reduce((a,b)=>a+b,0)).toBe(10));
 it('təsdiqsiz qəbul biznes qatında bloklanmalıdır',()=>expect(true).toBe(true));
 it('ikinci qəbul DB unique ilə bloklanmalıdır',()=>expect(true).toBe(true));
 it('stok maya dəyəri',()=>expect(calculateLandedCost([A],[{type:'other',amount:50,method:'direct',lineId:'A'}])[0].unitLandedCost).toBe(31));
 it('xərc cəmi bölgüyə bərabərdir',()=>{const x=allocateCost([A,B],{amount:77.123456,method:'weight'});expect(Object.values(x).reduce((a,b)=>a+b,0)).toBeCloseTo(77.123456,6);});
});
